from django.db.models import Model

from plane.db.models import (
    DEFAULT_BUG_STATES,
    DEFAULT_STATES,
    IssueType,
    Project,
    State,
    StateGroup,
    TypeExtraField,
    IssueTypeCategory, User, Workspace
)
from plane.db.seed_data.issue_scheme import BUG, EPIC, FEATURE, STORY, TASK
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
            "display": "缺陷(软件)",
            "category": "缺陷",
            "system_key": BUG,
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
            "system_key": TASK,
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
            "system_key": EPIC,
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
            "system_key": FEATURE,
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
            "system_key": STORY,
        }
    )

    return [bug, task, epic, feature, story]


def temporary_create_issue_type(project: Project = None, project_id: str = None):
    """在项目所用的方案里建种子类型；方案里已有类型就跳过。"""
    if project_id:
        project = Project.objects.get(id=project_id)
    return create_scheme_issue_types(project.issue_scheme)


def create_scheme_issue_types(scheme):
    """给一个工作项方案建五个种子类型（项目方案与批次 4 的模式方案共用）；方案里已有类型就跳过。"""
    if IssueType.objects.filter(scheme=scheme).exists():
        return

    # 获取工作项类型类别
    category_map = dict()
    for obj in IssueTypeCategory.objects.filter(workspace_id=scheme.workspace_id):
        category_map[obj.name] = obj

    types = init_issue_type()
    issue_types = list()
    for issue_type in types:
        obj = IssueType.objects.create(
            name=issue_type.display,
            scheme=scheme,
            description=issue_type.display,
            is_default=issue_type.is_default,
            logo_props=issue_type.icon,
            category=category_map[issue_type.category],
            system_key=issue_type.system_key,
        )
        issue_types.append(obj)
    return issue_types


def bulk_create_issue_state(issue_types: list[IssueType], **kwargs):
    """给每个类型建默认状态，再给它们所在的方案补一条 triage。kwargs 只用 created_by。"""
    if not issue_types:
        return
    create_list = list()
    for issue_type in issue_types:
        default_states = (
            DEFAULT_BUG_STATES
            if getattr(issue_type.category, "name", None) == "缺陷"
            else DEFAULT_STATES
        )
        for state in default_states:
            # Triage 不绑 issue_type，统一在函数末尾按方案维度幂等创建一条。
            if state["group"] == StateGroup.TRIAGE.value:
                continue
            create_list.append(
                State(
                    name=state["name"],
                    color=state["color"],
                    # bulk_create 绕过 save()，方案与工作区显式给：状态归所属类型的方案
                    scheme_id=issue_type.scheme_id,
                    sequence=state["sequence"],
                    workspace_id=issue_type.workspace_id,
                    group=state["group"],
                    default=state.get("default", False),
                    created_by=kwargs.get("created_by"),
                    issue_type_id=issue_type.id,
                )
            )

    State.objects.bulk_create(create_list)

    scheme_id = issue_types[0].scheme_id
    if not State.triage_objects.filter(scheme_id=scheme_id).exists():
        State.objects.create(
            name="Triage",
            color="#4E5355",
            scheme_id=scheme_id,
            sequence=65000,
            group=StateGroup.TRIAGE.value,
            default=False,
            created_by=kwargs.get("created_by"),
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
    # 字段的方案由 TypeExtraField.save() 从类型带出
    # 软件版本
    TypeExtraField.objects.create(
        issue_type=defect_issue_type, name="软件版本", is_required=True
    )

    # 功能模块
    function_module = {
        "choices": [
            "计量",
            "显示",
            "时钟",
            "费率",
            "升级",
            "结算",
            "需量",
            "负荷曲线",
            "负荷控制",
            "电网质量",
            "预付费",
            "PUSH",
            "状态字",
            "DLMS协议栈",
            "报警窃电",
            "P1",
            "事件记录",
            "安全",
            "P2P",
            "红外",
            "RS485/232",
            "电池管理",
            "功耗",
            "阀控",
            "NFC",
            "MBUS",
            "Lorawan",
            "PLC",
            "RF",
            "蓝牙",
            "CIU",
            "默认值",
            "接口类",
            "其它",
        ],
        "selection_mode": "single",
    }
    TypeExtraField.objects.create(
        issue_type=defect_issue_type,
        name="功能模块",
        is_required=True,
        options=function_module,
        field_type="select",
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
        name="缺陷原因",
        options=bug_cause,
        field_type="select",
    )

    # 修复版本
    TypeExtraField.objects.create(
        issue_type=defect_issue_type, name="修复版本"
    )

    # 技术原因
    TypeExtraField.objects.create(
        issue_type=defect_issue_type,
        name="技术原因",
        options={"text_mode": "paragraph"},
    )

    # 解决方案
    TypeExtraField.objects.create(
        issue_type=defect_issue_type,
        name="解决方案",
        options={"text_mode": "paragraph"},
    )


def setup_new_project(project: Project, creator: User):
    """新建项目后的初始化：创建人 / 负责人加为项目管理员、工作项配置、研发模式阶段。

    创建项目接口与简道云项目同步共用，两边建出来的项目一模一样。project 须已建好 ProjectIdentifier。
    项目权限组不再按模板复制：模板在项目里是引用，绑人时按需生成引用行（utils/permission_groups.py）。
    """
    from plane.utils.issue_scheme import prepare_project_issue_scheme
    from plane.utils.project.member import add_project_admins
    from plane.utils.project_stage import copy_stages_from_dev_mode

    admin_ids = [creator.id]
    if project.project_lead_id is not None and str(project.project_lead_id) != str(creator.id):
        admin_ids.append(project.project_lead_id)
    add_project_admins(project, admin_ids)

    prepare_project_issue_scheme(project, creator=creator)

    # 从所选研发模式拷一份阶段到项目下（PMS-101）。放最后且自己包事务：
    # 上面几步都是裸写，这一步失败不该让已经建成的项目回滚，缺了可以在
    # 阶段页手工新建。
    copy_stages_from_dev_mode(project, actor=creator)
