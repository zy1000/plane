# 工作项类型库（第二步，数据）：每个工作区原来每个研发模式各有一个模式方案，合并成一个「工作项类型库」。
#
# 每个工作区：
# 1. 选默认模式（混合模型；没有或它的方案是空的就取类型最多的那个）的方案作为类型库，改名，行 id 全不变。
# 2. 其他模式方案的类型按系统标识、再按名字对到库里：对上的 → 该模式关联库里那个类型；
#    对不上的 → 整个类型（字段、状态、工作流、流转）改挂到库里再关联。
# 3. 指向被合并方案的跟随项目改指向库：默认状态、角色里的类型权限 key、项目内保存的筛选条件按对照表换 id。
#    被合并方案里的类型 / 状态 / 字段 / 流转若被任何工作项、草稿、字段值、审批记录引用就中止
#    （本地实测为 0；生产此前没上过模式方案）。
# 4. 研发模式视图从挂方案改挂模式（IssueView.dev_mode），条件里的旧 id 换成库 id。
# 5. 被合并掉的方案及其配置行硬删（不能走软删级联：它把 RESTRICT 当 CASCADE）。
# 6. 通用字段库：库里的类型字段按名字建库字段，同名定义完全一致的挂上 library_field；不一致的取最多的那份，
#    其余留作私有字段。项目自定义方案里的字段不动。

import json
from collections import Counter, OrderedDict

from django.db import migrations
from django.db.models import Q

LIBRARY_NAME = "工作项类型库"
DEFAULT_DEV_MODE_NAME = "混合模型"
SYSTEM_KEY_ORDER = {"epic": 0, "feature": 1, "story": 2, "task": 3, "bug": 4}
DEFINITION_COLUMNS = (
    "name",
    "description",
    "logo_props",
    "field_type",
    "is_required",
    "is_active",
    "options",
    "default_value",
    "validation",
)


def _normalize_options(field_type, options):
    options = options if isinstance(options, dict) else (options or {})
    if field_type == "text" and not options.get("text_mode"):
        options = {**options, "text_mode": "single_line"}
    return options


def _replace_ids(value, str_map):
    if not value or not str_map:
        return value, False
    text = json.dumps(value, ensure_ascii=False)
    new_text = text
    for old, new in str_map.items():
        new_text = new_text.replace(old, new)
    if new_text == text:
        return value, False
    return json.loads(new_text), True


