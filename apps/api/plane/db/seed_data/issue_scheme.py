"""工作项类型的系统标识（``IssueType.system_key``）。

════════════════════════════════════════════════════════════════════════════════
本模块**不允许出现任何 import**。它被两处共用：

  - 运行时  plane/db/models/issue_type.py、plane/utils/project/defaults.py 等
  - 迁移    plane/db/migrations/0420_issue_type_system_key.py

理由同 ``dev_modes.py``：迁移不能 import 运行时模块，零 import 是两边共用同一份规格的前提。
════════════════════════════════════════════════════════════════════════════════

系统标识是种子里五个类型的固定英文 key，代码按它判断（父子层级、工时归类、缺陷导出、
默认类型、角色模板的类型权限），不再按中文名。名字只用于展示，可以随便改。
用户自建的类型没有系统标识（为空）。

改这份数据的规矩：

1. **key 只增不改。** 已经写进库里的 ``system_key`` 和角色模板的摘要 key 都依赖它。
2. ``LEGACY_NAME_TO_SYSTEM_KEY`` 是「按名字认系统类型」的唯一来源：存量回填（0420）、
   导入时名字对不上的兜底都用它。老名字「缺陷」与新名字「缺陷(软件)」都是 bug。
"""

EPIC = "epic"
FEATURE = "feature"
STORY = "story"
TASK = "task"
BUG = "bug"

#: 全部系统标识
SYSTEM_ISSUE_TYPE_KEYS = (EPIC, FEATURE, STORY, TASK, BUG)

#: 需求类（父子层级里的上三层；工时归「需求」）
REQUIREMENT_KEYS = (EPIC, FEATURE, STORY)

#: 种子里的展示名。新建项目 / 模式方案按它取名；角色模板里系统类型的兜底展示名也用它
SYSTEM_ISSUE_TYPE_NAMES = {
    EPIC: "史诗",
    FEATURE: "特性",
    STORY: "用户故事",
    TASK: "任务",
    BUG: "缺陷(软件)",
}

#: 按名字认系统类型（含历史上用过的名字）
LEGACY_NAME_TO_SYSTEM_KEY = {
    "史诗": EPIC,
    "特性": FEATURE,
    "用户故事": STORY,
    "任务": TASK,
    "缺陷": BUG,
    "缺陷(软件)": BUG,
}

#: 角色模板里系统类型的摘要原文前缀。自建类型按名字做摘要，加前缀免得自建类型恰好叫 bug 时撞上
TEMPLATE_IDENTITY_PREFIX = "system_key:"
