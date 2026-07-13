import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def create_legacy_requirement_versions(apps, schema_editor):
    Requirement = apps.get_model("db", "Requirement")
    RequirementVersion = apps.get_model("db", "RequirementVersion")
    RequirementVersionAttachment = apps.get_model(
        "db", "RequirementVersionAttachment"
    )

    for requirement in Requirement.objects.all().iterator():
        module = requirement.module
        parent = requirement.parent
        assignee = requirement.assignee
        reviewers = list(requirement.reviewers.all().order_by("display_name", "id"))
        relations = list(
            requirement.requirement_attachments.select_related(
                "asset", "asset__workspace"
            )
        )
        snapshot = {
            "name": requirement.name,
            "type": requirement.type,
            "priority": requirement.priority,
            "module": (
                {"id": str(module.id), "name": module.name} if module else None
            ),
            "parent": (
                {"id": str(parent.id), "name": parent.name, "type": parent.type}
                if parent
                else None
            ),
            "assignee": (
                {
                    "id": str(assignee.id),
                    "first_name": assignee.first_name,
                    "last_name": assignee.last_name,
                    "display_name": assignee.display_name,
                    "avatar": assignee.avatar,
                    "avatar_url": assignee.avatar,
                    "is_bot": assignee.is_bot,
                }
                if assignee
                else None
            ),
            "reviewers": [
                {
                    "id": str(reviewer.id),
                    "first_name": reviewer.first_name,
                    "last_name": reviewer.last_name,
                    "display_name": reviewer.display_name,
                    "avatar": reviewer.avatar,
                    "avatar_url": reviewer.avatar,
                    "is_bot": reviewer.is_bot,
                }
                for reviewer in reviewers
            ],
            "description_html": requirement.description_html,
            "acceptance_criteria_html": requirement.acceptance_criteria_html,
            "attachments": [
                {
                    "id": str(relation.asset_id),
                    "attributes": relation.asset.attributes or {},
                    "asset_url": (
                        f"/api/assets/v2/workspaces/"
                        f"{relation.asset.workspace.slug}/products/"
                        f"{relation.asset.product_id}/{relation.asset_id}/"
                        if relation.asset.workspace_id
                        and relation.asset.product_id
                        else None
                    ),
                    "created_at": (
                        relation.asset.created_at.isoformat()
                        if relation.asset.created_at
                        else None
                    ),
                    "updated_at": (
                        relation.asset.updated_at.isoformat()
                        if relation.asset.updated_at
                        else None
                    ),
                    "created_by": (
                        str(relation.asset.created_by_id)
                        if relation.asset.created_by_id
                        else None
                    ),
                }
                for relation in relations
            ],
        }
        version = RequirementVersion.objects.create(
            requirement=requirement,
            version=1,
            snapshot=snapshot,
            source="legacy_migration",
            created_by_id=requirement.created_by_id,
        )
        RequirementVersionAttachment.objects.bulk_create(
            [
                RequirementVersionAttachment(
                    version=version,
                    asset_id=relation.asset_id,
                    created_by_id=requirement.created_by_id,
                )
                for relation in relations
            ],
            batch_size=100,
        )
        Requirement.objects.filter(pk=requirement.pk).update(
            status="active", current_version=1
        )


