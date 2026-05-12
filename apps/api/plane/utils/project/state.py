from unicodedata import category

from plane.db.models import (
    ApprovalType,
    DEFAULT_BUG_STATES,
    DEFAULT_STATES,
    IssueType,
    Project,
    State,
    TypeExtraField,
    Workflow,
    WorkflowTransition,
    WorkflowTransitionRequiredField, IssueTypeCategory,
)
from plane.utils.data_model import IssueTypeModel


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
            "display": "软件缺陷",
            "category": "缺陷"
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
            "category": "任务"
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
            "category": "需求"
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
            "category": "需求"
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
            "category": "需求"
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
            DEFAULT_BUG_STATES if issue_type.name == "缺陷" else DEFAULT_STATES
        )
        for state in default_states:
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


def create_default_bug_extra_field(issue_types: list[IssueType]):
    defect_type_names = {"缺陷", "Bug", "bug", "Defect", "defect"}
    defect_issue_type = next(
        (
            issue_type
            for issue_type in issue_types
            if issue_type.name in defect_type_names
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


def create_default_bug_workflow(issue_types: list[IssueType], **kwargs):
    defect_type_names = {"缺陷", "Bug", "bug", "Defect", "defect"}
    defect_issue_type = next(
        (
            issue_type
            for issue_type in issue_types
            if issue_type.name in defect_type_names
        ),
        None,
    )
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

    states = State.objects.filter(
        project=project, issue_type=defect_issue_type, deleted_at__isnull=True
    )
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
        WorkflowTransition.objects.filter(
            workflow=workflow, deleted_at__isnull=True
        ).values_list(
            "from_state__name",
            "to_state__name",
        )
    )

    transitions = []
    for from_name, to_name in transition_rules:
        from_state = state_map.get(from_name)
        to_state = state_map.get(to_name)
        if (
            from_state is None
            or to_state is None
            or (from_name, to_name) in existing_transitions
        ):
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

    # 为 Open -> Fixed 流转边绑定必填字段
    open_state = state_map.get("Open")
    fixed_state = state_map.get("Fixed")
    if open_state and fixed_state:
        open_to_fixed = WorkflowTransition.objects.filter(
            workflow=workflow,
            from_state=open_state,
            to_state=fixed_state,
            deleted_at__isnull=True,
        ).first()
        if open_to_fixed:
            required_field_names = ["修复版本", "解决方案"]
            extra_fields = TypeExtraField.objects.filter(
                issue_type=defect_issue_type,
                name__in=required_field_names,
                deleted_at__isnull=True,
            )
            existing_field_ids = set(
                WorkflowTransitionRequiredField.objects.filter(
                    workflow=open_to_fixed,
                    deleted_at__isnull=True,
                ).values_list("extra_field_id", flat=True)
            )
            required_field_records = [
                WorkflowTransitionRequiredField(
                    workflow=open_to_fixed,
                    extra_field=field,
                )
                for field in extra_fields
                if field.id not in existing_field_ids
            ]
            if required_field_records:
                WorkflowTransitionRequiredField.objects.bulk_create(
                    required_field_records
                )

    return workflow
