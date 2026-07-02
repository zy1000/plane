from django.db import migrations


ISSUE_PERMISSION_CATEGORY_UPDATES = {
    "issue.comment.create": "工作项",
    "issue.comment.edit": "工作项",
    "issue.comment.delete": "工作项",
    "issue.link.manage": "工作项",
    "issue.relation.manage": "工作项",
    "issue.attachment.download": "工作项",
    "issue.attachment.upload": "工作项",
    "issue.attachment.delete": "工作项",
}

ISSUE_PERMISSION_CATEGORY_ROLLBACKS = {
    "issue.comment.create": "工作项评论",
    "issue.comment.edit": "工作项评论",
    "issue.comment.delete": "工作项评论",
    "issue.link.manage": "工作项外部链接",
    "issue.relation.manage": "工作项关联",
    "issue.attachment.download": "工作项附件",
    "issue.attachment.upload": "工作项附件",
    "issue.attachment.delete": "工作项附件",
}


def _update_permission_categories(Permission, category_by_key):
    for key, category in category_by_key.items():
        Permission.objects.filter(key=key).update(category=category)


def merge_issue_related_permission_categories(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    _update_permission_categories(Permission, ISSUE_PERMISSION_CATEGORY_UPDATES)


def restore_issue_related_permission_categories(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    _update_permission_categories(Permission, ISSUE_PERMISSION_CATEGORY_ROLLBACKS)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0283_activate_intake_view_permission"),
    ]

    operations = [
        migrations.RunPython(
            merge_issue_related_permission_categories,
            restore_issue_related_permission_categories,
        ),
    ]
