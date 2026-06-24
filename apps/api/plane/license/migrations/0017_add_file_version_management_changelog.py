from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "文件历史版本管理"
CHANGELOG_VERSION = "1.10.0"


def create_file_version_management_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
<h3>文件历史版本管理</h3>
<p>本次更新为项目文件库新增历史版本能力，文件上传、覆盖上传、在线编辑保存都会记录版本，项目成员可以查看、下载、命名和回退历史版本，减少误覆盖带来的资料丢失风险。</p>

<h3>新功能</h3>
<ul>
  <li>文件库支持 MinIO 对象版本管理，记录每个文件对应的存储版本。</li>
  <li>文件详情新增历史版本入口，可查看全部版本、大小、时间和操作人。</li>
  <li>支持下载指定历史版本，便于对比历史资料或恢复本地备份。</li>
  <li>支持为历史版本设置别名，方便标记需求稿、评审稿和归档稿。</li>
  <li>支持回退到指定历史版本，并清理回退点之后的新版本。</li>
</ul>

<h3>在线编辑增强</h3>
<ul>
  <li>OnlyOffice 在线编辑保存后自动生成文件新版本。</li>
  <li>强制保存回调会写入最新文件内容并记录版本。</li>
  <li>历史版本可在预览模式中只读查看，避免误编辑旧版本。</li>
  <li>版本来源会记录上传或在线编辑的操作人。</li>
</ul>

<h3>文件操作优化</h3>
<ul>
  <li>文件重命名会同步数据库与 MinIO 对象路径。</li>
  <li>重命名后保留旧路径下的历史版本下载能力。</li>
  <li>删除流程接入物理删除版本对象，并预留临时删除框架。</li>
  <li>版本时间统一展示为标准日期时间格式。</li>
</ul>

<h3>升级说明</h3>
<ul>
  <li>执行数据库迁移后，将为历史文件补齐初始版本记录。</li>
  <li>需要确保 uploads bucket 已开启版本管理，系统会在文件库初始化和上传入口尝试开启。</li>
  <li>历史未启用版本管理前的文件会以初始版本形式纳入版本列表。</li>
</ul>
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "文件库新增历史版本、版本下载、别名、回退与在线编辑版本记录。",
            "description": content,
            "content": content,
            "update_type": "added",
            "tags": ["文件", "历史版本", "在线编辑", "MinIO", "文件管理"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 6, 24, 0, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_file_version_management_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0016_add_test_plan_case_assignee_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_file_version_management_changelog,
            delete_file_version_management_changelog,
        ),
    ]
