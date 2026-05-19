from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "文件页面全新升级"
CHANGELOG_VERSION = "1.6.0"


def create_filestore_page_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
<h3>文件页面全新升级</h3>
<p>本次更新重构了项目文件页面，让文件浏览、上传、整理和查找更加直观。项目成员可以在同一个页面中管理项目文件夹与文件，减少在不同入口之间切换的成本。</p>

<h3>新功能</h3>
<ul>
  <li>新增文件夹视图，支持按目录层级浏览项目文件。</li>
  <li>支持创建文件夹、重命名和删除文件夹。</li>
  <li>支持文件上传、拖拽上传和批量选择操作。</li>
  <li>支持移动文件与文件夹，便于整理项目资料。</li>
  <li>新增面包屑导航，快速返回上级目录或项目根目录。</li>
</ul>

<h3>体验优化</h3>
<ul>
  <li>文件列表布局更清晰，可更快区分文件与文件夹。</li>
  <li>新增右侧详情面板，便于查看文件信息。</li>
  <li>新增空状态与操作提示，降低首次使用成本。</li>
  <li>删除、移动等关键操作增加确认提示，减少误操作。</li>
</ul>

<h3>适合哪些场景</h3>
<ul>
  <li>项目资料较多，需要按目录分类维护的团队。</li>
  <li>需要集中管理需求文档、设计稿、测试附件和交付物的项目。</li>
  <li>希望在项目内快速上传、查找和整理文件的成员。</li>
</ul>
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "项目文件页面升级，支持文件夹浏览、上传、移动、重命名与批量管理。",
            "description": content,
            "content": content,
            "update_type": "improved",
            "tags": ["文件", "文件夹", "项目资料", "文件管理"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 5, 19, 0, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_filestore_page_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0012_add_custom_type_field_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_filestore_page_changelog,
            delete_filestore_page_changelog,
        ),
    ]
