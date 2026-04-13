from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "模块管理功能上线"
CHANGELOG_VERSION = "1.4.0"


def create_module_management_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "项目现已支持完整的模块管理能力，可通过独立列表与详情页组织模块，并在模块内直接查看、筛选和维护关联工作项。",
            "description": "你可以使用模块来承载一组相关工作项，按负责人、状态、时间范围和进度持续跟踪模块推进情况。",
            "content": """
<h3>模块管理能力已上线</h3>
<p>本次更新为项目协作补齐了完整的模块管理流程。你现在可以在项目中创建模块，用模块聚合一批相关工作项，并通过独立页面持续跟踪模块的状态、进度和时间安排。</p>

<h3>你现在可以这样使用</h3>
<ul>
  <li>在项目中创建、编辑、删除和归档模块，并为模块设置负责人、状态、开始日期和目标日期。</li>
  <li>通过独立的模块列表页和模块详情页查看所有模块，不再需要依赖临时入口查找模块信息。</li>
  <li>在模块详情中直接创建新的工作项，或把已有工作项批量加入模块，统一管理模块范围内的事项。</li>
  <li>在模块内使用列表、看板、日历、表格和甘特等多种视图查看关联工作项，并结合筛选条件快速聚焦重点内容。</li>
  <li>查看模块的工作项数量、完成进度和分析信息，更直观地判断当前模块的推进状态。</li>
</ul>

<h3>适合哪些场景</h3>
<ul>
  <li>需要按功能域、阶段目标或专题任务，把一组相关工作项组织在一起推进的团队。</li>
  <li>希望明确某个模块由谁负责、计划何时完成，并持续跟踪模块整体进度的项目成员。</li>
  <li>需要在模块维度进行归档管理，保留历史模块记录又不影响当前项目视图的场景。</li>
</ul>

<h3>带来的收益</h3>
<ul>
  <li>模块信息和模块内工作项集中管理，减少在项目不同页面之间来回切换的成本。</li>
  <li>模块负责人、时间范围和进度状态更加清晰，便于团队做阶段性跟踪和复盘。</li>
  <li>模块内支持多视图协作，适配不同角色在规划、执行和追踪阶段的使用习惯。</li>
</ul>

<p>如果你的项目需要按阶段或主题组织工作项，现在就可以开始使用模块功能。</p>
""".strip(),
            "update_type": "added",
            "tags": ["module", "project", "issue"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 4, 13, 0, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_module_management_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0010_add_timesheet_management_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_module_management_changelog,
            delete_module_management_changelog,
        ),
    ]
