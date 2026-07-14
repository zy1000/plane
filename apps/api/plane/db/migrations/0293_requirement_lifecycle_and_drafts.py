import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Max


def normalize_requirement_lifecycle(apps, schema_editor):
    Requirement = apps.get_model("db", "Requirement")
    RequirementChange = apps.get_model("db", "RequirementChange")
    RequirementChangeAttachment = apps.get_model("db", "RequirementChangeAttachment")

    Requirement.objects.filter(current_version__gt=0).update(status="active")

    orphan_requirements = Requirement.objects.filter(current_version=0, status="in_review").exclude(
        changes__status="pending"
    )
    for requirement in orphan_requirements.iterator():
        max_sequence = (
            RequirementChange.objects.filter(requirement_id=requirement.id).aggregate(value=Max("sequence"))["value"]
            or 0
        )
        change = RequirementChange.objects.create(
            requirement_id=requirement.id,
            sequence=max_sequence + 1,
            kind="initial",
            status="draft",
            base_snapshot={},
            proposal_snapshot={
                "name": requirement.name,
                "type": requirement.type,
                "priority": requirement.priority,
                "description_html": requirement.description_html,
                "acceptance_criteria_html": requirement.acceptance_criteria_html,
            },
            name=requirement.name,
            priority=requirement.priority,
            module_id=requirement.module_id,
            parent_id=requirement.parent_id,
            assignee_id=requirement.assignee_id,
            description_html=requirement.description_html,
            acceptance_criteria_html=requirement.acceptance_criteria_html,
            created_by_id=requirement.created_by_id,
        )
        change.proposed_reviewers.set(requirement.reviewers.all())
        RequirementChangeAttachment.objects.bulk_create(
            [
                RequirementChangeAttachment(
                    change_id=change.id,
                    asset_id=asset_id,
                    created_by_id=requirement.created_by_id,
                )
                for asset_id in requirement.requirement_attachments.values_list("asset_id", flat=True)
            ],
            batch_size=100,
        )
        Requirement.objects.filter(pk=requirement.pk).update(status="draft")


class Migration(migrations.Migration):
    dependencies = [("db", "0292_requirement_comments")]

    operations = [
        migrations.RemoveConstraint(
            model_name="requirementchange",
            name="requirement_change_unique_pending_when_not_deleted",
        ),
        migrations.AlterField(
            model_name="requirement",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "草稿"),
                    ("in_review", "评审中"),
                    ("active", "激活"),
                    ("rejected", "拒绝"),
                    ("completed", "已完成"),
                    ("closed", "已关闭"),
                ],
                db_index=True,
                default="draft",
                max_length=20,
                verbose_name="Requirement Status",
            ),
        ),
        migrations.AlterField(
            model_name="requirementchange",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "草稿"),
                    ("pending", "待评审"),
                    ("approved", "已通过"),
                    ("rejected", "已拒绝"),
                    ("cancelled", "已取消"),
                    ("superseded", "已替代"),
                ],
                db_index=True,
                default="draft",
                max_length=20,
                verbose_name="Change Status",
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="archived_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True, verbose_name="Archived At"),
        ),
        migrations.AddField(
            model_name="requirement",
            name="archived_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="archived_requirements",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Archived By",
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="closed_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Closed At"),
        ),
        migrations.AddField(
            model_name="requirement",
            name="closed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="closed_requirements",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Closed By",
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="closed_note",
            field=models.TextField(blank=True, default="", verbose_name="Close Note"),
        ),
        migrations.AddField(
            model_name="requirement",
            name="closed_reason_code",
            field=models.CharField(
                blank=True,
                choices=[
                    ("cancelled", "需求取消"),
                    ("duplicate", "重复需求"),
                    ("postponed", "暂不实施"),
                    ("replaced", "已被替代"),
                    ("other", "其他"),
                ],
                default="",
                max_length=20,
                verbose_name="Close Reason",
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Completed At"),
        ),
        migrations.AddField(
            model_name="requirement",
            name="completed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="completed_requirements",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Completed By",
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="completion_note",
            field=models.TextField(blank=True, default="", verbose_name="Completion Note"),
        ),
        migrations.CreateModel(
            name="RequirementLifecycleEvent",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("draft_created", "创建草稿"),
                            ("submitted", "提交评审"),
                            ("withdrawn", "撤回评审"),
                            ("draft_discarded", "放弃草稿"),
                            ("completed", "完成"),
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
                ("from_status", models.CharField(blank=True, default="", max_length=20, verbose_name="From Status")),
                ("to_status", models.CharField(blank=True, default="", max_length=20, verbose_name="To Status")),
                ("reason_code", models.CharField(blank=True, default="", max_length=30, verbose_name="Reason Code")),
                ("note", models.TextField(blank=True, default="", verbose_name="Note")),
                ("metadata", models.JSONField(blank=True, default=dict, verbose_name="Metadata")),
                (
                    "change",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="lifecycle_events",
                        to="db.requirementchange",
                        verbose_name="Requirement Change",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "requirement",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lifecycle_events",
                        to="db.requirement",
                        verbose_name="Requirement",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Requirement Lifecycle Event",
                "verbose_name_plural": "Requirement Lifecycle Events",
                "db_table": "requirement_lifecycle_events",
                "ordering": ("created_at",),
                "indexes": [
                    models.Index(
                        fields=["requirement", "created_at"],
                        name="idx_req_lifecycle_history",
                    )
                ],
            },
        ),
        migrations.RunPython(normalize_requirement_lifecycle, reverse_code=migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="requirementchange",
            constraint=models.UniqueConstraint(
                condition=models.Q(deleted_at__isnull=True, status__in=["draft", "pending"]),
                fields=("requirement",),
                name="requirement_change_unique_open_when_not_deleted",
            ),
        ),
    ]
