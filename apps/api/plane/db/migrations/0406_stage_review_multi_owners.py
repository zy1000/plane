"""阶段评审的负责人 / 审核者改为多人。

与 0407 拆开：RunPython 往中间表插行后再删 stage_reviews 的 leader / auditor 列，
避免 Postgres pending trigger 问题（同 0378 / 0379 的理由）。
"""

from django.conf import settings
from django.db import migrations, models

#: (旧外键列, 新多对多字段)
OWNER_FIELDS = (("leader_id", "leaders"), ("auditor_id", "auditors"))


def copy_single_to_multi(apps, schema_editor):
    """把单个负责人 / 审核者复制进中间表。软删的评审也一并带上，回滚时才还得回去。"""
    StageReview = apps.get_model("db", "StageReview")
    db_alias = schema_editor.connection.alias

    for column, field in OWNER_FIELDS:
        through = getattr(StageReview, field).through
        rows = (
            StageReview.objects.using(db_alias)
            .filter(**{f"{column}__isnull": False})
            .values_list("id", column)
        )
        through.objects.using(db_alias).bulk_create(
            [
                through(stagereview_id=review_id, user_id=user_id)
                for review_id, user_id in rows.iterator()
            ],
            batch_size=1000,
            ignore_conflicts=True,
        )


def restore_first_owner(apps, schema_editor):
    """回滚：每条评审取中间表第一条回填到单值列。"""
    StageReview = apps.get_model("db", "StageReview")
    db_alias = schema_editor.connection.alias

    for column, field in OWNER_FIELDS:
        through = getattr(StageReview, field).through
        first_by_review = {}
        for review_id, user_id in (
            through.objects.using(db_alias)
            .order_by("stagereview_id", "id")
            .values_list("stagereview_id", "user_id")
            .iterator()
        ):
            first_by_review.setdefault(review_id, user_id)

        for review_id, user_id in first_by_review.items():
            StageReview.objects.using(db_alias).filter(id=review_id).update(
                **{column: user_id}
            )

    # 本函数之后同一迁移里还要 ALTER stage_reviews（删 leaders / auditors），
    # 上面的 UPDATE 会留下延迟约束的待触发事件，不先结清 Postgres 会报
    # "cannot ALTER TABLE because it has pending trigger events"
    schema_editor.execute("SET CONSTRAINTS ALL IMMEDIATE")


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0405_project_stage_duration_days"),
    ]

    operations = [
        migrations.AddField(
            model_name="stagereview",
            name="leaders",
            field=models.ManyToManyField(
                blank=True,
                db_table="stage_review_leaders",
                related_name="led_stage_reviews",
                to=settings.AUTH_USER_MODEL,
                verbose_name="主导者",
            ),
        ),
        migrations.AddField(
            model_name="stagereview",
            name="auditors",
            field=models.ManyToManyField(
                blank=True,
                db_table="stage_review_auditors",
                related_name="audited_stage_reviews",
                to=settings.AUTH_USER_MODEL,
                verbose_name="审核者",
            ),
        ),
        migrations.RunPython(copy_single_to_multi, restore_first_owner),
    ]
