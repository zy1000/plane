from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "自定义类型与自定义字段功能上线"
CHANGELOG_VERSION = "1.5.0"


def create_custom_type_field_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "项目现已支持自定义工作项类型与类型自定义字段，可按业务场景定义工作项分类、字段结构和字段值规则。",
            "description": "你可以在项目中维护不同工作项类型，并为每种类型配置专属字段，让需求、缺陷、任务或其他业务对象拥有更贴合实际流程的数据结构。",
            "content": """
<h3>自定义类型与自定义字段已上线</h3>
<p>本次更新为工作项引入了更灵活的建模能力。项目可以按自身业务定义工作项类型，并为不同类型配置专属字段，让工作项信息不再受固定字段限制。</p>

<h3>你现在可以这样使用</h3>
<ul>
  <li>在项目中创建、编辑、停用和删除自定义工作项类型，并为类型设置名称、描述、图标和层级顺序。</li>
  <li>为每个工作项类型配置专属自定义字段，支持文本、数字、日期、布尔值、单选/多选和成员等字段类型。</li>
  <li>为字段设置必填、默认值、排序、选项和校验规则，让不同类型的工作项遵循不同的数据要求。</li>
  <li>创建或编辑工作项时填写对应类型的自定义字段值，字段值会随工作项一起保存和展示。</li>
  <li>在工作项筛选、活动记录和工作流流转中使用自定义字段，便于按团队自己的数据维度追踪事项。</li>
</ul>

<h3>权限与流程联动</h3>
<ul>
  <li>每个工作项类型会自动生成创建、编辑、删除、归档和恢复等项目级权限，项目角色可以按类型精细授权。</li>
  <li>工作流可以结合自定义字段配置流转必填项，确保进入关键状态前补齐必要信息。</li>
  <li>系统会保留项目与工作区范围限制，避免不同项目之间的类型、字段和字段值相互混用。</li>
</ul>

<h3>适合哪些场景</h3>
<ul>
  <li>希望把缺陷、需求、任务、风险、客户反馈等对象拆成不同工作项类型管理的团队。</li>
  <li>不同类型工作项需要不同表单字段、必填规则或选项集合的业务流程。</li>
  <li>需要按自定义字段进行筛选、跟踪和审批前校验的项目管理场景。</li>
</ul>

<p>如果你的团队需要更贴合自身流程的工作项结构，现在可以从项目设置中开始配置自定义类型和字段。</p>
""".strip(),
            "update_type": "added",
            "tags": ["issue-type", "custom-field", "issue", "workflow"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 5, 11, 0, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_custom_type_field_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0011_add_module_management_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_custom_type_field_changelog,
            delete_custom_type_field_changelog,
        ),
    ]
