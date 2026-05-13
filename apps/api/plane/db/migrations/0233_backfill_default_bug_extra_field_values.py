# Generated manually — backfill default values for required bug extra fields
#
# 背景：0232 在为老项目幂等补齐「缺陷」类 TypeExtraField 时，并未为已有工作项
# 写入这些必填字段的默认值；对于在补字段之前就已存在的缺陷工作项，
# 自定义字段「软件版本 / 发现方式 / 缺陷级别」的 TypeExtraFieldValue 缺失，
# 触发编辑时的必填校验失败（见 plane.utils.extra_field_value.validate_extra_field_values）。
#
# 本迁移按以下默认值幂等补齐 TypeExtraFieldValue：
#   - 软件版本 (text)   -> "最新版本"
#   - 发现方式 (select) -> "其他"
#   - 缺陷级别 (select) -> "general"
#
# 处理范围：
#   - 仅处理「缺陷」类 IssueType（与 0232 的 _is_defect 判断一致）
#   - 仅处理未软删的 Project / IssueType / TypeExtraField / Issue
#   - 同时覆盖两类问题：
#       1. 完全没有 TypeExtraFieldValue 行（bulk_create）
#       2. 已有行但 value 为空（None / 空字符串），按列同步更新
#
# 单个项目用一个事务，异常时只跳过当前 IssueType，不影响其它项目。

from django.db import migrations, transaction


DEFECT_TYPE_NAMES = {"缺陷", "Bug", "bug", "Defect", "defect"}

# 默认值规则：name -> (field_type, default_value)
# field_type 仅用于决定写入到哪些值列；text 写 value+value_text，select 只写 value。
DEFAULT_VALUES = [
    {"name": "软件版本", "field_type": "text", "default": "最新版本"},
    {"name": "发现方式", "field_type": "select", "default": "手工测试"},
    {"name": "缺陷级别", "field_type": "select", "default": "general"},
]

TARGET_FIELD_NAMES = [spec["name"] for spec in DEFAULT_VALUES]
SPEC_BY_NAME = {spec["name"]: spec for spec in DEFAULT_VALUES}


def _is_defect(issue_type):
    """缺陷识别：category 命中或 name 命中其一即视为缺陷（与 0232 对齐）。"""
    category = getattr(issue_type, "category", None)
    if category is not None and getattr(category, "name", None) == "缺陷":
        return True
    return issue_type.name in DEFECT_TYPE_NAMES


def _value_columns(field_type, default_value):
    """根据字段类型把默认值写入到对应的具体列。

    与 plane.utils.extra_field_value._value_columns 的写列规则保持一致：
    - text   -> value + value_text
    - select -> 仅 value（JSON 列）
    """
    columns = {
        "value": default_value,
        "value_text": None,
        "value_number": None,
        "value_date": None,
    }
    if field_type == "text":
        columns["value_text"] = default_value
    return columns


def _is_value_empty(existing_value):
    """与 plane.utils.extra_field_value._is_value_empty 一致的空值判断。"""
    raw = existing_value.value
    if raw is None:
        return True
    if isinstance(raw, str) and raw.strip() == "":
        return True
    if isinstance(raw, (list, tuple, dict)) and len(raw) == 0:
        return True
    return False


def _backfill_for_field(TypeExtraFieldValue, project, field, issue_ids, spec):
    """对单个 (field, project) 范围内的 issues 幂等补齐字段值。"""
    if not issue_ids:
        return

    columns = _value_columns(spec["field_type"], spec["default"])

    existing_values = list(
        TypeExtraFieldValue.objects.filter(
            extra_field=field,
            issue_id__in=issue_ids,
            deleted_at__isnull=True,
        )
    )
    existing_by_issue = {str(v.issue_id): v for v in existing_values}

    # 1) 已有行但 value 为空 -> 更新该行的值列
    for value_row in existing_values:
        if not _is_value_empty(value_row):
            continue
        for column, column_value in columns.items():
            setattr(value_row, column, column_value)
        value_row.save(update_fields=list(columns.keys()) + ["updated_at"])

    # 2) 完全没有行的 issue -> bulk_create
    missing_issue_ids = [
        issue_id for issue_id in issue_ids if str(issue_id) not in existing_by_issue
    ]
    if not missing_issue_ids:
        return

    to_create = [
        TypeExtraFieldValue(
            issue_id=issue_id,
            extra_field=field,
            project=project,
            workspace=project.workspace,
            **columns,
        )
        for issue_id in missing_issue_ids
    ]
    TypeExtraFieldValue.objects.bulk_create(to_create, batch_size=500)


def backfill_default_bug_extra_field_values(apps, schema_editor):
    IssueType = apps.get_model("db", "IssueType")
    TypeExtraField = apps.get_model("db", "TypeExtraField")
    TypeExtraFieldValue = apps.get_model("db", "TypeExtraFieldValue")
    Issue = apps.get_model("db", "Issue")

    issue_types = IssueType.objects.filter(deleted_at__isnull=True).select_related(
        "category", "project__workspace"
    )

    for defect_type in issue_types:
        if not _is_defect(defect_type):
            continue
        project = defect_type.project
        if project is None or project.deleted_at is not None:
            continue

        try:
            with transaction.atomic():
                fields = list(
                    TypeExtraField.objects.filter(
                        project=project,
                        issue_type=defect_type,
                        name__in=TARGET_FIELD_NAMES,
                        deleted_at__isnull=True,
                    )
                )
                if not fields:
                    continue

                # Issue 模型在真实代码中只声明了 issue_objects = IssueManager()，
                # 没有显式 objects 字段；因此历史迁移模型(apps.get_model)上不会自动
                # 注入名为 .objects 的管理器，必须用 _default_manager 才能查询。
                issue_ids = list(
                    Issue._default_manager.filter(
                        project=project,
                        type=defect_type,
                        deleted_at__isnull=True,
                    ).values_list("id", flat=True)
                )
                if not issue_ids:
                    continue

                for field in fields:
                    spec = SPEC_BY_NAME.get(field.name)
                    if spec is None:
                        continue
                    _backfill_for_field(
                        TypeExtraFieldValue, project, field, issue_ids, spec
                    )
        except Exception as exc:
            print(
                f"[0233] skip issue_type={defect_type.id} "
                f"project={defect_type.project_id}: {exc}"
            )
            continue


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0232_backfill_default_bug_fields_and_workflow"),
    ]

    operations = [
        migrations.RunPython(
            backfill_default_bug_extra_field_values,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
