"""阶段评审的预置规格：product_stage 词表 + 模板树（10 阶段 / 7 评审 / 59 活动）。

════════════════════════════════════════════════════════════════════════════════
本模块**不允许出现任何 import**（含 typing / enum）。它被两处共用：

  - 运行时  plane/utils/stage_review_template.py::ensure_stage_review_templates
  - 迁移    plane/db/migrations/0362_seed_stage_review_templates.py

迁移不能 import 运行时代码（plane/utils/data_dictionary.py 那类模块在 module level
就 import 了模型），零 import 是两边共用同一份的前提。

这是对仓库既有约定的**有意偏离**：0346 / 0348 / 0355 / 0358 都在迁移里复制了一份
规格，那是因为对应的运行时模块 import 了模型、迁移期 apps 未 ready。本模块没有这个
限制，而 66 行 × 7 字段抄两遍必然漂移，漂移的表现是「新装环境和老环境的标准流程不
一样」，极难发现。
════════════════════════════════════════════════════════════════════════════════

改这份数据的规矩：

1. **只增不改。** 运行时与迁移的幂等锚点都是「该工作区已有任意模板行就整体跳过」，
   所以往这里追加新行**不会**自动补给老工作区 —— 要补就另写一个 ensure 式的
   delta 迁移。
2. **改名 / 删行必须在同一个 commit 里配一个 RunPython 处理存量**，光改常量会让老库
   和新库分叉。
3. ``kind`` 用裸字符串（不 import StageReviewKind），取值只能是
   review / activity / o_stage_review / o_stage_activity。
"""

SORT_ORDER_STEP = 10000

# ---- 阶段词表：复用产品阶段字典（product_stage），不新建 review_stage ----
# 与 plane/utils/data_dictionary.py::SYSTEM_DICTIONARIES 的第 0 项是同一本字典，
# 那边的 items 直接引用下面这个元组（改这里两边同时生效）。
PRODUCT_STAGE_DICTIONARY_KEY = "product_stage"
PRODUCT_STAGE_DICTIONARY_NAME = "产品阶段"
# SYSTEM_DICTIONARIES 里的下标，决定字典头的 sort_order = (INDEX + 1) * SORT_ORDER_STEP
PRODUCT_STAGE_DICTIONARY_INDEX = 0

PRODUCT_STAGE_LABELS = (
    "I阶段",
    "D阶段",
    "O-F1",
    "O-F2",
    "O-SV1",
    "O-C",
    "O-T1",
    "O-F3",
    "O阶段",
    "V阶段（包含NPI）",
)

# 根类型 → 它下面活动的类型。没有根评审的阶段，活动固定用 "activity"。
_ACTIVITY_KIND_BY_ROOT_KIND = {
    "review": "activity",
    "o_stage_review": "o_stage_activity",
}
_DEFAULT_ACTIVITY_KIND = "activity"

