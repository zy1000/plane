"""Type-owned presentation metadata. Field definitions and values remain independent."""

from copy import deepcopy

from django.core.exceptions import ValidationError


LAYOUT_VERSION = 2
LAYOUT_CONTEXTS = {"create", "edit", "detail"}
LAYOUT_MAX_COLUMNS = 5
LAYOUT_MAX_PAGES = 32
LAYOUT_MAX_GROUPS = 128


def validate_field_layout(layout, fields):
    """Validate references against this type only, including inactive field bindings.

    An empty object opts into the automatic default layout: every field sits directly
    below the description. Groups and pages are both optional — a container (the root
    or a page) lists its ungrouped fields first, then its groups; root content stays
    above the page tabs. Fields missing from a configured layout are appended to the
    root by the client, so a placement for every field is not required here.
    """
    def fail(message):
        raise ValidationError(message)

    def named_node(node, seen, label):
        if not isinstance(node, dict):
            fail(f"{label}格式不正确")
        key, name = node.get("id"), node.get("name")
        if not isinstance(key, str) or not key.strip() or len(key) > 64 or key.startswith("__"):
            fail(f"{label}标识不正确")
        if key in seen:
            fail(f"{label}标识不能重复")
        seen.add(key)
        if not isinstance(name, str) or not name.strip() or len(name) > 100:
            fail(f"{label}名称需为 1 至 100 个字符")

    def placement(entry):
        if not isinstance(entry, dict):
            fail("字段位置格式不正确")
        field_id = entry.get("field_id")
        if not isinstance(field_id, str) or field_id not in field_map:
            fail("布局中的字段不存在或不属于当前工作项类型")
        if field_id in placed:
            fail("同一字段只能放置一次")
        placed.add(field_id)
        width = entry.get("width")
        # 占几列；"full" 独占整行。达到每行字段数的列数由前端按整行处理
        if width != "full" and (type(width) is not int or not 1 <= width < LAYOUT_MAX_COLUMNS):
            fail("字段宽度不正确")
        contexts = entry.get("contexts")
        if (
            not isinstance(contexts, list)
            or not contexts
            or any(not isinstance(item, str) or item not in LAYOUT_CONTEXTS for item in contexts)
            or len(contexts) != len(set(contexts))
        ):
            fail("字段至少需要一个有效的显示场景")
        field = field_map[field_id]
        if field.is_required and field.is_active and not {"create", "edit"}.issubset(contexts):
            fail(f"必填字段「{field.name}」必须在创建和编辑时显示")

    def area(node, label):
        """一块字段网格：每行字段数 + 字段位置。"""
        if type(node.get("columns")) is not int or not 1 <= node["columns"] <= LAYOUT_MAX_COLUMNS:
            fail(f"{label}每行字段数只能为 1 至 {LAYOUT_MAX_COLUMNS}")
        entries = node.get("fields")
        if not isinstance(entries, list):
            fail(f"{label}字段格式不正确")
        for entry in entries:
            placement(entry)

    def container(node, label):
        """根或页面：未分组字段在前，其后是分组。"""
        area(node, label)
        groups = node.get("groups")
        if not isinstance(groups, list) or len(groups) > LAYOUT_MAX_GROUPS:
            fail(f"{label}分组格式不正确")
        for group in groups:
            named_node(group, group_ids, "分组")
            area(group, "分组")
            if any(type(group.get(key)) is not bool for key in ("collapsible", "default_collapsed")):
                fail("分组折叠设置必须是布尔值")
            if not group["collapsible"] and group["default_collapsed"]:
                fail("不允许折叠的分组不能默认收起")

    if not isinstance(layout, dict):
        fail("布局必须是一个对象")
    if not layout:
        return
    if type(layout.get("version")) is not int or layout["version"] != LAYOUT_VERSION:
        fail("不支持的布局版本")
    pages = layout.get("pages")
    if not isinstance(pages, list) or len(pages) > LAYOUT_MAX_PAGES:
        fail(f"页面数量不能超过 {LAYOUT_MAX_PAGES} 个")

    field_map = {str(field.id): field for field in fields}
    page_ids, group_ids, placed = set(), set(), set()
    container(layout, "布局")
    for page in pages:
        named_node(page, page_ids, "页面")
        container(page, "页面")


def remap_field_layout(layout, field_id_map):
    """Scheme copies must reference their copied field bindings, never the source."""
    result = deepcopy(layout or {})

    def remap(node):
        # 旧版（version 1）的根和页面没有 fields，只有分组里才有
        if "fields" in node:
            node["fields"] = [
                {**entry, "field_id": field_id_map[entry["field_id"]]}
                for entry in node["fields"]
                if entry["field_id"] in field_id_map
            ]
        for group in node.get("groups", []):
            remap(group)

    remap(result)
    for page in result.get("pages", []):
        remap(page)
    return result
