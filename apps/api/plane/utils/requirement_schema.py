"""需求类型字段结构的修订链。

字段结构变更**立即生效、不走审批**，这带来两个问题，都由这里的修订链解决：

1. 变更轨迹要能看到「字段结构变过」。但一个类型下可能有成千上万条需求，给每条各写
   一条轨迹就是把刚从审批链路里拆掉的 O(N) 写入又请回来 —— 所以一次类型编辑只写
   **一行**修订，每条需求在**读**轨迹时把本类型的修订并进来。
2. 历史版本要能原样渲染。v3 的内容必须指得回 v3 当时的字段树，否则一年后打开旧版本
   会拿今天的表头去渲染当年的值。RequirementVersion.schema_revision 就是这个指针。

修订表 append-only，只增不改不删；版本与变更项都以 PROTECT 引用它。
"""

from copy import deepcopy

from django.db.models import Max

from plane.db.models import (
    RequirementChangeType,
    RequirementTypeSchemaRevision,
)
from plane.utils.requirement import (
    field_specs_from_tree,
    serialize_requirement_type_field_tree,
)


# 什么算「字段变了」。注意是 position 而不是 sort_order —— sort_order 每次保存都会
# 按数组下标整体重写，用它比较会把「什么都没动」判成全员变更。
FIELD_COMPARE_KEYS = (
    "name",
    "field_type",
    "field_category",
    "is_required",
    "is_active",
    "position",
    "config",
    "default_value",
)


def flatten_field_tree(tree):
    """摊平字段树，并给子字段带上父字段名，供 diff 展示定位。"""
    flat = {}
    sibling_positions = {}
    for spec in field_specs_from_tree(tree):
        # position 按 (需求类型, 父字段) 分组计数，而不是全局 —— 全局计数会让
        # 「引用的类型集合变了」把其他类型的根字段重新编号，而 position 在
        # FIELD_COMPARE_KEYS 里，那会凭空炸出一堆假的字段变更项。
        position_key = (spec.requirement_type_id, spec.parent_field_id)
        position = sibling_positions.get(position_key, 0) + 1
        sibling_positions[position_key] = position
        flat[spec.id] = {
            "id": spec.id,
            "parent_field_id": spec.parent_field_id,
            "requirement_type_id": spec.requirement_type_id,
            "field_category": spec.field_category,
            "name": spec.name,
            "field_type": spec.field_type,
            "is_required": spec.is_required,
            "is_active": spec.is_active,
            "sort_order": spec.sort_order,
            "position": position,
            "config": spec.config,
            "default_value": spec.default_value,
        }
    for payload in flat.values():
        parent = flat.get(payload["parent_field_id"])
        payload["parent_name"] = parent["name"] if parent else None
    return flat


def diff_field_trees(before_tree, after_tree):
    """两棵字段树的字段级差异，按 (create, update, delete) 的顺序返回。

    形状与原来基线变更单里的 SCHEMA 变更项一致，前端的 SchemaDiffList 可以直接吃。
    """
    before_fields = flatten_field_tree(before_tree or [])
    after_fields = flatten_field_tree(after_tree or [])
    changes = []

    for field_id, payload in after_fields.items():
        previous = before_fields.get(field_id)
        if previous is None:
            changes.append(
                {
                    "change_type": RequirementChangeType.CREATE,
                    "field_id": field_id,
                    "parent_field_id": payload["parent_field_id"],
                    "name": payload["name"],
                    "before": None,
                    "after": payload,
                }
            )
        elif any(previous.get(key) != payload.get(key) for key in FIELD_COMPARE_KEYS):
            changes.append(
                {
                    "change_type": RequirementChangeType.UPDATE,
                    "field_id": field_id,
                    "parent_field_id": payload["parent_field_id"],
                    "name": payload["name"],
                    "before": previous,
                    "after": payload,
                }
            )

    for field_id, payload in before_fields.items():
        if field_id in after_fields:
            continue
        changes.append(
            {
                "change_type": RequirementChangeType.DELETE,
                "field_id": field_id,
                "parent_field_id": payload["parent_field_id"],
                "name": payload["name"],
                "before": payload,
                "after": None,
            }
        )

    return changes


def get_current_revision(requirement_type):
    """当前生效的修订。从未产生过修订时返回 None。"""
    if not requirement_type.current_schema_revision:
        return None
    return (
        RequirementTypeSchemaRevision.objects.filter(
            requirement_type=requirement_type,
            revision=requirement_type.current_schema_revision,
        )
        .order_by("-revision")
        .first()
    )


def ensure_schema_revision(requirement_type, *, actor=None):
    """保证该类型至少有一个修订，返回当前修订。

    提交变更单与写版本都要以 PROTECT 引用一个修订，所以在这两条路径上必须先保证它
    存在 —— 一个从未编辑过字段结构的类型不会有任何修订。
    """
    current = get_current_revision(requirement_type)
    if current is not None:
        return current
    return write_schema_revision(requirement_type, actor=actor, force=True)


def write_schema_revision(requirement_type, *, actor=None, force=False):
    """把该类型当前的字段树记为一个新修订，返回修订行；无实质变化时返回当前修订。

    **无变化不写行**是这里最重要的一条：否则每保存一次类型配置页（哪怕只改了类型名）
    都会往这个类型下上千条需求的变更轨迹里塞一条空变更。
    """
    tree = serialize_requirement_type_field_tree(requirement_type)
    current = get_current_revision(requirement_type)

    if current is not None and not force:
        diff = diff_field_trees(current.fields, tree)
        if not diff:
            return current
    else:
        diff = [] if current is None else diff_field_trees(current.fields, tree)

    next_revision = (
        RequirementTypeSchemaRevision.objects.filter(
            requirement_type=requirement_type
        ).aggregate(value=Max("revision"))["value"]
        or 0
    ) + 1

    revision = RequirementTypeSchemaRevision(
        requirement_type=requirement_type,
        revision=next_revision,
        fields=deepcopy(tree),
        diff=diff,
    )
    if actor is not None:
        revision.created_by = actor
        revision.updated_by = actor
    revision.save()

    requirement_type.current_schema_revision = next_revision
    requirement_type.save(update_fields=["current_schema_revision", "updated_at"])
    return revision
