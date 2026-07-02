from django.db import migrations


PROJECT_PAGE_VIEW_PERMISSION_CATEGORY_UPDATES = {
    "intake.view": "收集",
    "project.defects.view": "缺陷",
    "project.requirements.view": "需求",
    "project.work_items.view": "工作项",
}


PROJECT_PAGE_VIEW_PERMISSION_CATEGORY_ROLLBACKS = {
    key: "项目页面" for key in PROJECT_PAGE_VIEW_PERMISSION_CATEGORY_UPDATES
}


def _update_permission_categories(Permission, category_by_key):
    for key, category in category_by_key.items():
        Permission.objects.filter(key=key).update(category=category)


def split_project_page_view_permission_categories(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    _update_permission_categories(
        Permission, PROJECT_PAGE_VIEW_PERMISSION_CATEGORY_UPDATES
    )


def restore_project_page_view_permission_categories(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    _update_permission_categories(
        Permission, PROJECT_PAGE_VIEW_PERMISSION_CATEGORY_ROLLBACKS
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0284_merge_issue_related_permission_categories"),
    ]

    operations = [
        migrations.RunPython(
            split_project_page_view_permission_categories,
            restore_project_page_view_permission_categories,
        ),
    ]
