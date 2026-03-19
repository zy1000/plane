from django.db import migrations


DEFECT_TYPE_NAMES = {"缺陷", "Bug", "bug", "Defect", "defect"}

TRANSITION_RULES = [
    ("Open", "Fixed"),
    ("Open", "Pending-Reject"),
    ("Fixed", "Reopen"),
    ("Fixed", "Closed"),
    ("Pending-Reject", "Rejected"),
    ("Pending-Reject", "Closed"),
    ("Pending-Reject", "Suspend"),
    ("Pending-Reject", "Reopen"),
    ("Suspend", "Closed"),
    ("Suspend", "Reopen"),
]

# 缺陷专属状态（与 DEFAULT_BUG_STATES 对齐）
BUG_STATES = [
    {"name": "Open",         "color": "#60646C", "sequence": 25000, "group": "unstarted"},
    {"name": "Fixed",        "color": "#F59E0B", "sequence": 35000, "group": "started"},
    {"name": "Pending-Reject","color": "#F59E0B", "sequence": 45000, "group": "started"},
    {"name": "Suspend",      "color": "#F59E0B", "sequence": 55000, "group": "started"},
    {"name": "Reopen",       "color": "#F59E0B", "sequence": 65000, "group": "started"},
    {"name": "Closed",       "color": "#46A758", "sequence": 75000, "group": "completed"},
    {"name": "Rejected",     "color": "#b30000", "sequence": 85000, "group": "cancelled"},
]

# TRANSITION_RULES 中涉及的所有状态名
REQUIRED_STATE_NAMES = {name for pair in TRANSITION_RULES for name in pair}


def ensure_bug_states(State, project, defect_issue_type):
    """确保缺陷 issue type 下存在所有必要的状态，不存在则补全创建。"""
    existing_states = list(
        State.objects.filter(
            project=project,
            issue_type=defect_issue_type,
            deleted_at__isnull=True,
        )
    )
    existing_names = {s.name for s in existing_states}

    missing = [s for s in BUG_STATES if s["name"] not in existing_names]
    if missing:
        State.objects.bulk_create([
            State(
                project=project,
                workspace=project.workspace,
                issue_type=defect_issue_type,
                name=s["name"],
                color=s["color"],
                sequence=s["sequence"],
                group=s["group"],
            )
            for s in missing
        ])
        # 重新查询以拿到完整列表（含刚创建的）
        existing_states = list(
            State.objects.filter(
                project=project,
                issue_type=defect_issue_type,
                deleted_at__isnull=True,
            )
        )

    return {state.name: state for state in existing_states}


def create_default_bug_workflow_for_existing_projects(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    ProjectIssueType = apps.get_model("db", "ProjectIssueType")
    State = apps.get_model("db", "State")
    Workflow = apps.get_model("db", "Workflow")
    WorkflowTransition = apps.get_model("db", "WorkflowTransition")

    projects = Project.objects.filter(deleted_at__isnull=True).select_related("workspace")

    for project in projects:
        # 找到该项目下的缺陷类型
        defect_pit = (
            ProjectIssueType.objects.filter(
                project=project,
                deleted_at__isnull=True,
                issue_type__name__in=DEFECT_TYPE_NAMES,
            )
            .select_related("issue_type")
            .first()
        )
        if defect_pit is None:
            continue

        defect_issue_type = defect_pit.issue_type

        # 已存在激活工作流则跳过创建
        workflow = Workflow.objects.filter(
            project=project,
            issue_type=defect_issue_type,
            is_active=True,
            deleted_at__isnull=True,
        ).first()

        if workflow is None:
            workflow = Workflow.objects.create(
                project=project,
                workspace=project.workspace,
                issue_type=defect_issue_type,
                name="缺陷默认工作流",
                is_active=True,
            )

        # 确保缺陷专属状态存在，老项目可能只有通用状态（Backlog/Todo 等）
        state_map = ensure_bug_states(State, project, defect_issue_type)

        # 查出已存在的 transition，避免重复创建
        existing_transitions = set(
            WorkflowTransition.objects.filter(
                workflow=workflow,
                deleted_at__isnull=True,
            ).values_list("from_state__name", "to_state__name")
        )

        transitions = []
        for from_name, to_name in TRANSITION_RULES:
            from_state = state_map.get(from_name)
            to_state = state_map.get(to_name)
            if from_state is None or to_state is None:
                continue
            if (from_name, to_name) in existing_transitions:
                continue
            transitions.append(
                WorkflowTransition(
                    workflow=workflow,
                    project=project,
                    workspace=project.workspace,
                    from_state=from_state,
                    to_state=to_state,
                    approval_type="all",
                )
            )

        if transitions:
            WorkflowTransition.objects.bulk_create(transitions)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0200_workflowtransition_dynamic_approver_types"),
    ]

    operations = [
        migrations.RunPython(
            create_default_bug_workflow_for_existing_projects,
            migrations.RunPython.noop,
        ),
    ]
