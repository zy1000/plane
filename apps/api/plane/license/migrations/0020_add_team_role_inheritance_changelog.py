from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "v1.14.0 — 团队角色与权限继承"
CHANGELOG_VERSION = "1.14.0"


def create_team_role_inheritance_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
## 亮点

- **团队统一授权**：工作区与项目均可配置团队角色
- **成员自动继承**：团队成员自动获得对应角色权限

## 新功能 · Added
- 新增团队组织与成员管理
- 支持工作区为团队分配角色
- 支持项目为团队分配角色
- 新增团队成员角色权限继承
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "新增团队管理，支持在工作区与项目中为团队赋予角色并继承权限",
            "description": content,
            "content": content,
            "update_type": "added",
            "tags": ["团队", "工作区", "项目", "权限"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(
                2026,
                7,
                18,
                0,
                0,
                tzinfo=dt_timezone.utc,
            ),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_team_role_inheritance_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0019_add_private_project_default_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_team_role_inheritance_changelog,
            delete_team_role_inheritance_changelog,
        ),
    ]
