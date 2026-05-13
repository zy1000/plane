# Generated manually — backfill IssueType.category for existing records

from django.db import migrations


def backfill_issue_type_categories(apps, schema_editor):
    """
    For every workspace, ensure the three system categories exist,
    then assign each IssueType (with category=NULL) to the correct
    category based on its name.
    """
    IssueTypeCategory = apps.get_model("db", "IssueTypeCategory")
    IssueType = apps.get_model("db", "IssueType")
    Workspace = apps.get_model("db", "Workspace")

    # ── name → category name mapping ──────────────────────────────────────
    DEFECT_NAMES = {"缺陷", "Bug", "bug", "Defect", "defect"}
    TASK_NAMES = {"任务", "Task", "task"}
    REQUIREMENT_NAMES = {
        "史诗", "Epic", "epic",
        "特性", "Feature", "feature",
        "用户故事", "Story", "story", "User Story", "user story",
    }

    name_to_category = {}
    for names, cat_name in (
        (DEFECT_NAMES, "缺陷"),
        (TASK_NAMES, "任务"),
        (REQUIREMENT_NAMES, "需求"),
    ):
        for n in names:
            name_to_category[n] = cat_name

    # ── ensure every workspace has the 3 system categories ────────────────
    system_names = {"需求", "任务", "缺陷"}
    for workspace in Workspace.objects.all():
        existing = set(
            IssueTypeCategory.objects.filter(workspace=workspace)
            .values_list("name", flat=True)
        )
        missing = system_names - existing
        for name in missing:
            IssueTypeCategory.objects.create(
                workspace=workspace,
                name=name,
                is_system=True,
            )

    # ── build per-workspace category lookup ───────────────────────────────
    workspace_categories = {}
    for cat in IssueTypeCategory.objects.select_related("workspace").all():
        workspace_categories.setdefault(cat.workspace_id, {})[cat.name] = cat

    # ── backfill IssueType.category ───────────────────────────────────────
    to_update = []
    for issue_type in IssueType.objects.filter(category__isnull=True).select_related("project__workspace"):
        workspace_id = issue_type.workspace_id
        cat_name = name_to_category.get(issue_type.name)
        if cat_name is None:
            # Unknown name — leave category as NULL (will be treated as
            # "not a defect / not a requirement / not a task" by the
            # application logic, which is the safest fallback).
            continue
        category = workspace_categories.get(workspace_id, {}).get(cat_name)
        if category is None:
            continue
        issue_type.category = category
        to_update.append(issue_type)

    if to_update:
        IssueType.objects.bulk_update(to_update, ["category"])


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0230_issuetypecategory_issuetype_category_and_more"),
    ]

    operations = [
        migrations.RunPython(
            backfill_issue_type_categories,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
