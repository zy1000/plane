import django.db.models.deletion
from django.db import migrations, models
from django.conf import settings


class Migration(migrations.Migration):
    """与 0378 拆开：RunPython 读完 reviewer 列后再删列并加约束。"""

    dependencies = [
        ("db", "0378_plan_multi_reviewers"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="testplan",
            name="reviewer",
        ),
        migrations.AddConstraint(
            model_name="testplan",
            constraint=models.CheckConstraint(
                check=(
                    models.Q(("review_approval_type", "n_of_m"))
                    & models.Q(("review_required_count__gte", 1))
                )
                | (
                    ~models.Q(("review_approval_type", "n_of_m"))
                    & models.Q(("review_required_count__isnull", True))
                ),
                name="test_plan_review_required_count_consistent",
            ),
        ),
    ]
