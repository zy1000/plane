# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""权限 key 的唯一来源（docs/permission-refactor/permission-keys.md）。

语法固定三段 ``{scope}.{module}.{action}``，scope 只有 workspace / project 两个值，
产品没有自己的 key：产品内容按关联项目的项目权限判（见 permissions/base.py）。

这张表同时决定：
- ``PermissionKey`` 枚举（keys.py 断言两边一致）
- ``permissions`` 表的行（db/permission_bootstrap.py 按它播种）
- 前端常量与权限组编辑器的分组 / 行 / 动作文案（``export_permission_keys`` 命令导出）

改这里之后跑 ``python manage.py export_permission_keys`` 重新生成前端文件。
"""

from dataclasses import dataclass

#: 动作的默认文案与排序。权限组编辑器每行按这个顺序列出该模块自己有的动作，
#: 「按动作勾选」下拉也按这个顺序。新增动作加在这里，不用改编辑器。
ACTION_ORDER = (
    ("view", "查看"),
    ("create", "新建"),
    ("edit", "编辑"),
    ("delete", "删除"),
    ("archive", "归档"),
    ("submit", "提交"),
    ("review", "评审"),
    ("approve", "审批"),
    ("execute", "执行"),
    ("import", "导入"),
    ("export", "导出"),
    ("manage", "管理"),
    ("view_all", "查看全员"),
)
ACTION_LABELS = dict(ACTION_ORDER)
ACTION_RANK = {action: index for index, (action, _) in enumerate(ACTION_ORDER)}

#: 可以按工作项类型限定的动作（权限组里「排除哪些类型」），只对工作项 / 缺陷两行生效
TYPE_LIMITABLE_ACTIONS = ("create", "edit", "delete")
TYPE_LIMITABLE_MODULES = ("project.issue", "project.defect")


@dataclass(frozen=True)
class PermissionDef:
    key: str
    scope: str
    group: str
    module: str
    module_label: str
    action: str
    action_label: str
    sort_order: int

    @property
    def name(self) -> str:
        """「编辑缺陷」这种全称，搜索与列表里用。"""
        return f"{self.action_label}{self.module_label}"

    @property
    def type_limitable(self) -> bool:
        return self.module in TYPE_LIMITABLE_MODULES and self.action in TYPE_LIMITABLE_ACTIONS


def _actions(*items):
    """``"edit"`` 用默认文案，``("submit", "提交评审")`` 覆盖文案。"""
    result = []
    for item in items:
        if isinstance(item, tuple):
            result.append(item)
        else:
            result.append((item, ACTION_LABELS[item]))
    return result


# (分组, [(模块, 模块文案, 动作…)])，顺序就是编辑器里的顺序
_WORKSPACE = [
    (
        "管理",
        [
            ("workspace.settings", "工作区", _actions("edit")),
            ("workspace.member", "成员", _actions("view", "manage")),
            ("workspace.department", "部门", _actions("manage")),
            ("workspace.team", "团队", _actions("manage")),
            ("workspace.permission_group", "权限组", _actions("view", "manage")),
        ],
    ),
    (
        "项目与产品",
        [
            ("workspace.project", "项目", _actions("create")),
            ("workspace.product", "产品", _actions("view", "create", "edit", "delete")),
        ],
    ),
    (
        "模板",
        [
            ("workspace.requirement_library", "需求标准库", _actions("view", "manage")),
            ("workspace.case_template", "用例模板库", _actions("view", "manage")),
            ("workspace.review_template", "评审模板", _actions("view", "manage")),
            ("workspace.dev_mode", "研发模式", _actions("view", "manage")),
            ("workspace.issue_scheme", "工作项方案", _actions("view", "manage")),
        ],
    ),
    (
        "配置",
        [
            ("workspace.data_dictionary", "数据字典", _actions("manage")),
            ("workspace.stage_type", "阶段类型", _actions("manage")),
            ("workspace.requirement_type", "需求类型", _actions("manage")),
        ],
    ),
    (
        "数据",
        [
            ("workspace.timesheet", "工时", _actions(("view_all", "查看全员工时"), "manage")),
            ("workspace.analytics", "分析", _actions("view")),
            ("workspace.export", "导出", _actions("manage")),
            ("workspace.view", "工作区视图", _actions(("manage", "管理公共视图"))),
        ],
    ),
    (
        "开发者",
        [
            ("workspace.webhook", "Webhooks", _actions("manage")),
            ("workspace.integration", "集成", _actions("manage")),
        ],
    ),
]

_PROJECT = [
    (
        "项目管理",
        [
            ("project.settings", "项目设置", _actions("edit", "archive", "delete")),
            ("project.member", "项目成员", _actions("manage")),
            ("project.permission_group", "项目权限组", _actions("manage")),
            ("project.product", "研发产品", _actions("manage")),
            ("project.announcement", "公告", _actions("manage")),
        ],
    ),
    (
        "工作项",
        [
            (
                "project.issue",
                "工作项",
                _actions("view", "create", "edit", "delete", "archive", "import", "export"),
            ),
            ("project.defect", "缺陷", _actions("view", "create", "edit", "delete")),
            ("project.intake", "收件箱", _actions("view", "manage")),
        ],
    ),
    (
        "需求",
        [
            (
                "project.requirement",
                "需求",
                _actions(
                    "view",
                    "create",
                    "edit",
                    "delete",
                    ("submit", "提交评审"),
                    "review",
                    "import",
                    "export",
                ),
            ),
            ("project.requirement_module", "需求模块", _actions("manage")),
            ("project.requirement_baseline", "基线", _actions("manage")),
            ("project.change_request", "变更单", _actions(("create", "发起"), "approve")),
        ],
    ),
    (
        "计划",
        [
            ("project.cycle", "迭代", _actions("view", "create", "edit", "delete", "archive")),
            ("project.module", "模块", _actions("view", "create", "edit", "delete", "archive")),
            ("project.release", "发布", _actions("view", "create", "edit", "delete", "archive")),
            ("project.stage", "阶段", _actions("view", "manage")),
        ],
    ),
    (
        "评审",
        [
            (
                "project.review_tailoring",
                "裁剪表",
                _actions("view", "create", "edit", "delete", ("submit", "提交签批")),
            ),
            ("project.stage_review", "阶段评审", _actions("view", "edit", "export")),
        ],
    ),
    (
        "风险",
        [
            ("project.risk", "风险", _actions("view", "create", "edit", "delete")),
        ],
    ),
    (
        "测试",
        [
            ("project.test_plan", "测试计划", _actions("view", "create", "edit", "delete", "execute")),
            ("project.test_report", "测试报告", _actions("view", "create", "edit", "delete")),
            (
                "project.test_case",
                "用例",
                _actions("view", "create", "edit", "delete", "import", "export"),
            ),
            ("project.case_review", "用例评审", _actions("view", "create", "edit", "delete")),
        ],
    ),
    (
        "协作",
        [
            ("project.page", "页面", _actions("view", "create", "edit", "delete")),
            ("project.view", "视图", _actions(("manage", "管理公共视图"))),
            ("project.filestore", "文件库", _actions("view", "edit", "delete")),
        ],
    ),
    (
        "配置",
        [
            ("project.state", "状态", _actions("manage")),
            ("project.label", "标签", _actions("manage")),
            ("project.issue_type", "工作项类型", _actions("manage")),
            ("project.estimate", "估算", _actions("manage")),
            ("project.workflow", "工作流", _actions("manage")),
        ],
    ),
]


def _build(scope: str, groups) -> list:
    defs = []
    order = 0
    for group, modules in groups:
        for module, module_label, actions in modules:
            for action, action_label in actions:
                order += 1
                defs.append(
                    PermissionDef(
                        key=f"{module}.{action}",
                        scope=scope,
                        group=group,
                        module=module,
                        module_label=module_label,
                        action=action,
                        action_label=action_label,
                        sort_order=order,
                    )
                )
    return defs


PERMISSION_DEFS: tuple = tuple(_build("workspace", _WORKSPACE) + _build("project", _PROJECT))
PERMISSION_DEFS_BY_KEY: dict = {d.key: d for d in PERMISSION_DEFS}

WORKSPACE_KEYS: frozenset = frozenset(d.key for d in PERMISSION_DEFS if d.scope == "workspace")
PROJECT_KEYS: frozenset = frozenset(d.key for d in PERMISSION_DEFS if d.scope == "project")
#: 项目里所有「查看」类 key
PROJECT_VIEW_KEYS: frozenset = frozenset(
    d.key for d in PERMISSION_DEFS if d.scope == "project" and d.action == "view"
)
TYPE_LIMITABLE_KEYS: frozenset = frozenset(d.key for d in PERMISSION_DEFS if d.type_limitable)


def scope_of(key: str):
    definition = PERMISSION_DEFS_BY_KEY.get(key)
    return definition.scope if definition else None


def export_payload() -> dict:
    """``export_permission_keys`` 命令与权限字典接口共用的结构。"""
    groups = []
    for scope, spec in (("workspace", _WORKSPACE), ("project", _PROJECT)):
        for group, modules in spec:
            groups.append(
                {
                    "scope": scope,
                    "label": group,
                    "modules": [
                        {
                            "key": module,
                            "label": module_label,
                            "actions": [
                                {
                                    "key": f"{module}.{action}",
                                    "action": action,
                                    "label": action_label,
                                    "type_limitable": PERMISSION_DEFS_BY_KEY[
                                        f"{module}.{action}"
                                    ].type_limitable,
                                }
                                for action, action_label in actions
                            ],
                        }
                        for module, module_label, actions in modules
                    ],
                }
            )
    return {
        "actions": [{"action": action, "label": label} for action, label in ACTION_ORDER],
        "groups": groups,
    }