class Migration(migrations.Migration):
    dependencies = [("db", "0290_product_owner_and_assets")]

    operations = [
        migrations.CreateModel(
            name="RequirementChange",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("sequence", models.PositiveIntegerField(verbose_name="Change Sequence")),
                ("kind", models.CharField(choices=[("initial", "初始创建"), ("change", "需求变更"), ("system_reset", "系统重置")], default="change", max_length=20, verbose_name="Change Kind")),
                ("status", models.CharField(choices=[("pending", "待评审"), ("approved", "已通过"), ("rejected", "已拒绝"), ("superseded", "已替代")], db_index=True, default="pending", max_length=20, verbose_name="Change Status")),
                ("base_snapshot", models.JSONField(blank=True, default=dict, verbose_name="Base Snapshot")),
                ("proposal_snapshot", models.JSONField(blank=True, default=dict, verbose_name="Proposal Snapshot")),
                ("name", models.CharField(max_length=255, verbose_name="Proposed Requirement Name")),
                ("priority", models.CharField(choices=[("urgent", "Urgent"), ("high", "High"), ("medium", "Medium"), ("low", "Low"), ("none", "None")], default="none", max_length=30, verbose_name="Proposed Requirement Priority")),
                ("description_html", models.JSONField(blank=True, null=True, verbose_name="Proposed Requirement Description HTML")),
                ("acceptance_criteria_html", models.JSONField(blank=True, null=True, verbose_name="Proposed Requirement Acceptance Criteria HTML")),
                ("completed_at", models.DateTimeField(blank=True, null=True, verbose_name="Completed At")),
                ("assignee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="proposed_requirement_changes", to=settings.AUTH_USER_MODEL, verbose_name="Proposed Assignee")),
            ],
            options={"verbose_name": "Requirement Change", "verbose_name_plural": "Requirement Changes", "db_table": "requirement_changes", "ordering": ("-sequence",)},
        ),
        migrations.CreateModel(
            name="RequirementChangeReviewer",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("latest_opinion", models.CharField(blank=True, choices=[("approved", "通过"), ("rejected", "拒绝"), ("needs_clarification", "有待明确")], db_index=True, max_length=30, null=True, verbose_name="Latest Review Opinion")),
                ("latest_reason", models.TextField(blank=True, default="", verbose_name="Latest Review Reason")),
                ("reviewed_at", models.DateTimeField(blank=True, null=True, verbose_name="Reviewed At")),
                ("change", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reviewer_assignments", to="db.requirementchange", verbose_name="Requirement Change")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("reviewer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="requirement_review_assignments", to=settings.AUTH_USER_MODEL, verbose_name="Reviewer")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
            ],
            options={"verbose_name": "Requirement Change Reviewer", "verbose_name_plural": "Requirement Change Reviewers", "db_table": "requirement_change_reviewers", "ordering": ("created_at",)},
        ),
        migrations.CreateModel(
            name="RequirementVersion",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("version", models.PositiveIntegerField(verbose_name="Version Number")),
                ("snapshot", models.JSONField(blank=True, default=dict, verbose_name="Requirement Snapshot")),
                ("source", models.CharField(default="review", max_length=30, verbose_name="Version Source")),
            ],
            options={"verbose_name": "Requirement Version", "verbose_name_plural": "Requirement Versions", "db_table": "requirement_versions", "ordering": ("-version",)},
        ),
        migrations.AddField(model_name="requirement", name="current_version", field=models.PositiveIntegerField(default=0, verbose_name="Current Requirement Version")),
        migrations.AddField(model_name="requirement", name="status", field=models.CharField(choices=[("in_review", "评审中"), ("active", "激活"), ("rejected", "拒绝")], db_index=True, default="in_review", max_length=20, verbose_name="Requirement Status")),
        migrations.CreateModel(
            name="RequirementVersionAttachment",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="requirement_version_attachments", to="db.fileasset", verbose_name="File Asset")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("version", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="version_attachments", to="db.requirementversion", verbose_name="Requirement Version")),
            ],
            options={"verbose_name": "Requirement Version Attachment", "verbose_name_plural": "Requirement Version Attachments", "db_table": "requirement_version_attachments"},
        ),
        migrations.AddField(model_name="requirementversion", name="attachments", field=models.ManyToManyField(blank=True, related_name="requirement_versions", through="db.RequirementVersionAttachment", to="db.fileasset", verbose_name="Version Attachments")),
        migrations.AddField(model_name="requirementversion", name="created_by", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
        migrations.AddField(model_name="requirementversion", name="requirement", field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="versions", to="db.requirement", verbose_name="Requirement")),
        migrations.AddField(model_name="requirementversion", name="source_change", field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="published_version", to="db.requirementchange", verbose_name="Approved Requirement Change")),
        migrations.AddField(model_name="requirementversion", name="updated_by", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
        migrations.CreateModel(
            name="RequirementReviewRecord",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("opinion", models.CharField(choices=[("approved", "通过"), ("rejected", "拒绝"), ("needs_clarification", "有待明确")], max_length=30, verbose_name="Review Opinion")),
                ("reason", models.TextField(blank=True, default="", verbose_name="Review Reason")),
                ("assignment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="records", to="db.requirementchangereviewer", verbose_name="Reviewer Assignment")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
            ],
            options={"verbose_name": "Requirement Review Record", "verbose_name_plural": "Requirement Review Records", "db_table": "requirement_review_records", "ordering": ("created_at",)},
        ),
        migrations.CreateModel(
            name="RequirementChangeAttachment",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="requirement_change_attachments", to="db.fileasset", verbose_name="File Asset")),
                ("change", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="change_attachments", to="db.requirementchange", verbose_name="Requirement Change")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
            ],
            options={"verbose_name": "Requirement Change Attachment", "verbose_name_plural": "Requirement Change Attachments", "db_table": "requirement_change_attachments"},
        ),
        migrations.AddField(model_name="requirementchange", name="attachments", field=models.ManyToManyField(blank=True, related_name="requirement_changes", through="db.RequirementChangeAttachment", to="db.fileasset", verbose_name="Proposed Attachments")),
        migrations.AddField(model_name="requirementchange", name="base_version", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="based_changes", to="db.requirementversion", verbose_name="Base Version")),
        migrations.AddField(model_name="requirementchange", name="created_by", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
        migrations.AddField(model_name="requirementchange", name="module", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="proposed_requirement_changes", to="db.requirementmodule", verbose_name="Proposed Requirement Module")),
        migrations.AddField(model_name="requirementchange", name="parent", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="proposed_child_changes", to="db.requirement", verbose_name="Proposed Parent Requirement")),
        migrations.AddField(model_name="requirementchange", name="proposed_reviewers", field=models.ManyToManyField(blank=True, related_name="proposed_review_requirement_changes", to=settings.AUTH_USER_MODEL, verbose_name="Proposed Reviewers")),
        migrations.AddField(model_name="requirementchange", name="requirement", field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="changes", to="db.requirement", verbose_name="Requirement")),
        migrations.AddField(model_name="requirementchange", name="updated_by", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
        migrations.AddConstraint(model_name="requirementversionattachment", constraint=models.UniqueConstraint(condition=models.Q(("deleted_at__isnull", True)), fields=("version", "asset"), name="requirement_version_attachment_unique_when_not_deleted")),
        migrations.AddConstraint(model_name="requirementversion", constraint=models.UniqueConstraint(condition=models.Q(("deleted_at__isnull", True)), fields=("requirement", "version"), name="requirement_version_unique_when_not_deleted")),
        migrations.AddIndex(model_name="requirementreviewrecord", index=models.Index(fields=["assignment", "created_at"], name="idx_requirement_review_history")),
        migrations.AddConstraint(model_name="requirementchangereviewer", constraint=models.UniqueConstraint(condition=models.Q(("deleted_at__isnull", True)), fields=("change", "reviewer"), name="requirement_change_reviewer_unique_when_not_deleted")),
        migrations.AddConstraint(model_name="requirementchangeattachment", constraint=models.UniqueConstraint(condition=models.Q(("deleted_at__isnull", True)), fields=("change", "asset"), name="requirement_change_attachment_unique_when_not_deleted")),
        migrations.AddIndex(model_name="requirementchange", index=models.Index(fields=["requirement", "status"], name="idx_requirement_change_status")),
        migrations.AddConstraint(model_name="requirementchange", constraint=models.UniqueConstraint(condition=models.Q(("deleted_at__isnull", True)), fields=("requirement", "sequence"), name="requirement_change_unique_sequence_when_not_deleted")),
        migrations.AddConstraint(model_name="requirementchange", constraint=models.UniqueConstraint(condition=models.Q(("deleted_at__isnull", True), ("status", "pending")), fields=("requirement",), name="requirement_change_unique_pending_when_not_deleted")),
        migrations.RunPython(
            create_legacy_requirement_versions,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
