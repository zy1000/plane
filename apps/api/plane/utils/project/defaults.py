from django.db.models import Model

from plane.db.models import (
    ApprovalType,
    DEFAULT_BUG_STATES,
    DEFAULT_STATES,
    IssueType,
    Project,
    State,
    StateGroup,
    TypeExtraField,
    Workflow,
    WorkflowPrincipalDimension,
    WorkflowPrincipalKind,
    WorkflowTransition,
    WorkflowTransitionPrincipal,
    WorkflowTransitionRequiredField,
    IssueTypeCategory, User, Workspace, WorkspaceRole, ProjectRole
)
from plane.utils.data_model import IssueTypeModel
from plane.utils.project.member import add_user_to_project

QA_ROLE_SET = ['软件测试工程师', '软件测试负责人']
RD_ROLE_SET = ['软件研发工程师', '软件研发负责人']
BUG_REQUIRED_FIELD = ["修复版本", "技术原因及解决方案"]
TRANSITION_RULES = [
    dict(from_state='Backlog', to_state='Open', initiator=None, assignee=dict(role_name=RD_ROLE_SET)),
    dict(from_state='Open', to_state='Fixed', initiator=dict(role_name=RD_ROLE_SET),
         assignee=dict(role_name=QA_ROLE_SET), required_field=['修复版本', '技术原因及解决方案', '缺陷原因']),
    dict(from_state='Open', to_state='Pending-Reject', initiator=dict(role_name=RD_ROLE_SET),
         assignee=dict(role_name=QA_ROLE_SET), required_field=['技术原因及解决方案']),
    dict(from_state='Fixed', to_state='Reopen', initiator=dict(role_name=QA_ROLE_SET),
         assignee=dict(role_name=RD_ROLE_SET)),
    dict(from_state='Fixed', to_state='Closed', initiator=dict(role_name=QA_ROLE_SET),
         assignee=dict(dynamic_target=['created_by']), required_field=BUG_REQUIRED_FIELD),
    dict(from_state='Pending-Reject', to_state='Rejected',
         initiator=dict(role_name=QA_ROLE_SET),
         assignee=dict(dynamic_target=['created_by']),
         approver=dict(role_name=['软件测试负责人'], member_name=['欧秋洁', '何洽', '钟长会']),
         required_field=['技术原因及解决方案'], approval_type=ApprovalType.N_OF_M, required_count=2
         ),
    dict(from_state='Pending-Reject', to_state='Suspend',
         initiator=dict(role_name=QA_ROLE_SET),
         assignee=dict(dynamic_target=['created_by']),
         approver=dict(role_name=['软件测试负责人'], member_name=['欧秋洁', '何洽', '钟长会']),
         required_field=['技术原因及解决方案'], approval_type=ApprovalType.N_OF_M, required_count=2
         ),
    dict(from_state='Pending-Reject', to_state='Reopen', initiator=dict(role_name=QA_ROLE_SET),
         assignee=dict(role_name=RD_ROLE_SET)),
    dict(from_state='Suspend', to_state='Closed', initiator=dict(dynamic_target=['created_by']),
         assignee=dict(dynamic_target=['created_by']), required_field=BUG_REQUIRED_FIELD),
    dict(from_state='Suspend', to_state='Reopen', initiator=dict(dynamic_target=['created_by']),
         assignee=dict(role_name=RD_ROLE_SET)),
    dict(from_state='Reopen', to_state='Fixed', initiator=dict(role_name=RD_ROLE_SET),
         assignee=dict(role_name=QA_ROLE_SET), required_field=BUG_REQUIRED_FIELD),
    dict(from_state='Reopen', to_state='Pending-Reject', initiator=dict(role_name=RD_ROLE_SET),
         assignee=dict(role_name=QA_ROLE_SET), required_field=['技术原因及解决方案']),
]


def get_bug_issue_type(issue_types: list[IssueType]):
    return next((issue_type for issue_type in issue_types if getattr(issue_type.category, "name", None) == "缺陷"),
                None)


