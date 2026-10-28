"""研发模式视图：挂在研发模式上的页内视图（IssueView.dev_mode，project 为空）。

跟随同一模式的项目都指向工作区的类型库，类型、状态 id 都一样，所以视图条件原样共用；迭代、模块、发布、标签是各项目
自己的数据，带这些条件的视图不能存到研发模式。

富筛选的存法：单条件 ``{"<字段>__<操作符>": "id1,id2"}``，多条件 ``{"and": [单条件, ...]}``。
"""

from django.db.models import Min

from plane.db.models import IssueScheme, IssueView, Project, ProjectMember, ProjectUserProperty
from plane.utils.issue_filters import issue_filters

#: 项目自己的数据，id 只在本项目有效
PROJECT_LOCAL_FILTER_FIELDS = {
    "cycle_id": "迭代",
    "module_id": "模块",
    "release_id": "发布",
    "label_id": "标签",
}

_GROUP_KEYS = ("and", "or")


def _field_of(key):
    return key.rsplit("__", 1)[0] if "__" in key else key


def _iter_conditions(expression):
    """逐条给出 (键, 值)，组合条件递归展开。"""
    if not isinstance(expression, dict):
        return
    for key, value in expression.items():
        if key in _GROUP_KEYS and isinstance(value, list):
            for child in value:
                yield from _iter_conditions(child)
        elif key == "not" and isinstance(value, dict):
            yield from _iter_conditions(value)
        else:
            yield key, value


def _split_values(value):
    if isinstance(value, list):
        return [str(item) for item in value]
    if value is None:
        return []
    return [item for item in str(value).split(",") if item]


def project_local_filter_labels(rich_filters):
    """条件里用到的项目自有属性，按出现顺序去重，给出界面上的名字（迭代 / 模块 / 发布 / 标签）。"""
    labels = []
    for key, _ in _iter_conditions(rich_filters):
        label = PROJECT_LOCAL_FILTER_FIELDS.get(_field_of(key))
        if label and label not in labels:
            labels.append(label)
    return labels


def references_any(rich_filters, ids):
    """条件值里有没有出现这些 id（类型、状态等）。"""
    targets = {str(item) for item in ids}
    return any(targets & set(_split_values(value)) for _, value in _iter_conditions(rich_filters))


def _strip(expression, targets):
    if not isinstance(expression, dict):
        return expression
    result = {}
    for key, value in expression.items():
        if key in _GROUP_KEYS and isinstance(value, list):
            children = [child for child in (_strip(item, targets) for item in value) if child]
            if children:
                result[key] = children
        elif key == "not" and isinstance(value, dict):
            child = _strip(value, targets)
            if child:
                result[key] = child
        else:
            values = _split_values(value)
            kept = [item for item in values if item not in targets]
            if len(kept) == len(values):
                result[key] = value
            elif kept:
                result[key] = kept if isinstance(value, list) else ",".join(kept)
    # 组里只剩一条时还原成单条件，和前端保存出来的形状一致
    if set(result) == {"and"} and len(result["and"]) == 1:
        return result["and"][0]
    return result


def strip_ids(rich_filters, ids):
    """从条件值里去掉这些 id；某条条件的值去空了就整条去掉。返回 (新条件, 是否有改动)。"""
    if not rich_filters:
        return rich_filters, False
    stripped = _strip(rich_filters, {str(item) for item in ids})
    return stripped, stripped != rich_filters


def following_dev_mode_id(project_id):
    """项目跟随研发模式时返回模式 id，项目自定义（或项目不存在）返回 None。"""
    return (
        Project.objects.filter(pk=project_id, issue_scheme__project__isnull=True)
        .values_list("dev_mode_id", flat=True)
        .first()
    )


def prune_mode_view_references(scheme_id, ids, delete_views=False):
    """类型库删掉类型 / 状态后，处理用到它们的研发模式视图：删掉视图，或者从条件里去掉这些 id。

    项目方案的删除也走同一个接口，但项目视图不在这里处理（只有类型库的类型 / 状态会出现在研发模式视图里）。
    """
    scheme_is_library = IssueScheme.objects.filter(pk=scheme_id, project__isnull=True).exists()
    if not scheme_is_library:
        return
    for view in IssueView.objects.filter(dev_mode__issue_scheme_id=scheme_id, project__isnull=True):
        if not references_any(view.rich_filters, ids):
            continue
        if delete_views:
            view.delete()
            continue
        view.rich_filters, _ = strip_ids(view.rich_filters, ids)
        view.save(update_fields=["rich_filters", "query", "updated_at"])


