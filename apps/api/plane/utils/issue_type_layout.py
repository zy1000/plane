"""Type-owned presentation metadata. Field definitions and values remain independent."""

from copy import deepcopy

from django.core.exceptions import ValidationError


LAYOUT_CONTEXTS = {"create", "edit", "detail"}
LAYOUT_WIDTHS = {"auto", "third", "half", "full"}


def validate_field_layout(layout, fields):
    """Validate references against this type only, including inactive field bindings.

    An empty object opts into the automatic default layout. Once configured, every
    current field must have one placement; newly added fields remain reachable via
    the client's ungrouped fallback until an administrator places them.
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

    if not isinstance(layout, dict):
        fail("布局必须是一个对象")
    if not layout:
        return
    if type(layout.get("version")) is not int or layout["version"] != 1:
        fail("不支持的布局版本")
    if not isinstance(layout.get("mode"), str) or layout["mode"] not in {"sections", "tabs", "sidebar"}:
        fail("不支持的布局模式")
    pages = layout.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 32:
        fail("布局需包含 1 至 32 个业务页面")

    field_map = {str(field.id): field for field in fields}
    page_ids, group_ids, placed = set(), set(), set()
    for page in pages:
        named_node(page, page_ids, "页面")
        groups = page.get("groups")
        if not isinstance(groups, list) or len(groups) > 128:
            fail("页面分组格式不正确")
        for group in groups:
            named_node(group, group_ids, "分组")
            if type(group.get("columns")) is not int or group["columns"] not in (1, 2, 3):
                fail("每组字段列数只能为 1、2 或 3")
            if any(type(group.get(key)) is not bool for key in ("collapsible", "default_collapsed")):
                fail("分组折叠设置必须是布尔值")
            if not group["collapsible"] and group["default_collapsed"]:
                fail("不允许折叠的分组不能默认收起")
            entries = group.get("fields")
            if not isinstance(entries, list):
                fail("分组字段格式不正确")
            for entry in entries:
                if not isinstance(entry, dict):
                    fail("字段位置格式不正确")
                field_id = entry.get("field_id")
                if not isinstance(field_id, str) or field_id not in field_map:
                    fail("布局中的字段不存在或不属于当前工作项类型")
                if field_id in placed:
                    fail("同一字段只能放置一次")
                placed.add(field_id)
                if not isinstance(entry.get("width"), str) or entry["width"] not in LAYOUT_WIDTHS:
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
    if set(field_map) - placed:
        fail("请先将未分配字段放入分组，再保存布局")


def remap_field_layout(layout, field_id_map):
    """Scheme copies must reference their copied field bindings, never the source."""
    result = deepcopy(layout or {})
    for page in result.get("pages", []):
        for group in page.get("groups", []):
            group["fields"] = [
                {**entry, "field_id": field_id_map[entry["field_id"]]}
                for entry in group["fields"]
                if entry["field_id"] in field_id_map
            ]
    return result
