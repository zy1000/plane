from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "工作流审批体验更新"
CHANGELOG_VERSION = "1.2.0"


def create_workflow_approval_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "工作流审批现已覆盖更多状态变更场景，并支持在多种视图中更直观地查看和处理审批。",
            "description": "你现在可以更方便地发起、查看和跟踪工作项的状态审批流程。",
            "content": """
<h3>工作流审批能力升级</h3>
<p>本次更新重点提升了工作项状态审批的可见性和使用体验，让审批流程更清晰、更易跟踪。</p>

<h3>你现在可以这样使用</h3>
<ul>
  <li>当某个状态变更需要审批时，系统会自动发起审批流程，并提示你等待审批结果。</li>
  <li>你可以在看板、列表和表格视图中直接看到带有“待审批”标记的工作项。</li>
  <li>点击“待审批”标记后，可以查看当前审批状态、审批人和审批进度。</li>
  <li>审批通过后，工作项会更新到目标状态；如果你改成了其他状态，页面中的审批信息也会同步刷新。</li>
  <li>在批量修改工作项状态时，系统也会自动识别哪些工作项需要进入审批流程，并给出对应提示。</li>
</ul>

<h3>如何配置工作流规则</h3>
<ul>
  <li><strong>ALL</strong>：表示该状态可以直接更改，项目成员无需发起审批。</li>
  <li><strong>ANY</strong>：表示只要命中的审批人之一进行处理，即可完成这次状态审批。</li>
  <li><strong>N OF M</strong>：表示需要多位审批人中的指定人数通过后，状态才会正式更新。</li>
</ul>
<p>你可以根据团队协作方式，为不同状态配置不同的流转规则，让重要状态变更更加可控。</p>

<h3>适合哪些场景</h3>
<ul>
  <li>团队希望对重要状态变更增加审批控制，例如从“待办”进入“开发中”或从“测试中”进入“已完成”。</li>
  <li>项目成员需要在不同视图下快速识别哪些工作项还在等待审批。</li>
  <li>管理者希望在单个修改和批量操作中都保持一致的审批体验。</li>
</ul>

<p>如果你的项目已经配置了工作流审批规则，现在就可以直接体验以上能力。</p>
""".strip(),
            "update_type": "added",
            "tags": ["workflow", "approval", "issue"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 3, 19, 0, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_workflow_approval_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0007_alter_changelog_options_changelog_content_and_more"),
    ]

    operations = [
        migrations.RunPython(
            create_workflow_approval_changelog,
            delete_workflow_approval_changelog,
        ),
    ]
