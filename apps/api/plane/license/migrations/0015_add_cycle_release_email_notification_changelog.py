from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "迭代与发布邮件通知"
CHANGELOG_VERSION = "1.8.0"


def create_cycle_release_email_notification_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
<h3>迭代与发布邮件通知</h3>
<p>本次更新为迭代与发布补齐全链路邮件通知能力，覆盖创建、状态变更、计划调整、负责人变更与延期提醒等关键节点，帮助项目成员及时感知进度变化。</p>

<h3>新功能 · 迭代通知</h3>
<ul>
  <li>新建迭代时，向项目全体成员发送邮件通知。</li>
  <li>状态变更为进行中、测试中、已退回、已完成、已取消时发送通知。</li>
  <li>开始时间或结束时间变更时，发送计划时间更新邮件。</li>
  <li>迭代逾期时，向项目成员发送延期提醒，并突出负责人信息。</li>
  <li>负责人变更时，向新任负责人发送指定通知。</li>
</ul>

<h3>新功能 · 发布通知</h3>
<ul>
  <li>新建发布时，向项目全体成员发送邮件通知。</li>
  <li>状态变更为进行中、待测试、已驳回、已完成、已取消时发送通知。</li>
  <li>开始时间、目标时间或转测日期变更时，发送计划时间更新邮件。</li>
  <li>研发或测试阶段逾期时，向项目成员发送延期提醒。</li>
  <li>负责人变更时，向新任负责人发送指定通知。</li>
</ul>

<h3>体验优化</h3>
<ul>
  <li>统一迭代与发布邮件模板样式，状态与时间展示更清晰。</li>
  <li>邮件内提供直达概览页与项目列表的跳转链接。</li>
  <li>聚合短时间内的重复通知，减少收件箱打扰。</li>
  <li>尊重个人「状态变更」通知偏好，默认开启、可按需关闭。</li>
  <li>操作人不会收到自己触发的通知，仅通知其他项目成员。</li>
</ul>

<h3>适合哪些场景</h3>
<ul>
  <li>迭代或发布状态频繁流转，需要成员及时跟进的研发团队。</li>
  <li>计划时间或转测日期调整，需要同步相关干系人的项目管理场景。</li>
  <li>迭代或发布出现延期，希望全员快速感知风险与责任归属。</li>
</ul>
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "迭代与发布新增创建、状态、计划、负责人与延期全链路邮件通知",
            "description": content,
            "content": content,
            "update_type": "added",
            "tags": ["迭代", "发布", "邮件通知", "延期提醒", "项目管理"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 6, 10, 5, 40, 48, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_cycle_release_email_notification_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0014_add_issue_import_xmind_preview_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_cycle_release_email_notification_changelog,
            delete_cycle_release_email_notification_changelog,
        ),
    ]
