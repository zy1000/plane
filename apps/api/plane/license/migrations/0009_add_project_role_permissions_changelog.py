from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "项目角色权限功能上线"
CHANGELOG_VERSION = "1.2.0"


def create_project_role_permissions_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "项目现已支持自定义角色与细粒度权限配置，可按角色模板、项目角色和成员绑定方式更灵活地管理访问范围。",
            "description": "你现在可以在项目中创建角色、配置权限，并将角色分配给成员，满足不同协作场景下的权限控制需求。",
            "content": """
<h3>项目角色与权限能力已上线</h3>
<p>本次更新为项目协作引入了更细粒度的权限控制方式，你可以根据团队分工定义不同角色，并按角色授予项目内可执行的操作权限。</p>

<h3>你现在可以这样使用</h3>
<ul>
  <li>在项目中创建多个自定义角色，并为每个角色单独配置权限范围。</li>
  <li>查看项目角色详情，按权限模块快速确认当前角色拥有的能力。</li>
  <li>将工作区中的项目角色模板导入到具体项目，减少重复配置成本。</li>
  <li>为项目成员绑定一个或多个项目角色，让成员权限更贴近真实职责分工。</li>
  <li>系统会为现有项目自动补充默认角色，确保升级后原有成员仍可正常使用项目功能。</li>
</ul>

<h3>适合哪些场景</h3>
<ul>
  <li>希望把“项目管理员”“研发”“测试”“只读协作者”等职责拆分为不同权限组合的团队。</li>
  <li>需要限制部分成员只能查看、评论或处理特定类型项目操作的场景。</li>
  <li>希望先在工作区维护标准角色模板，再快速复用到多个项目中的团队。</li>
</ul>

<h3>带来的收益</h3>
<ul>
  <li>项目权限配置更细，避免所有成员都依赖统一的粗粒度角色。</li>
  <li>角色复用更方便，降低多项目协作时的维护成本。</li>
  <li>成员授权更清晰，便于后续审计和权限调整。</li>
</ul>

<p>如果你的团队需要更灵活地管理项目访问权限，现在就可以开始使用项目角色权限能力。</p>
""".strip(),
            "update_type": "added",
            "tags": ["project", "role", "permission"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 4, 1, 0, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_project_role_permissions_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0008_add_workflow_approval_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_project_role_permissions_changelog,
            delete_project_role_permissions_changelog,
        ),
    ]