def consolidate(apps, schema_editor):
    IssueScheme = apps.get_model("db", "IssueScheme")
    DevMode = apps.get_model("db", "DevMode")
    DevModeIssueType = apps.get_model("db", "DevModeIssueType")
    Project = apps.get_model("db", "Project")
    ProjectRole = apps.get_model("db", "ProjectRole")
    Permission = apps.get_model("db", "Permission")
    IssueType = apps.get_model("db", "IssueType")
    TypeExtraField = apps.get_model("db", "TypeExtraField")
    TypeExtraFieldValue = apps.get_model("db", "TypeExtraFieldValue")
    IssueFieldDefinition = apps.get_model("db", "IssueFieldDefinition")
    State = apps.get_model("db", "State")
    Workflow = apps.get_model("db", "Workflow")
    WorkflowTransition = apps.get_model("db", "WorkflowTransition")
    WorkflowTransitionPrincipal = apps.get_model("db", "WorkflowTransitionPrincipal")
    WorkflowTransitionRequiredField = apps.get_model("db", "WorkflowTransitionRequiredField")
    IssueView = apps.get_model("db", "IssueView")
    Issue = apps.get_model("db", "Issue")
    DraftIssue = apps.get_model("db", "DraftIssue")
    IssueTransitionRecord = apps.get_model("db", "IssueTransitionRecord")
    user_property_models = [
        apps.get_model("db", name)
        for name in ("ProjectUserProperty", "CycleUserProperties", "ModuleUserProperties", "ReleaseUserProperties")
    ]

    workspace_ids = (
        DevMode._base_manager.filter(deleted_at__isnull=True).values_list("workspace_id", flat=True)
    )
    # 去重别用 .distinct()：模型默认排序字段会被带进 SELECT，同一个工作区会出现多次
    for workspace_id in sorted(set(workspace_ids), key=str):
        modes = list(DevMode._base_manager.filter(workspace_id=workspace_id, deleted_at__isnull=True).order_by("created_at"))
        scheme_ids = list(OrderedDict.fromkeys(mode.issue_scheme_id for mode in modes))
        schemes = {s.id: s for s in IssueScheme._base_manager.filter(id__in=scheme_ids)}
        type_counts = {
            sid: IssueType._base_manager.filter(scheme_id=sid, deleted_at__isnull=True).count() for sid in scheme_ids
        }

        default_mode = next((m for m in modes if m.name == DEFAULT_DEV_MODE_NAME), None)
        if default_mode is not None and type_counts.get(default_mode.issue_scheme_id):
            base_id = default_mode.issue_scheme_id
        else:
            base_id = max(scheme_ids, key=lambda sid: type_counts.get(sid, 0))
        base = schemes[base_id]
        IssueScheme._base_manager.filter(pk=base_id).update(name=LIBRARY_NAME)

        modes_by_scheme = {}
        for mode in modes:
            modes_by_scheme.setdefault(mode.issue_scheme_id, []).append(mode)

        # 库里现有的类型：按系统标识 / 名字索引
        def library_types():
            rows = list(IssueType._base_manager.filter(scheme_id=base_id, deleted_at__isnull=True).order_by("created_at"))
            return rows, {t.system_key: t for t in rows if t.system_key}, {t.name: t for t in rows}

        def link(mode, type_ids):
            # 关联顺序：史诗 → 特性 → 用户故事 → 任务 → 缺陷 → 其余按创建时间
            type_rows = {t.id: t for t in IssueType._base_manager.filter(id__in=type_ids)}
            type_ids = sorted(
                type_ids,
                key=lambda tid: (SYSTEM_KEY_ORDER.get(type_rows[tid].system_key, len(SYSTEM_KEY_ORDER)), type_rows[tid].created_at),
            )
            existing = set(DevModeIssueType._base_manager.filter(dev_mode_id=mode.id).values_list("issue_type_id", flat=True))
            order = DevModeIssueType._base_manager.filter(dev_mode_id=mode.id).count()
            for type_id in type_ids:
                if type_id in existing:
                    continue
                order += 1
                DevModeIssueType._base_manager.create(
                    dev_mode_id=mode.id, issue_type_id=type_id, sort_order=order * 10000
                )
                existing.add(type_id)

        # 默认（库）方案自己的模式：关联库里全部类型；视图挂到模式
        base_type_rows, _, _ = library_types()
        for mode in modes_by_scheme.get(base_id, []):
            link(mode, [t.id for t in base_type_rows])
        base_mode = (modes_by_scheme.get(base_id) or [None])[0]
        if base_mode is not None:
            IssueView._base_manager.filter(issue_scheme_id=base_id, project__isnull=True).update(
                dev_mode_id=base_mode.id, issue_scheme_id=None
            )

        for sid in scheme_ids:
            if sid == base_id:
                continue
            types = list(IssueType._base_manager.filter(scheme_id=sid, deleted_at__isnull=True).order_by("created_at"))
            all_type_ids = list(IssueType._base_manager.filter(scheme_id=sid).values_list("id", flat=True))
            all_state_ids = list(State._base_manager.filter(scheme_id=sid).values_list("id", flat=True))
            all_field_ids = list(TypeExtraField._base_manager.filter(scheme_id=sid).values_list("id", flat=True))
            all_transition_ids = list(WorkflowTransition._base_manager.filter(scheme_id=sid).values_list("id", flat=True))

            id_map = {}
            moved_type_ids = []
            _, by_key, by_name = library_types()
            for t in types:
                target = (by_key.get(t.system_key) if t.system_key else None) or by_name.get(t.name)
                if target is None:
                    moved_type_ids.append(t.id)
                    continue
                id_map[t.id] = target.id
                target_states = {
                    s.name: s.id
                    for s in State._base_manager.filter(scheme_id=base_id, issue_type_id=target.id, deleted_at__isnull=True)
                }
                for s in State._base_manager.filter(scheme_id=sid, issue_type_id=t.id):
                    if s.name in target_states:
                        id_map[s.id] = target_states[s.name]
                target_fields = {
                    f.name: f.id
                    for f in TypeExtraField._base_manager.filter(issue_type_id=target.id, deleted_at__isnull=True)
                }
                for f in TypeExtraField._base_manager.filter(issue_type_id=t.id):
                    if f.name in target_fields:
                        id_map[f.id] = target_fields[f.name]
            base_triage = State._base_manager.filter(scheme_id=base_id, issue_type__isnull=True, deleted_at__isnull=True).first()
            for s in State._base_manager.filter(scheme_id=sid, issue_type__isnull=True):
                if base_triage is not None:
                    id_map[s.id] = base_triage.id

            # 要删掉的行（对上了库的类型及其子行）不能被任何业务数据引用
            moved = set(moved_type_ids)
            drop_type_ids = [tid for tid in all_type_ids if tid not in moved]
            drop_state_ids = list(
                State._base_manager.filter(scheme_id=sid).exclude(issue_type_id__in=moved).values_list("id", flat=True)
            )
            drop_field_ids = list(
                TypeExtraField._base_manager.filter(scheme_id=sid).exclude(issue_type_id__in=moved).values_list("id", flat=True)
            )
            drop_transition_ids = list(
                WorkflowTransition._base_manager.filter(scheme_id=sid)
                .exclude(workflow__issue_type_id__in=moved)
                .values_list("id", flat=True)
            )
            referenced = (
                Issue._base_manager.filter(Q(type_id__in=drop_type_ids) | Q(state_id__in=drop_state_ids)).exists()
                or DraftIssue._base_manager.filter(Q(type_id__in=drop_type_ids) | Q(state_id__in=drop_state_ids)).exists()
                or TypeExtraFieldValue._base_manager.filter(extra_field_id__in=drop_field_ids).exists()
                or IssueTransitionRecord._base_manager.filter(
                    Q(from_state_id__in=drop_state_ids)
                    | Q(to_state_id__in=drop_state_ids)
                    | Q(transition_id__in=drop_transition_ids)
                ).exists()
            )
            if referenced:
                raise RuntimeError(
                    f"工作区 {workspace_id} 的模式方案 {schemes[sid].name}({sid}) 仍被工作项 / 审批记录引用，不能合并到类型库"
                )

            # 对不上的类型整体搬进库
            if moved_type_ids:
                IssueType._base_manager.filter(id__in=moved_type_ids).update(scheme_id=base_id)
                TypeExtraField._base_manager.filter(issue_type_id__in=moved_type_ids).update(scheme_id=base_id)
                State._base_manager.filter(issue_type_id__in=moved_type_ids).update(scheme_id=base_id)
                Workflow._base_manager.filter(issue_type_id__in=moved_type_ids).update(scheme_id=base_id)
                WorkflowTransition._base_manager.filter(workflow__issue_type_id__in=moved_type_ids).update(scheme_id=base_id)

            for mode in modes_by_scheme.get(sid, []):
                link(mode, [id_map.get(t.id, t.id) for t in types])

            str_map = {str(old): str(new) for old, new in id_map.items()}
            hex_map = {
                f"project.issue_type.{old.hex}.": f"project.issue_type.{new.hex}." for old, new in id_map.items()
            }
            # 跟随项目改指向库
            for project in Project._base_manager.filter(issue_scheme_id=sid):
                updates = {"issue_scheme_id": base_id}
                if project.default_state_id in id_map:
                    updates["default_state_id"] = id_map[project.default_state_id]
                Project._base_manager.filter(pk=project.pk).update(**updates)
                for role in ProjectRole._base_manager.filter(project_id=project.pk):
                    perms, changed = _replace_ids(role.permissions, hex_map)
                    if changed:
                        ProjectRole._base_manager.filter(pk=role.pk).update(permissions=perms)
                for model in user_property_models:
                    for row in model._base_manager.filter(project_id=project.pk):
                        changes = {}
                        for name in ("filters", "rich_filters", "display_filters"):
                            value, changed = _replace_ids(getattr(row, name, None), str_map)
                            if changed:
                                changes[name] = value
                        if changes:
                            model._base_manager.filter(pk=row.pk).update(**changes)
                for view in IssueView._base_manager.filter(project_id=project.pk):
                    changes = {}
                    for name in ("filters", "rich_filters", "display_filters"):
                        value, changed = _replace_ids(getattr(view, name), str_map)
                        if changed:
                            changes[name] = value
                    if changes:
                        IssueView._base_manager.filter(pk=view.pk).update(**changes)

            # 研发模式视图挂到模式，条件里的旧 id 换掉
            mode = (modes_by_scheme.get(sid) or [None])[0]
            for view in IssueView._base_manager.filter(issue_scheme_id=sid, project__isnull=True):
                changes = {"issue_scheme_id": None}
                for name in ("filters", "rich_filters", "display_filters"):
                    value, changed = _replace_ids(getattr(view, name), str_map)
                    if changed:
                        changes[name] = value
                if mode is not None:
                    changes["dev_mode_id"] = mode.id
                    IssueView._base_manager.filter(pk=view.pk).update(**changes)
                else:
                    IssueView._base_manager.filter(pk=view.pk).delete()

            # 所有模式改指向库，再硬删被合并的方案及其剩下的配置行
            DevMode._base_manager.filter(issue_scheme_id=sid).update(issue_scheme_id=base_id)
            WorkflowTransitionRequiredField._base_manager.filter(workflow__scheme_id=sid).delete()
            WorkflowTransitionPrincipal._base_manager.filter(transition__scheme_id=sid).delete()
            WorkflowTransition._base_manager.filter(scheme_id=sid).delete()
            Workflow._base_manager.filter(scheme_id=sid).delete()
            State._base_manager.filter(scheme_id=sid).delete()
            TypeExtraField._base_manager.filter(scheme_id=sid).delete()
            for type_id in drop_type_ids:
                Permission._base_manager.filter(key__startswith=f"project.issue_type.{type_id.hex}.").delete()
            DevModeIssueType._base_manager.filter(issue_type_id__in=drop_type_ids).delete()
            IssueType._base_manager.filter(scheme_id=sid).delete()
            IssueScheme._base_manager.filter(pk=sid).delete()

        # 通用字段库：库里的类型字段按名字归并
        fields = list(
            TypeExtraField._base_manager.filter(scheme_id=base_id, deleted_at__isnull=True).order_by("issue_type__created_at", "sort_order", "created_at")
        )
        groups = OrderedDict()
        for field in fields:
            field.options = _normalize_options(field.field_type, field.options)
            groups.setdefault(field.name, []).append(field)
        for index, (name, rows) in enumerate(groups.items()):
            def signature(row):
                return json.dumps(
                    [getattr(row, column) for column in DEFINITION_COLUMNS], sort_keys=True, ensure_ascii=False
                )

            common_signature, _ = Counter(signature(row) for row in rows).most_common(1)[0]
            template = next(row for row in rows if signature(row) == common_signature)
            definition = IssueFieldDefinition._base_manager.create(
                workspace_id=workspace_id,
                sort_order=(index + 1) * 10000,
                **{column: getattr(template, column) for column in DEFINITION_COLUMNS},
            )
            for row in rows:
                if signature(row) == common_signature:
                    TypeExtraField._base_manager.filter(pk=row.pk).update(library_field_id=definition.id, options=row.options)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0429_type_library_schema"),
    ]

    operations = [
        migrations.RunPython(consolidate, migrations.RunPython.noop),
    ]
