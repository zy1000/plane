# Generated manually — backfill default bug fields and workflow for existing projects
#
# 对所有老项目下「缺陷」类别的 IssueType 幂等补齐：
#   1. 默认缺陷状态（DEFAULT_BUG_STATES，含 Backlog）
#   2. 6 个默认 TypeExtraField
#   3. 默认 Workflow + 11 条 WorkflowTransition（含 Backlog→Open）
#   4. 在 to_state ∈ {Fixed, Pending-Reject, Closed} 的流转上绑定
#      「修复版本」「技术原因及解决方案」为必填字段
#
# 该迁移完全幂等：已有同名状态/字段/流转/必填绑定一律跳过，不会覆盖项目已有配置。
# 单个项目数据异常时只会跳过该项目，不影响其它项目。

from django.db import migrations, transaction


DEFECT_TYPE_NAMES = {"缺陷", "Bug", "bug", "Defect", "defect"}

# 与 plane.db.models.state.DEFAULT_BUG_STATES 对齐
DEFAULT_BUG_STATES = [
    {
        "name": "Backlog",
        "color": "#60646C",
        "sequence": 15000,
        "group": "backlog",
        "default": True,
    },
    {
        "name": "Open",
        "color": "#60646C",
        "sequence": 25000,
        "group": "unstarted",
    },
    {
        "name": "Fixed",
        "color": "#F59E0B",
        "sequence": 35000,
        "group": "started",
    },
    {
        "name": "Pending-Reject",
        "color": "#F59E0B",
        "sequence": 45000,
        "group": "started",
    },
    {
        "name": "Suspend",
        "color": "#F59E0B",
        "sequence": 55000,
        "group": "started",
    },
    {
        "name": "Reopen",
        "color": "#F59E0B",
        "sequence": 65000,
        "group": "started",
    },
    {
        "name": "Closed",
        "color": "#46A758",
        "sequence": 75000,
        "group": "completed",
    },
    {
        "name": "Rejected",
        "color": "#b30000",
        "sequence": 85000,
        "group": "cancelled",
    },
]

# 与 create_default_bug_extra_field 对齐
DEFAULT_EXTRA_FIELDS = [
    {
        "name": "软件版本",
        "field_type": "text",
        "is_required": True,
        "options": {},
        "default_value": None,
    },
    {
        "name": "发现方式",
        "field_type": "select",
        "is_required": True,
        "options": {
            "choices": ["自动化测试", "手工测试", "其他"],
            "selection_mode": "single",
        },
        "default_value": "自动化测试",
    },
    {
        "name": "缺陷级别",
        "field_type": "select",
        "is_required": True,
        "options": {
            "choices": [
                "security",
                "key",
                "major",
                "general",
                "minor",
                "suggest",
                "safely",
            ],
            "selection_mode": "single",
        },
        "default_value": "general",
    },
    {
        "name": "缺陷原因",
        "field_type": "select",
        "is_required": False,
        "options": {
            "choices": [
                "需求不明确",
                "需求未实现",
                "设计-算法",
                "设计-框架",
                "设计-逻辑",
                "编码",
                "配置错误",
                "第三方组件",
                "测试环境错误",
                "用例设计错误",
                "编译打包",
                "其他",
                "编码-接口",
                "编码-调度",
                "编码-逻辑",
            ],
            "selection_mode": "single",
        },
        "default_value": None,
    },
    {
        "name": "修复版本",
        "field_type": "text",
        "is_required": False,
        "options": {},
        "default_value": None,
    },
    {
        "name": "技术原因及解决方案",
        "field_type": "text",
        "is_required": False,
        "options": {"text_mode": "paragraph"},
        "default_value": None,
    },
]

# 与 create_default_bug_workflow 对齐
TRANSITION_RULES = [
    ("Backlog", "Open"),
    ("Open", "Fixed"),
    ("Open", "Pending-Reject"),
    ("Fixed", "Reopen"),
    ("Fixed", "Closed"),
    ("Pending-Reject", "Rejected"),
    ("Pending-Reject", "Closed"),
    ("Pending-Reject", "Suspend"),
    ("Pending-Reject", "Reopen"),
    ("Suspend", "Closed"),
    ("Suspend", "Reopen"),
]

REQUIRED_FIELD_TARGET_STATES = ["Fixed", "Pending-Reject", "Closed"]
REQUIRED_FIELD_NAMES = ["修复版本", "技术原因及解决方案"]


def _is_defect(issue_type):
    """缺陷识别：category 命中或 name 命中其一即视为缺陷。"""
    category = getattr(issue_type, "category", None)
    if category is not None and getattr(category, "name", None) == "缺陷":
        return True
    return issue_type.name in DEFECT_TYPE_NAMES


def _ensure_bug_states(State, project, defect_type):
    """缺什么补什么；同名活动状态已存在则跳过（约束 deleted_at IS NULL 不冲突软删行）。"""
    existing_names = set(
        State.objects.filter(
            project=project,
            issue_type=defect_type,
            deleted_at__isnull=True,
        ).values_list("name", flat=True)
    )
    missing = [s for s in DEFAULT_BUG_STATES if s["name"] not in existing_names]
    if not missing:
        return
    State.objects.bulk_create(
        [
            State(
                project=project,
                workspace=project.workspace,
                issue_type=defect_type,
                name=spec["name"],
                color=spec["color"],
                sequence=spec["sequence"],
                group=spec["group"],
                default=spec.get("default", False),
            )
            for spec in missing
        ]
    )