# ---- 模板树 ----
# 每个阶段一项：
#   "root"       —— (kind, 标题, 发起者, 主导者, 审核者)，None 表示该阶段没有汇总评审，
#                   活动直接挂在阶段下。
#   "activities" —— (标题, 发起者, 主导者, 审核者)，kind 由 root 推导。
# 元组顺序即展示顺序。原表里根评审写在该阶段最后一行，这里提到 "root" 上，建树时先建父。
#
# 数据取自研发流程标准表，两处照抄不改：「FI评审-认证详细方案和计划评审」（F 后是大写 I，
# 疑似笔误）、「F1→O评审-…」的箭头。审核者原表写「无」的落成空串；原表审核者括号里的
# 具体人名按要求一律剥离，只留角色。
STAGE_REVIEW_TEMPLATE_SPECS = (
    {
        "stage": "I阶段",
        "root": ("review", "I阶段评审", "项目负责人", "项目负责人", ""),
        "activities": (
            (
                "I阶段评审-需求评审（软件&整机）",
                "项目负责人",
                "软件研发负责人",
                "软件测试工程师",
            ),
            (
                "I阶段评审-需求评审（结构&整机）",
                "项目负责人",
                "软件研发负责人",
                "结构测试工程师",
            ),
            (
                "I阶段评审-需求评审（硬件&整机）",
                "项目负责人",
                "硬件研发负责人",
                "硬件测试工程师",
            ),
            ("I阶段评审-认证需求评审", "项目负责人", "认证工程师", "认证主管"),
        ),
    },
    {
        "stage": "D阶段",
        "root": ("review", "D阶段评审", "项目负责人", "项目负责人", ""),
        "activities": (
            (
                "D阶段评审-硬件方案设计&关键物料评审",
                "项目负责人",
                "硬件研发负责人",
                "硬件平台部负责人",
            ),
            (
                "D阶段评审-软件方案设计评审",
                "项目负责人",
                "软件研发负责人",
                "软件部负责人",
            ),
            (
                "D阶段评审-需求Review（软件&整机）",
                "项目负责人",
                "软件研发负责人",
                "软件测试工程师",
            ),
            (
                "D阶段评审-需求Review（结构&整机）",
                "项目负责人",
                "结构设计负责人",
                "结构测试工程师",
            ),
            (
                "D阶段评审-需求Review（硬件&整机）",
                "项目负责人",
                "硬件研发负责人",
                "硬件测试工程师",
            ),
        ),
    },
    {
        "stage": "O-F1",
        "root": ("review", "F1评审", "项目负责人", "硬件测试负责人", ""),
        "activities": (
            (
                "F1→O评审-PCB Layout评审",
                "项目负责人",
                "硬件研发负责人",
                "PCB Layout主管",
            ),
            ("FI评审-认证详细方案和计划评审", "项目负责人", "认证工程师", "认证主管"),
            (
                "F1评审-整机结构手板&设计方案评审",
                "项目负责人",
                "结构设计负责人",
                "结构测试工程师",
            ),
            ("F1→O评审-原理图评审", "项目负责人", "硬件研发负责人", "硬件平台部负责人"),
            ("F1评审-BOM评审", "项目负责人", "BOM工程师", "BOM主管"),
            ("F1评审-测试设计评审", "项目负责人", "测试研发", "测试研发主管"),
            (
                "F1评审-硬件测试部测试用例总结",
                "项目负责人",
                "硬件测试负责人",
                "硬件测试主管",
            ),
            ("F1评审-DFM检查总结", "项目负责人", "DFM工程师", "DFM主管"),
            ("F1评审-硬件自测试总结", "项目负责人", "硬件研发负责人", "硬件部负责人"),
        ),
    },
    {
        "stage": "O-F2",
        "root": ("review", "F2评审", "项目负责人", "硬件测试负责人", ""),
        "activities": (
            ("F2评审-硬件测试部总结", "项目负责人", "硬件测试负责人", "硬件测试主管"),
            ("F2评审-BOM评审", "项目负责人", "BOM工程师", "BOM主管"),
            ("F2评审-测试设计评审", "项目负责人", "测试研发", "测试研发主管"),
            ("F2评审-DFM检查总结", "项目负责人", "DFM工程师", "DFM主管"),
            ("F2评审-认证总结", "项目负责人", "认证工程师", "认证主管"),
            (
                "F2评审-整机结构模具评审",
                "项目负责人",
                "结构设计负责人",
                "结构测试工程师",
            ),
        ),
    },
    {
        # 没有汇总评审：4 条活动直接挂在阶段下。它们因此落进
        # srt_unique_stage_title_active（workspace, stage, title），标题必须两两不同。
        "stage": "O-SV1",
        "root": None,
        "activities": (
            (
                "SV1评审-软件测试用例评审",
                "项目负责人",
                "软件测试负责人",
                "软件测试主管",
            ),
            (
                "SV1评审-集成测试用例评审（通信）",
                "项目负责人",
                "软件测试负责人",
                "软件测试主管",
            ),
            ("SV1阶段-版本发布评审", "项目负责人", "软件研发负责人", "软件部负责人"),
            (
                "SV1评审-挂表测试用例评审（通信）",
                "项目负责人",
                "软件测试负责人",
                "软件测试主管",
            ),
        ),
    },
    {
        "stage": "O-C",
        "root": None,
        "activities": (("认证前Review", "项目负责人", "DQA", "项目负责人"),),
    },
    {
        "stage": "O-T1",
        "root": None,
        "activities": (("客户验收送样前Review", "项目负责人", "DQA", "项目负责人"),),
    },
    {
        "stage": "O-F3",
        "root": ("review", "F3评审", "项目负责人", "硬件测试负责人", ""),
        "activities": (
            ("F3评审-硬件测试部总结", "项目负责人", "硬件测试负责人", "硬件测试主管"),
            ("F3评审-BOM评审", "项目负责人", "BOM工程师", "BOM主管"),
            ("F3评审-DFM检查总结", "项目负责人", "DFM工程师", "DFM主管"),
            ("F3评审-认证总结", "项目负责人", "认证工程师", "认证主管"),
        ),
    },
    {
        # 唯一走 O 阶段类型的阶段：根是 o_stage_review、活动是 o_stage_activity。
        # 成品 / 组件版本 / 生产方式 / 出货评估那几组字段只在这一支上有值。
        "stage": "O阶段",
        "root": ("o_stage_review", "O阶段评审", "项目负责人", "DQA", ""),
        "activities": (
            ("O阶段评审-结构研发总结", "项目负责人", "结构设计负责人", "结构研发主管"),
            (
                "O阶段评审-需求review（硬件研发&整机）",
                "项目负责人",
                "硬件研发负责人",
                "硬件测试工程师",
            ),
            (
                "O阶段评审-需求review（软件研发&整机）",
                "项目负责人",
                "软件研发负责人",
                "软件测试工程师",
            ),
            (
                "O阶段评审-需求review（软件测试&整机）",
                "项目负责人",
                "软件测试负责人",
                "软件测试主管",
            ),
            (
                "O阶段评审-需求review（结构研发&整机）",
                "项目负责人",
                "结构设计负责人",
                "结构测试工程师",
            ),
            ("O阶段评审-认证总结", "项目负责人", "认证工程师", "认证主管"),
            ("O阶段评审-DFM总结", "项目负责人", "DFM工程师", "DFM主管"),
            ("O阶段评审-测试设计评审", "项目负责人", "测试研发", "测试研发主管"),
            ("O阶段评审-BOM评审", "项目负责人", "BOM工程师", "BOM主管"),
            (
                "O阶段评审-硬件测试部总结",
                "项目负责人",
                "硬件测试负责人",
                "硬件测试主管",
            ),
            (
                "O阶段评审-软件挂表测试总结",
                "项目负责人",
                "软件测试负责人",
                "软件测试主管",
            ),
            (
                "O阶段评审-软件功能测试总结",
                "项目负责人",
                "软件测试负责人",
                "软件测试主管",
            ),
            (
                "O阶段-软件研发总结（模块）",
                "项目负责人",
                "软件研发负责人",
                "软件部负责人",
            ),
            (
                "O阶段-软件研发总结（基表）",
                "项目负责人",
                "软件研发负责人",
                "软件部负责人",
            ),
            ("O阶段评审-集成测试总结", "项目负责人", "软件测试负责人", "软件测试主管"),
            ("O阶段评审-项目自评总结", "项目负责人", "项目负责人", "项目负责人"),
        ),
    },
    {
        # 这个阶段的发起者是 NPI主管，不是项目负责人
        "stage": "V阶段（包含NPI）",
        "root": ("review", "V阶段评审", "NPI主管", "NPI主管", ""),
        "activities": (
            ("V阶段评审-结构例行测试", "NPI主管", "物料工程师", "硬件测试主管"),
            ("V阶段评审-软件例行测试", "NPI主管", "软件测试负责人", "软件测试小组长"),
            ("V阶段评审-硬件例行测试", "NPI主管", "硬件测试负责人", "硬件测试主管"),
            ("V阶段评审-生产工艺PCBA", "NPI主管", "NPI工程师", "NPI主管"),
            ("V阶段评审-生产测试PCBA", "NPI主管", "生产测试负责人", "生产测试主管"),
            ("V阶段评审-生产工艺BA", "NPI主管", "NPI工程师", "NPI主管"),
            ("V阶段评审-生产测试BA", "NPI主管", "生产测试负责人", "生产测试主管"),
            ("V阶段评审-制造品质", "NPI主管", "QA", "QA经理"),
            ("V阶段评审-生产", "NPI主管", "生产", "生产主管"),
        ),
    },
)


