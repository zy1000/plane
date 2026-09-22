"""研发模式的预置规格：IDOV / Scrum / 混合模式三个模式的名称、图标与组件开关。

════════════════════════════════════════════════════════════════════════════════
本模块**不允许出现任何 import**（含 typing / enum）。它被两处共用：

  - 运行时  plane/utils/dev_mode.py::ensure_dev_modes
  - 迁移    plane/db/migrations/0386_seed_dev_modes.py

理由同 ``stage_review_templates.py``：迁移不能 import 运行时模块（那边 module level
就 import 了模型），零 import 是两边共用同一份规格的前提。
════════════════════════════════════════════════════════════════════════════════

改这份数据的规矩与 ``stage_review_templates.py`` 一致：幂等锚点是「该工作区已有任意
DevMode 行即整体跳过」，往这里追加新模式**不会**自动补给老工作区，要补就另写 delta 迁移。
"""

SORT_ORDER_STEP = 10000

# ---- 组件开关 ----------------------------------------------------------------
# 九个布尔 key，存在 DevMode.features 这个 JSONField 里。前八个对应 Project 上已有或
# 将有的功能位，第九个（review_view）是本期新增的「评审」组件。
#
# 注意 ``intake_view``：Project 上这一位的字段名其实是 ``inbox_view``（历史遗留，
# 前端功能页的 key 叫 intake、属性叫 inbox_view）。模式这边统一用业务名 intake_view，
# 批次 3 接项目时做一次映射，不把历史拼写扩散到新表里。
#
# ``release_view`` 与 ``review_view`` 在 Project 上还不存在，批次 3 补。
FEATURE_KEYS = (
    "cycle_view",
    "module_view",
    "release_view",
    "issue_views_view",
    "page_view",
    "intake_view",
    "is_time_tracking_enabled",
    "is_issue_type_enabled",
    "review_view",
)

#: 九项全开。下面三个预置模式都从它出发，各自关掉自己不要的那些。
ALL_FEATURES_ON = {key: True for key in FEATURE_KEYS}


def _features(**overrides):
    """全开的基础上覆盖几项。零 import 模块里唯一允许的一点点逻辑。"""
    features = dict(ALL_FEATURES_ON)
    features.update(overrides)
    return features


# ---- 预置模式 ----------------------------------------------------------------
# ``icon_props`` 与 IssueType / RequirementType 的 ``logo_props`` 同形状
# （{"in_use": "icon", "icon": {"name", "color", "background_color"}}），
# 前端的图标选择器与渲染器两边共用。name 取 lucide 图标名。
#
# ``seed_all_stages``：True 表示「遍历该工作区全部阶段类型各建一个阶段（名称取类型名），
# 并把该类型下全部活跃模板节点勾上」。Scrum 不走阶段评审，所以是 False。
DEV_MODE_SPECS = (
    {
        "name": "IDOV",
        "description": "硬件整机研发的标准阶段门流程，I / D / O / V 逐阶段评审。",
        "icon_props": {
            "in_use": "icon",
            "icon": {
                "name": "Route",
                "color": "#1E6F8E",
                "background_color": "#E3F1F7",
            },
        },
        # 硬件研发按阶段门推进，不跑迭代
        "features": _features(cycle_view=False),
        "seed_all_stages": True,
    },
    {
        "name": "Scrum",
        "description": "软件迭代交付，按迭代推进，不走阶段评审。",
        "icon_props": {
            "in_use": "icon",
            "icon": {
                "name": "Repeat",
                "color": "#7A4E10",
                "background_color": "#FBEEDB",
            },
        },
        # 关掉评审组件，因此也不预置任何阶段
        "features": _features(review_view=False),
        "seed_all_stages": False,
    },
    {
        "name": "混合模式",
        "description": "阶段评审与迭代并行，全部组件开放。存量项目默认使用此模式。",
        "icon_props": {
            "in_use": "icon",
            "icon": {
                "name": "Blend",
                "color": "#4F3F9E",
                "background_color": "#EDE9FB",
            },
        },
        # 现状的等价物：九项全开、阶段与评审节点全量
        "features": dict(ALL_FEATURES_ON),
        "seed_all_stages": True,
    },
)

#: 批次 3 把存量项目回填到这个模式，名字写死在这里供迁移引用。
DEFAULT_DEV_MODE_NAME = "混合模式"


def normalize_features(value):
    """把任意输入收敛成九个布尔 key 的完整字典。

    缺的 key 补 True（上限语义：没说关就是开），多余的 key 丢掉，值一律转 bool。
    serializer 与种子都走这里，保证库里每一行的 features 形状一致。
    """
    source = value if isinstance(value, dict) else {}
    return {key: bool(source.get(key, True)) for key in FEATURE_KEYS}