def _ensure_extra_fields(TypeExtraField, project, defect_type):
    """同名字段已存在则跳过，不覆盖项目已有 options/field_type/default_value。"""
    existing_names = set(
        TypeExtraField.objects.filter(
            project=project,
            issue_type=defect_type,
            deleted_at__isnull=True,
        ).values_list("name", flat=True)
    )
    for spec in DEFAULT_EXTRA_FIELDS:
        if spec["name"] in existing_names:
            continue
        TypeExtraField.objects.create(
            project=project,
            workspace=project.workspace,
            issue_type=defect_type,
            name=spec["name"],
            field_type=spec["field_type"],
            is_required=spec["is_required"],
            options=spec["options"],
            default_value=spec["default_value"],
        )


def _ensure_workflow_and_transitions(Workflow, WorkflowTransition, State, project, defect_type):
    """复用已激活工作流（若有）；状态缺失时按行 continue，不会因找不到状态而崩。"""
    workflow = (
        Workflow.objects.filter(
            project=project,
            issue_type=defect_type,
            is_active=True,
            deleted_at__isnull=True,
        )
        .first()
    )
    if workflow is None:
        workflow = Workflow.objects.create(
            project=project,
            workspace=project.workspace,
            issue_type=defect_type,
            name="缺陷默认工作流",
            is_active=True,
        )

    states = State.objects.filter(
        project=project,
        issue_type=defect_type,
        deleted_at__isnull=True,
    )
    state_map = {state.name: state for state in states}

    existing_pairs = set(
        WorkflowTransition.objects.filter(
            workflow=workflow,
            deleted_at__isnull=True,
        ).values_list("from_state__name", "to_state__name")
    )

    to_create = []
    for from_name, to_name in TRANSITION_RULES:
        if (from_name, to_name) in existing_pairs:
            continue
        from_state = state_map.get(from_name)
        to_state = state_map.get(to_name)
        if from_state is None or to_state is None:
            continue
        to_create.append(
            WorkflowTransition(
                workflow=workflow,
                project=project,
                workspace=project.workspace,
                from_state=from_state,
                to_state=to_state,
                approval_type="all",
                required_count=None,
                dynamic_approver_types=[],
            )
        )

    if to_create:
        WorkflowTransition.objects.bulk_create(to_create)

    return workflow


def _ensure_required_field_bindings(
    WorkflowTransition,
    WorkflowTransitionRequiredField,
    TypeExtraField,
    project,
    defect_type,
    workflow,
):
    """字段不存在则跳过；按 (transition, extra_field) 查重避免重复绑定。"""
    required_fields = list(
        TypeExtraField.objects.filter(
            project=project,
            issue_type=defect_type,
            name__in=REQUIRED_FIELD_NAMES,
            deleted_at__isnull=True,
        )
    )
    if not required_fields:
        return

    target_transitions = WorkflowTransition.objects.filter(
        workflow=workflow,
        to_state__name__in=REQUIRED_FIELD_TARGET_STATES,
        deleted_at__isnull=True,
    )

    for transition in target_transitions:
        existing_field_ids = set(
            WorkflowTransitionRequiredField.objects.filter(
                workflow=transition,
                deleted_at__isnull=True,
            ).values_list("extra_field_id", flat=True)
        )
        bulk = [
            WorkflowTransitionRequiredField(
                workflow=transition,
                extra_field=field,
            )
            for field in required_fields
            if field.id not in existing_field_ids
        ]
        if bulk:
            WorkflowTransitionRequiredField.objects.bulk_create(bulk)


def backfill_default_bug_fields_and_workflow(apps, schema_editor):
    IssueType = apps.get_model("db", "IssueType")
    State = apps.get_model("db", "State")
    TypeExtraField = apps.get_model("db", "TypeExtraField")
    Workflow = apps.get_model("db", "Workflow")
    WorkflowTransition = apps.get_model("db", "WorkflowTransition")
    WorkflowTransitionRequiredField = apps.get_model(
        "db", "WorkflowTransitionRequiredField"
    )

    issue_types = (
        IssueType.objects.filter(deleted_at__isnull=True)
        .select_related("category", "project__workspace")
    )

    for defect_type in issue_types:
        if not _is_defect(defect_type):
            continue
        project = defect_type.project
        if project is None or project.deleted_at is not None:
            continue

        try:
            with transaction.atomic():
                _ensure_bug_states(State, project, defect_type)
                _ensure_extra_fields(TypeExtraField, project, defect_type)
                workflow = _ensure_workflow_and_transitions(
                    Workflow, WorkflowTransition, State, project, defect_type
                )
                _ensure_required_field_bindings(
                    WorkflowTransition,
                    WorkflowTransitionRequiredField,
                    TypeExtraField,
                    project,
                    defect_type,
                    workflow,
                )
        except Exception as exc:
            print(
                f"[0232] skip issue_type={defect_type.id} "
                f"project={defect_type.project_id}: {exc}"
            )
            continue


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0231_backfill_issue_type_category"),
    ]

    operations = [
        migrations.RunPython(
            backfill_default_bug_fields_and_workflow,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
