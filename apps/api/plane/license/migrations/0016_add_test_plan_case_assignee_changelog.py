from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "测试计划执行人调整"
CHANGELOG_VERSION = "1.9.0"


def create_test_plan_case_assignee_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
<h3>测试计划执行人调整</h3>
<p>本次更新将测试计划的执行人粒度从「计划级别」下沉到「计划用例级别」，让每条计划用例都可以独立指定执行责任人，执行分工更清晰。</p>

<h3>功能变更</h3>
<ul>
  <li>计划用例（Plan Case）新增执行人字段，支持按用例分配执行人。</li>
  <li>测试计划（Test Plan）不再维护计划级别的多执行人配置。</li>
  <li>计划详情中的执行责任以计划用例为准，避免计划级别与用例级别信息不一致。</li>
</ul>

<h3>数据迁移说明</h3>
<ul>
  <li>历史存在多个计划执行人的测试计划，将按既有顺序选择一名执行人作为默认值。</li>
  <li>仅对未设置执行人的计划用例执行回填，已明确指定执行人的计划用例不受影响。</li>
  <li>未配置计划执行人的历史数据将保持为空，后续可按需在计划用例中补充。</li>
</ul>

<h3>适合哪些场景</h3>
<ul>
  <li>同一测试计划中，不同测试用例由不同人员执行的协作场景。</li>
  <li>需要更细粒度统计与追踪测试执行责任归属的测试团队。</li>
</ul>
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "测试计划执行人下沉至计划用例级别，历史多执行人按顺序选取一人回填。",
            "description": content,
            "content": content,
            "update_type": "improved",
            "tags": ["测试计划", "计划用例", "执行人", "测试管理"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 6, 18, 2, 49, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_test_plan_case_assignee_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0015_add_cycle_release_email_notification_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_test_plan_case_assignee_changelog,
            delete_test_plan_case_assignee_changelog,
        ),
    ]
