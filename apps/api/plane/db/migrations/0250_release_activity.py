# Generated for release activity feed

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0249_drop_release_comment_edit_delete_permissions"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReleaseActivity",
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
                ("verb", models.CharField(default="created", max_length=255, verbose_name="Action")),
                (
                    "field",
                    models.CharField(blank=True, max_length=255, null=True, verbose_name="Field Name"),
                ),
                ("old_value", models.TextField(blank=True, null=True, verbose_name="Old Value")),
                ("new_value", models.TextField(blank=True, null=True, verbose_name="New Value")),
                ("comment", models.TextField(blank=True, verbose_name="Comment")),
                ("old_identifier", models.UUIDField(null=True)),
                ("new_identifier", models.UUIDField(null=True)),
                ("epoch", models.FloatField(null=True)),
                (
                    "actor",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="release_activities",
                        to=settings.AUTH_USER_MODEL,
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
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "release",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="release_activities",
                        to="db.release",
                    ),
                ),
                (
                    "release_comment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="release_comment_activities",
                        to="db.releasecomment",
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
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Release Activity",
                "verbose_name_plural": "Release Activities",
                "db_table": "release_activities",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="releaseactivity",
            index=models.Index(
                fields=["release", "created_at"],
                name="release_activity_release_ts",
            ),
        ),
    ]
