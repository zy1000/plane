import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0291_requirement_review_and_versions"),
    ]

    operations = [
        migrations.CreateModel(
            name="RequirementComment",
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
                ("comment_stripped", models.TextField(blank=True, verbose_name="Comment")),
                ("comment_json", models.JSONField(blank=True, default=dict)),
                ("comment_html", models.TextField(blank=True, default="<p></p>")),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
                (
                    "actor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirement_comments",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Comment Actor",
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
                    "parent",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="child_requirement_comments",
                        to="db.requirementcomment",
                    ),
                ),
                (
                    "requirement",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirement_comments",
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
                "verbose_name": "Requirement Comment",
                "verbose_name_plural": "Requirement Comments",
                "db_table": "requirement_comments",
                "ordering": ("created_at",),
            },
        ),
        migrations.AddField(
            model_name="fileasset",
            name="requirement_comment",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="assets",
                to="db.requirementcomment",
            ),
        ),
        migrations.AddIndex(
            model_name="requirementcomment",
            index=models.Index(
                fields=["requirement", "created_at"],
                name="requirement_comment_req_ts",
            ),
        ),
    ]
