from plane.db.models import (
    ApprovalType,
    DEFAULT_BUG_STATES,
    DEFAULT_STATES,
    IssueType,
    Project,
    State,
    Workflow,
    WorkflowTransition,
)
from plane.utils.data_model import IssueTypeModel


def init_issue_type() -> list[IssueTypeModel]:
    bug = IssueTypeModel(
        **{'icon': {"icon": {"name": "Bug", "color": "#8e0119", "background_color": "#FFFFFF"}, "in_use": "icon"},
           'display': '缺陷'})
    task = IssueTypeModel(**{'icon': {"icon": {"name": "Layers", "color": "#6796ff", "background_color": "#FFFFFF"},
                                      "in_use": "icon"}, 'display': '任务', 'is_default': True})
    epic = IssueTypeModel(**{'icon': {"icon": {"name": "Mountain", "color": "#ff877b", "background_color": "#FFFFFF"},
                                      "in_use": "icon"}, 'display': '史诗'})
    feature = IssueTypeModel(**{'icon': {"icon": {"name": "Cog", "color": "#9191f9", "background_color": "#FFFFFF"},
                                         "in_use": "icon"}, 'display': '特性'})
    story = IssueTypeModel(
        **{'icon': {"icon": {"name": "NotebookPen", "color": "#00A1EC", "background_color": "#FFFFFF"},
                    "in_use": "icon"}, 'display': '用户故事'})

    return [bug, task, epic, feature, story]


def temporary_create_issue_type(project: Project = None, project_id: str = None):
    if project_id:
        project = Project.objects.get(id=project_id)
    if IssueType.objects.filter(project=project).exists():
        return

    types = init_issue_type()
    issue_types = list()
    for issue_type in types:
        obj = IssueType.objects.create(name=issue_type.display, project=project,
                                       description=issue_type.display, is_default=issue_type.is_default,
                                       logo_props=issue_type.icon)
        issue_types.append(obj)
        # if obj.name == '缺陷':
        #     property_logo_props = {"icon": {"name": "AlignLeft", "color": "#6d7b8a"}, "in_use": "icon"}
        #     IssueTypeProperty.objects.create(issue_type=obj, project=project, workspace=project.workspace,
        #                                      display_name='修复版本', is_multi=False, logo_props=property_logo_props,
        #                                      settings={"display_format": "single-line"})
    return issue_types


def bulk_create_issue_state(issue_types: list[IssueType], **kwargs):
    create_list = list()
    for issue_type in issue_types:
        default_states = DEFAULT_BUG_STATES if issue_type.name == '缺陷' else DEFAULT_STATES
        for state in default_states:
            create_list.append(
                State(
                    name=state["name"],
                    color=state["color"],
                    project=kwargs['project'],
                    sequence=state["sequence"],
                    workspace=kwargs['workspace'],
                    group=state["group"],
                    default=state.get("default", False),
                    created_by=kwargs['created_by'],
                    issue_type_id=issue_type.id,
                )
            )

    State.objects.bulk_create(create_list)


def create_default_bug_workflow(issue_types: list[IssueType], **kwargs):
    defect_type_names = {'缺陷', 'Bug', 'bug', 'Defect', 'defect'}
    defect_issue_type = next((issue_type for issue_type in issue_types if issue_type.name in defect_type_names), None)
    if defect_issue_type is None:
        return None

    project = kwargs["project"]
    workflow = Workflow.objects.filter(
        project=project,
        issue_type=defect_issue_type,
        is_active=True,
        deleted_at__isnull=True,
    ).first()

    if workflow is None:
        workflow = Workflow.objects.create(
            project=project,
            workspace=kwargs["workspace"],
            issue_type=defect_issue_type,
            name="缺陷默认工作流",
            is_active=True,
            created_by=kwargs["created_by"],
        )

    states = State.objects.filter(project=project, issue_type=defect_issue_type, deleted_at__isnull=True)
    state_map = {state.name: state for state in states}

    transition_rules = [
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

    existing_transitions = set(
        WorkflowTransition.objects.filter(workflow=workflow, deleted_at__isnull=True).values_list(
            "from_state__name",
            "to_state__name",
        )
    )

    transitions = []
    for from_name, to_name in transition_rules:
        from_state = state_map.get(from_name)
        to_state = state_map.get(to_name)
        if from_state is None or to_state is None or (from_name, to_name) in existing_transitions:
            continue
        transitions.append(
            WorkflowTransition(
                workflow=workflow,
                project=project,
                workspace=kwargs["workspace"],
                from_state=from_state,
                to_state=to_state,
                approval_type=ApprovalType.ALL,
                created_by=kwargs["created_by"],
            )
        )

    if transitions:
        WorkflowTransition.objects.bulk_create(transitions)

    return workflow
