from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "项目默认私有"
CHANGELOG_VERSION = "1.12.0"


def create_private_project_default_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
## 亮点

- **新项目默认私有**：创建后仅受邀成员可访问
- **公开模式保留**：仍可按需创建公开项目

## 新功能 · Added
- 新项目默认创建为私有
- 支持邀请成员加入项目

## 优化 · Improved
- 保留公开项目创建模式
- 强化项目访问权限默认值

## 破坏性变更 · Breaking
- 项目创建默认权限已变更：未选择时创建为私有项目
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "新项目默认私有，成员需通过邀请加入，公开模式仍可选择",
            "description": content,
            "content": content,
            "update_type": "improved",
            "tags": ["项目", "权限", "成员邀请", "管理员"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 7, 2, 2, 0, tzinfo=dt_timezone.utc),
            "is_pinned": True,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_private_project_default_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0018_add_test_report_my_work_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_private_project_default_changelog,
            delete_private_project_default_changelog,
        ),
    ]
