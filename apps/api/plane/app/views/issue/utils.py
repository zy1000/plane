from plane.db.models import Issue
from plane.db.seed_data.issue_scheme import (
    BUG,
    EPIC,
    FEATURE,
    LEGACY_NAME_TO_SYSTEM_KEY,
    STORY,
    TASK,
)


def _is_defect_type(issue_type) -> bool:
    """缺陷按工作区级分类判断（硬件缺陷等自建类型也算），不按系统标识。"""
    return bool(getattr(issue_type, "category", None)) and issue_type.category.name == "缺陷"


def is_allowed_to_add_child(parent_issue: Issue, sub_issue: Issue):
    """判断在给定父事项下是否允许添加该子事项类型。

    Args:
        parent_issue (Issue): 父事项实例，依据其类型的 `system_key` 进行校验。
        sub_issue (Issue): 子事项实例，依据其类型的 `system_key` 进行校验。

    Returns:
        bool: 若符合类型层级规则则返回 True，否则返回 False。

    规则（按系统标识，改名不影响）：
    - 父为“史诗”时，仅允许子为“特性”。
    - 父为“特性”时，仅允许子为“用户故事”。
    - 父为“用户故事”时，子不可为“史诗”或“特性”。
    - 其他父类型默认允许。
    """
    p = parent_issue.type.system_key
    c = sub_issue.type.system_key
    if p == EPIC:
        return c == FEATURE
    if p == FEATURE:
        return c == STORY
    if p == STORY:
        return c not in {EPIC, FEATURE}
    return True


def is_allowed_to_add_parent(parent_issue: Issue, sub_issue: Issue | str):
    """判断给定事项是否允许添加该父事项类型。

    Args:
        parent_issue (Issue): 拟添加的父事项实例，依据其类型的 `system_key` 进行校验。
        sub_issue (Issue | str): 当前事项实例；也可以直接传类型名，按种子名字认系统标识。

    Returns:
        bool: 若符合类型层级规则则返回 True，否则返回 False。

    规则（按系统标识，改名不影响）：
    - 子为“史诗”时，不允许添加父级。
    - 子为“用户故事”时，父必须为“特性”。
    - 子为“特性”时，父必须为“史诗”。
    - 子为“任务”时，父必须为“用户故事”或“任务”。
    - 子为缺陷（按分类）时，父必须为“任务”“用户故事”或缺陷。
    - 其他子类型不允许添加父级。
    """
    p = parent_issue.type.system_key
    if isinstance(sub_issue, Issue):
        c = sub_issue.type.system_key
        sub_is_defect = _is_defect_type(sub_issue.type) or c == BUG
    else:
        c = LEGACY_NAME_TO_SYSTEM_KEY.get(sub_issue)
        sub_is_defect = c == BUG or "缺陷" in (sub_issue or "")
    if c == EPIC:
        return False
    if c == STORY:
        return p == FEATURE
    if c == FEATURE:
        return p == EPIC
    if c == TASK:
        return p in {STORY, TASK}
    if sub_is_defect:
        return p in {TASK, STORY} or _is_defect_type(parent_issue.type)
    return False