def copy_mode_views_to_project(dev_mode_id, project_id):
    """项目切换为项目自定义时，把研发模式视图拷成本项目的公共视图，排在项目原有视图前面（页签位置不变）。

    返回 {模式视图 id: 项目视图 id}。须在脱离的事务里、重映射之前调：拷出来的条件还是类型库的 id，
    随后由 remap_project_refs 换成项目方案的。
    """
    project = Project.objects.get(pk=project_id)
    if not dev_mode_id:
        return {}
    mode_views = list(IssueView.objects.filter(dev_mode_id=dev_mode_id, project__isnull=True).order_by("sort_order"))
    if not mode_views:
        return {}
    lowest = IssueView.objects.filter(project_id=project_id).aggregate(lowest=Min("sort_order"))["lowest"]
    start = (lowest if lowest is not None else 65535) - 1000 * (len(mode_views) + 1)
    copies = []
    for index, view in enumerate(mode_views):
        copies.append(
            IssueView(
                workspace_id=project.workspace_id,
                project_id=project_id,
                name=view.name,
                description=view.description,
                filters=view.filters,
                query=issue_filters(view.filters, "POST") if view.filters else {},
                display_filters=view.display_filters,
                display_properties=view.display_properties,
                rich_filters=view.rich_filters,
                access=1,
                scope=view.scope,
                sort_order=start + 1000 * index,
                logo_props=view.logo_props,
                owned_by_id=view.owned_by_id,
                created_by_id=view.created_by_id,
                updated_by_id=view.updated_by_id,
            )
        )
    IssueView.objects.bulk_create(copies)
    view_map = {str(old.id): str(new.id) for old, new in zip(mode_views, copies)}
    _carry_tab_preferences(project, list(zip(mode_views, copies)), view_map)
    return view_map


def _carry_tab_preferences(project, pairs, view_map):
    """拷贝后每个成员的页签照旧：默认页签、顺序换成新 id；在不在页签栏按新身份重记。

    研发模式视图对所有人默认在栏里（收起才记 hidden）；拷出来后是发布人的公共视图——对发布人仍默认在栏里，
    对其他人默认收在「更多」（要记 pinned 才在栏里）。所以非发布人没收起过的都补进 pinned，收起过的不再记；
    还没有偏好记录的成员也要补，否则他们的这些页签会掉进「更多」。
    """
    member_ids = ProjectMember.objects.filter(project_id=project.id, is_active=True).values_list("member_id", flat=True)
    existing = {row.user_id: row for row in ProjectUserProperty.objects.filter(project_id=project.id)}
    for user_id in member_ids:
        if user_id not in existing:
            existing[user_id] = ProjectUserProperty.objects.create(
                project_id=project.id, workspace_id=project.workspace_id, user_id=user_id
            )

    for user_id, row in existing.items():
        preferences = row.preferences if isinstance(row.preferences, dict) else {}
        views_pref = preferences.get("views") if isinstance(preferences.get("views"), dict) else {}
        for old, new in pairs:
            old_id, new_id = str(old.id), str(new.id)
            scope_pref = views_pref.get(new.scope) if isinstance(views_pref.get(new.scope), dict) else {}
            hidden = [item for item in scope_pref.get("hidden_view_ids") or [] if item != old_id]
            pinned = [item for item in scope_pref.get("pinned_view_ids") or [] if item != old_id]
            was_hidden = old_id in (scope_pref.get("hidden_view_ids") or [])
            if new.owned_by_id == user_id:
                if was_hidden:
                    hidden.append(new_id)
            elif not was_hidden:
                pinned.append(new_id)
            scope_pref["hidden_view_ids"] = hidden
            scope_pref["pinned_view_ids"] = pinned
            views_pref[new.scope] = scope_pref
        # 默认页签、顺序里的旧 id 换成新的
        for scope_pref in views_pref.values():
            if not isinstance(scope_pref, dict):
                continue
            if scope_pref.get("default_view_id") in view_map:
                scope_pref["default_view_id"] = view_map[scope_pref["default_view_id"]]
            if isinstance(scope_pref.get("order"), list):
                scope_pref["order"] = [view_map.get(item, item) for item in scope_pref["order"]]
        preferences["views"] = views_pref
        ProjectUserProperty.objects.filter(pk=row.pk).update(preferences=preferences)
