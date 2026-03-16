from plane.db.models import IssueType, State, DEFAULT_STATES, DEFAULT_BUG_STATES, Project, ProjectIssueType
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
    if ProjectIssueType.objects.filter(project=project).exists():
        return

    types = init_issue_type()
    issue_types = list()
    for issue_type in types:
        obj = IssueType.objects.create(name=issue_type.display, workspace=project.workspace,
                                       description=issue_type.display, is_default=issue_type.is_default,
                                       logo_props=issue_type.icon)
        issue_types.append(obj)
        ProjectIssueType.objects.create(project=project, issue_type=obj, workspace=project.workspace)
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
