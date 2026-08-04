from django.db import migrations


SORT_ORDER_STEP = 1000

BUILTIN_FIELD_DEFS = (
    # (builtin_key, 名称, 字段类型, 是否必填)
    ("title", "标题", "text", True),
    ("description", "描述", "rich_text", False),
)


def _ensure_builtin_fields(RequirementField, template_id):
    """给一个模板补齐标题/描述两行，并把它们排到最前面。

    已有的根字段整体后移，避免和新插入的两行撞 sort_order。子字段的 sort_order 是
    父字段内部的序，不受影响。
    """
    existing_keys = set(
        RequirementField.objects.filter(
            requirement_id=template_id, builtin_key__isnull=False
        ).values_list("builtin_key", flat=True)
    )
    missing = [item for item in BUILTIN_FIELD_DEFS if item[0] not in existing_keys]
    if not missing:
        return

    offset = len(missing) * SORT_ORDER_STEP
    for index, field in enumerate(
        RequirementField.objects.filter(
            requirement_id=template_id,
            parent_field__isnull=True,
            builtin_key__isnull=True,
        ).order_by("sort_order", "created_at", "id")
    ):
        field.sort_order = offset + (index + 1) * SORT_ORDER_STEP
        field.save(update_fields=["sort_order"])

    for index, (builtin_key, name, field_type, is_required) in enumerate(missing):
        RequirementField.objects.create(
            requirement_id=template_id,
            parent_field=None,
            name=name,
            field_type=field_type,
            is_required=is_required,
            is_active=True,
            sort_order=(index + 1) * SORT_ORDER_STEP,
            config={},
            default_value=None,
            builtin_key=builtin_key,
        )


def bind_details_to_templates(apps, schema_editor):
    """① 模板补内置字段 ② 库条目回填模板 ③ 清空产品需求的自有字段与明细。

    ③ 是有损的：产品需求原本把模板字段拷贝到自己名下，明细 data 的 key 是这些拷贝
    出来的字段 UUID，没有任何模板与之对应，无法回填 template_id。按既定决策直接清空
    （预发布数据），并把这些需求整体退回未发布态，否则 current_version / 版本记录 /
    变更单会指向已经不存在的内容。
    """
    Requirement = apps.get_model("db", "Requirement")
    RequirementField = apps.get_model("db", "RequirementField")
    RequirementDetail = apps.get_model("db", "RequirementDetail")
    RequirementDraft = apps.get_model("db", "RequirementDraft")
    RequirementDraftDetail = apps.get_model("db", "RequirementDraftDetail")
    RequirementChangeRequest = apps.get_model("db", "RequirementChangeRequest")
    RequirementVersion = apps.get_model("db", "RequirementVersion")

    # ① 每个工作区模板都必须有标题与描述
    for template_id in Requirement.objects.filter(is_template=True).values_list(
        "id", flat=True
    ):
        _ensure_builtin_fields(RequirementField, template_id)

    # ② 标准库条目的模板恒等于所属库的模板
    for library_id, template_id in (
        apps.get_model("db", "RequirementLibrary")
        .objects.all()
        .values_list("id", "template_id")
    ):
        RequirementDetail.objects.filter(library_id=library_id).update(
            template_id=template_id
        )

    # ③ 产品/项目需求：清空自有字段与明细，并退回未发布态
    owned_ids = list(
        Requirement.objects.filter(is_template=False).values_list("id", flat=True)
    )
    if not owned_ids:
        return

    # 版本行引用变更单与变更项（SET_NULL），先删版本再删变更单，避免中间态
    RequirementVersion.objects.filter(requirement_id__in=owned_ids).delete()
    RequirementChangeRequest.objects.filter(requirement_id__in=owned_ids).delete()

    draft_ids = list(
        RequirementDraft.objects.filter(requirement_id__in=owned_ids).values_list(
            "id", flat=True
        )
    )
    RequirementDraftDetail.objects.filter(draft_id__in=draft_ids).delete()
    RequirementDraft.objects.filter(id__in=draft_ids).delete()

    RequirementDetail.objects.filter(requirement_id__in=owned_ids).delete()
    RequirementField.objects.filter(requirement_id__in=owned_ids).delete()

    Requirement.objects.filter(id__in=owned_ids).update(
        current_version=None, status="draft"
    )


def unbind_details_from_templates(apps, schema_editor):
    """回滚：删掉内置字段行、清空 template 外键。

    被清空的产品需求内容无法恢复 —— 它在正向迁移里就已经没有可还原的来源了。
    """
    RequirementField = apps.get_model("db", "RequirementField")
    RequirementDetail = apps.get_model("db", "RequirementDetail")
    RequirementDraftDetail = apps.get_model("db", "RequirementDraftDetail")

    RequirementDetail.objects.update(template_id=None)
    RequirementDraftDetail.objects.update(template_id=None)
    RequirementField.objects.filter(builtin_key__isnull=False).delete()


class Migration(migrations.Migration):
    """只搬数据，不碰结构 —— 见 0313 的说明。"""

    dependencies = [
        ("db", "0313_requirement_detail_template"),
    ]

    operations = [
        migrations.RunPython(
            bind_details_to_templates,
            unbind_details_from_templates,
        ),
    ]