def init_issue_type() -> list[IssueTypeModel]:
    bug = IssueTypeModel(
        **{
            "icon": {
                "icon": {
                    "name": "Bug",
                    "color": "#8e0119",
                    "background_color": "#FFFFFF",
                },
                "in_use": "icon",
            },
            "display": "缺陷(软件)",
            "category": "缺陷",
        }
    )
    task = IssueTypeModel(
        **{
            "icon": {
                "icon": {
                    "name": "Layers",
                    "color": "#6796ff",
                    "background_color": "#FFFFFF",
                },
                "in_use": "icon",
            },
            "display": "任务",
            "is_default": True,
            "category": "任务",
        }
    )
    epic = IssueTypeModel(
        **{
            "icon": {
                "icon": {
                    "name": "Mountain",
                    "color": "#ff877b",
                    "background_color": "#FFFFFF",
                },
                "in_use": "icon",
            },
            "display": "史诗",
            "category": "需求",
        }
    )
    feature = IssueTypeModel(
        **{
            "icon": {
                "icon": {
                    "name": "Cog",
                    "color": "#9191f9",
                    "background_color": "#FFFFFF",
                },
                "in_use": "icon",
            },
            "display": "特性",
            "category": "需求",
        }
    )
    story = IssueTypeModel(
        **{
            "icon": {
                "icon": {
                    "name": "NotebookPen",
                    "color": "#00A1EC",
                    "background_color": "#FFFFFF",
                },
                "in_use": "icon",
            },
            "display": "用户故事",
            "category": "需求",
        }
    )

    return [bug, task, epic, feature, story]


def temporary_create_issue_type(project: Project = None, project_id: str = None):
    if project_id:
        project = Project.objects.get(id=project_id)
    if IssueType.objects.filter(project=project).exists():
        return

    # 获取工作项类型类别
    category_map = dict()
    for obj in IssueTypeCategory.objects.filter(workspace=project.workspace):
        category_map[obj.name] = obj

    types = init_issue_type()
    issue_types = list()
    for issue_type in types:
        obj = IssueType.objects.create(
            name=issue_type.display,
            project=project,
            description=issue_type.display,
            is_default=issue_type.is_default,
            logo_props=issue_type.icon,
            category=category_map[issue_type.category],
        )
        issue_types.append(obj)
    return issue_types


def bulk_create_issue_state(issue_types: list[IssueType], **kwargs):
    create_list = list()
    for issue_type in issue_types:
        default_states = (
            DEFAULT_BUG_STATES
            if getattr(issue_type.category, "name", None) == "缺陷"
            else DEFAULT_STATES
        )
        for state in default_states:
            # Triage 不绑 issue_type，统一在函数末尾按项目维度幂等创建一条。
            if state["group"] == StateGroup.TRIAGE.value:
                continue
            create_list.append(
                State(
                    name=state["name"],
                    color=state["color"],
                    project=kwargs["project"],
                    sequence=state["sequence"],
                    workspace=kwargs["workspace"],
                    group=state["group"],
                    default=state.get("default", False),
                    created_by=kwargs["created_by"],
                    issue_type_id=issue_type.id,
                )
            )

    State.objects.bulk_create(create_list)

    project = kwargs["project"]
    if not State.triage_objects.filter(project=project).exists():
        State.objects.create(
            name="Triage",
            color="#4E5355",
            project=project,
            sequence=65000,
            workspace=kwargs["workspace"],
            group=StateGroup.TRIAGE.value,
            default=False,
            created_by=kwargs["created_by"],
            issue_type=None,
        )


def create_default_bug_extra_field(issue_types: list[IssueType]):
    defect_issue_type = next(
        (
            issue_type
            for issue_type in issue_types
            if getattr(issue_type.category, "name", None) == "缺陷"
        ),
        None,
    )
    if defect_issue_type is None:
        return
    project = defect_issue_type.project
    # 软件版本
    TypeExtraField.objects.create(
        issue_type=defect_issue_type, project=project, name="软件版本", is_required=True
    )

    # 发现方式
    discover = {
        "choices": [
            "自动化测试",
            "手工测试",
            "其他",
        ],
        "selection_mode": "single",
    }
    TypeExtraField.objects.create(
        issue_type=defect_issue_type,
        project=project,
        name="发现方式",
        is_required=True,
        options=discover,
        field_type="select",
        default_value="自动化测试",
    )

    # 缺陷级别
    bug_level = {
        "choices": [
            "security",
            "key",
            "major",
            "general",
            "minor",
            "suggest",
            "safely",
        ],
        "selection_mode": "single",
    }
    TypeExtraField.objects.create(
        issue_type=defect_issue_type,
        project=project,
        name="缺陷级别",
        is_required=True,
        options=bug_level,
        field_type="select",
        default_value="general",
    )

    # 缺陷原因
    bug_cause = {
        "choices": [
            "需求不明确",
            "需求未实现",
            "设计-算法",
            "设计-框架",
            "设计-逻辑",
            "编码",
            "配置错误",
            "第三方组件",
            "测试环境错误",
            "用例设计错误",
            "编译打包",
            "其他",
            "编码-接口",
            "编码-调度",
            "编码-逻辑",
        ],
        "selection_mode": "single",
    }
    TypeExtraField.objects.create(
        issue_type=defect_issue_type,
        project=project,
        name="缺陷原因",
        options=bug_cause,
        field_type="select",
    )

    # 修复版本
    TypeExtraField.objects.create(
        issue_type=defect_issue_type, project=project, name="修复版本"
    )

    # 解决方案
    TypeExtraField.objects.create(
        issue_type=defect_issue_type,
        project=project,
        name="技术原因及解决方案",
        options={"text_mode": "paragraph"},
    )


