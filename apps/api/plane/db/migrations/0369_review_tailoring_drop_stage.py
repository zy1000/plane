"""裁剪表不再绑定阶段：纵轴一次铺开全部阶段的模板树。

存量数据直接清空（产品决策 2026-09-11）：旧表的格子只覆盖一个阶段，留着会变成一张
半截矩阵 —— 既读不懂，``sync_items`` 也补不回它当初为什么只有那一段。功能还在开发期，
清空重建比写一套补齐逻辑划算。

**删除必须手工级联。** ``SoftDeleteModel.delete()`` 的级联是 Celery 任务
（``plane/db/mixins.py:72``），投递发生在事务提交之前、没有 worker 就永远不跑；同一个
任务还把 PROTECT 当 CASCADE。迁移里一律走 queryset 级删除并自己收尾反向引用。

**删完要 ``SET CONSTRAINTS ALL IMMEDIATE``。** Django 建的外键是
``DEFERRABLE INITIALLY DEFERRED``，上面那批删除会在事务里排下一队延迟触发器；紧接着
的 ``RemoveField`` 要 ``ALTER TABLE review_tailorings``，Postgres 会直接拒绝：
``cannot ALTER TABLE ... because it has pending trigger events``。提前把队列刷掉，
整个迁移就还能留在一个事务里（拆成两个迁移也能绕过，但那样数据删除一旦提交就回不来）。
"""

from django.db import migrations


def drop_tailoring_data(apps, schema_editor):
    ReviewTailoring = apps.get_model("db", "ReviewTailoring")
    ReviewTailoringItem = apps.get_model("db", "ReviewTailoringItem")
    ReviewTailoringApproval = apps.get_model("db", "ReviewTailoringApproval")
    ReviewTailoringActivity = apps.get_model("db", "ReviewTailoringActivity")
    ReviewTailoringComment = apps.get_model("db", "ReviewTailoringComment")
    StageReview = apps.get_model("db", "StageReview")
    StageReviewActivity = apps.get_model("db", "StageReviewActivity")
    StageReviewComment = apps.get_model("db", "StageReviewComment")
    FileAsset = apps.get_model("db", "FileAsset")

    # 裁剪生效时生成的评审实例。手工新建的（template 为空、不被任何格子引用）留着。
    root_ids = list(
        ReviewTailoringItem.objects.filter(stage_review__isnull=False)
        .values_list("stage_review_id", flat=True)
        .distinct()
    )
    if root_ids:
        child_ids = list(
            StageReview.objects.filter(parent_id__in=root_ids).values_list(
                "id", flat=True
            )
        )
        review_ids = list({*root_ids, *child_ids})

        # 反向指针先置空，再删被指向的行
        ReviewTailoringItem.objects.filter(stage_review_id__in=review_ids).update(
            stage_review=None
        )
        FileAsset.objects.filter(
            stage_review_comment__stage_review_id__in=review_ids
        ).delete()
        FileAsset.objects.filter(stage_review_id__in=review_ids).delete()
        StageReviewActivity.objects.filter(stage_review_id__in=review_ids).delete()
        StageReviewComment.objects.filter(stage_review_id__in=review_ids).delete()
        StageReview.objects.filter(id__in=review_ids).delete()

    # 裁剪表自身：先叶子后根，activity 指向 comment，所以 comment 最后删
    ReviewTailoringActivity.objects.all().delete()
    ReviewTailoringComment.objects.all().delete()
    ReviewTailoringApproval.objects.all().delete()
    ReviewTailoringItem.objects.all().delete()
    ReviewTailoring.objects.all().delete()

    # 刷掉上面这批删除排下的延迟外键触发器，否则后面的 ALTER TABLE 过不去
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0368_seed_stage_review_permissions"),
    ]

    operations = [
        migrations.RunPython(drop_tailoring_data, migrations.RunPython.noop),
        migrations.RemoveIndex(
            model_name="reviewtailoring",
            name="rt_project_stage",
        ),
        migrations.RemoveField(
            model_name="reviewtailoring",
            name="stage",
        ),
    ]
