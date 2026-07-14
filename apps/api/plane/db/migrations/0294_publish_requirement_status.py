from django.db import migrations, models


def publish_and_close_legacy_requirements(apps, schema_editor):
    Requirement = apps.get_model("db", "Requirement")
    RequirementLifecycleEvent = apps.get_model("db", "RequirementLifecycleEvent")

    Requirement.objects.filter(status="active").update(status="published")
    for requirement in Requirement.objects.filter(status="completed").iterator():
        requirement.status = "closed"
        requirement.closed_at = requirement.completed_at or requirement.updated_at
        requirement.closed_by_id = requirement.completed_by_id
        requirement.closed_reason_code = "other"
        requirement.closed_note = requirement.completion_note or "由已完成状态迁移为已关闭"
        requirement.save(
            update_fields=[
                "status",
                "closed_at",
                "closed_by",
                "closed_reason_code",
                "closed_note",
            ]
        )

    RequirementLifecycleEvent.objects.filter(action="completed", note="").update(
        action="closed",
        reason_code="other",
        note="由已完成状态迁移为已关闭",
    )
    RequirementLifecycleEvent.objects.filter(action="completed").update(
        action="closed",
        reason_code="other",
    )


class Migration(migrations.Migration):
    dependencies = [("db", "0293_requirement_lifecycle_and_drafts")]

    operations = [
        migrations.RunPython(
            publish_and_close_legacy_requirements,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="requirement",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "草稿"),
                    ("in_review", "评审中"),
                    ("published", "已发布"),
                    ("rejected", "拒绝"),
                    ("closed", "已关闭"),
                ],
                db_index=True,
                default="draft",
                max_length=20,
                verbose_name="Requirement Status",
            ),
        ),
        migrations.RemoveField(
            model_name="requirement",
            name="completed_at",
        ),
        migrations.RemoveField(
            model_name="requirement",
            name="completed_by",
        ),
        migrations.RemoveField(
            model_name="requirement",
            name="completion_note",
        ),
        migrations.AlterField(
            model_name="requirementlifecycleevent",
            name="action",
            field=models.CharField(
                choices=[
                    ("draft_created", "创建草稿"),
                    ("submitted", "提交评审"),
                    ("withdrawn", "撤回评审"),
                    ("draft_discarded", "放弃草稿"),
                    ("closed", "关闭"),
                    ("reopened", "重新打开"),
                    ("archived", "归档"),
                    ("restored", "恢复归档"),
                ],
                db_index=True,
                max_length=30,
                verbose_name="Lifecycle Action",
            ),
        ),
    ]