def add_principal(rule_info: dict, project: Project, transition: WorkflowTransition):
    """添加工作流的审批人、目标人、发起人"""
    bulk_object = []

    def add(data: dict, dimension: str):
        for key, value in data.items():
            if key == 'role_name':
                role_ids = list(
                    ProjectRole.objects.filter(project=project, name__in=value).values_list('id', flat=True))
                for role_id in role_ids:
                    bulk_object.append(
                        WorkflowTransitionPrincipal(transition=transition, role_id=role_id, dimension=dimension,
                                                    kind=WorkflowPrincipalKind.ROLE))
            elif key == 'member_name':
                member_ids = list(
                    User.objects.filter(display_name__in=value).values_list('id', flat=True)
                )
                for member_id in member_ids:
                    bulk_object.append(
                        WorkflowTransitionPrincipal(transition=transition, member_id=member_id, dimension=dimension,
                                                    kind=WorkflowPrincipalKind.MEMBER))
            elif key == 'dynamic_target':
                for dynamic_target in value:
                    bulk_object.append(
                        WorkflowTransitionPrincipal(transition=transition, dynamic_target=dynamic_target,
                                                    dimension=dimension,
                                                    kind=WorkflowPrincipalKind.DYNAMIC))

    if initiator := rule_info.get('initiator'):
        add(initiator, WorkflowPrincipalDimension.INITIATOR)
    if assignee := rule_info.get('assignee'):
        add(assignee, WorkflowPrincipalDimension.ASSIGNEE)
    if approver := rule_info.get('approver'):
        add(approver, WorkflowPrincipalDimension.APPROVER)

    # 批量生成操作人记录
    WorkflowTransitionPrincipal.objects.bulk_create(bulk_object)


def create_default_bug_workflow(issue_types: list[IssueType], **kwargs):
    defect_issue_type = get_bug_issue_type(issue_types)
    if defect_issue_type is None:
        return None

    project = kwargs["project"]

    # 将三人添加进项目里面
    approver_users = User.objects.filter(display_name__in=['欧秋洁', '何洽', '钟长会','杨玉柱'])
    add_user_to_project(approver_users, project)

    # 创建默认缺陷工作流
    workflow = Workflow.objects.create(
        project=project,
        workspace=kwargs["workspace"],
        issue_type=defect_issue_type,
        name="缺陷默认工作流",
        is_active=True,
        created_by=kwargs["created_by"],
    )

    states = State.objects.filter(
        project=project, issue_type=defect_issue_type, deleted_at__isnull=True
    )
    state_map = {state.name: state for state in states}

    for rule_info in TRANSITION_RULES:
        from_state = state_map.get(rule_info["from_state"])
        to_state = state_map.get(rule_info["to_state"])
        # 创建工作流规则
        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            project=project,
            workspace=kwargs["workspace"],
            from_state=from_state,
            to_state=to_state,
            approval_type=rule_info.get('approval_type', ApprovalType.ALL),
            required_count=rule_info.get('required_count'),
        )

        add_principal(rule_info, project, transition)

        # 创建必须字段
        if required_field := rule_info.get('required_field'):
            extra_fields = TypeExtraField.objects.filter(
                issue_type=defect_issue_type,
                name__in=required_field,
                deleted_at__isnull=True,
            )
            required_field_records = [
                WorkflowTransitionRequiredField(
                    workflow=transition,
                    extra_field=field,
                )
                for field in extra_fields
            ]
            WorkflowTransitionRequiredField.objects.bulk_create(required_field_records)

    return workflow


def create_default_role(workspace: Workspace, project_id: str):
    workspace_roles: list[WorkspaceRole] = WorkspaceRole.objects.filter(workspace=workspace)
    bulk_obj = [
        ProjectRole(name=role.name, description=role.description, permissions=role.permissions, source_template=role,
                    project_id=project_id, workspace=workspace)
        for role in workspace_roles
    ]
    ProjectRole.objects.bulk_create(bulk_obj)