def _check_specs():
    """import 期自检：spec 里引用的阶段必须都在词表里，且词表没有多余项。

    这两处一旦漂开（比如某个 label 被改短一个字），受影响的整个阶段会在预置时被静默
    跳过 —— 只有人工数行数才看得出来。宁可在 import 期直接炸。
    """
    spec_stages = [spec["stage"] for spec in STAGE_REVIEW_TEMPLATE_SPECS]
    unknown = [label for label in spec_stages if label not in PRODUCT_STAGE_LABELS]
    if unknown:
        raise AssertionError(f"阶段评审规格引用了词表里没有的阶段: {unknown}")
    unused = [label for label in PRODUCT_STAGE_LABELS if label not in spec_stages]
    if unused:
        raise AssertionError(f"词表里有阶段没被任何模板引用: {unused}")


_check_specs()


def iter_template_rows():
    """把规格摊平成 dict 行，**先吐所有根评审、再吐所有活动**，调用方顺序建库即可先父后子。

    每行：stage_label / kind / title / parent_title / initiator_role / leader_role /
    auditor_role / sort_order。``parent_title`` 为 None 表示直接挂在阶段下。

    sort_order 在 (阶段, 父) 分组内按出现次序编号 —— bulk_create 绕过
    StageReviewTemplate.save()，那里的「追加到末尾」逻辑不会跑，必须显式给。
    根评审排在本阶段第一位。
    """
    roots = []
    children = []
    for spec in STAGE_REVIEW_TEMPLATE_SPECS:
        stage_label = spec["stage"]
        root = spec["root"]
        parent_title = None
        activity_kind = _DEFAULT_ACTIVITY_KIND
        if root is not None:
            root_kind, root_title, initiator, leader, auditor = root
            parent_title = root_title
            activity_kind = _ACTIVITY_KIND_BY_ROOT_KIND[root_kind]
            roots.append(
                {
                    "stage_label": stage_label,
                    "kind": root_kind,
                    "title": root_title,
                    "parent_title": None,
                    "initiator_role": initiator,
                    "leader_role": leader,
                    "auditor_role": auditor,
                    "sort_order": SORT_ORDER_STEP,
                }
            )
        for index, (title, initiator, leader, auditor) in enumerate(spec["activities"]):
            row = {
                "stage_label": stage_label,
                "kind": activity_kind,
                "title": title,
                "parent_title": parent_title,
                "initiator_role": initiator,
                "leader_role": leader,
                "auditor_role": auditor,
                # 组内序号：有根的阶段活动自成一组（parent=根），无根的阶段活动就是顶层组
                "sort_order": (index + 1) * SORT_ORDER_STEP,
            }
            (children if parent_title is not None else roots).append(row)
    for row in roots:
        yield row
    for row in children:
        yield row
