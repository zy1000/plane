from copy import deepcopy
from uuid import UUID

from django.utils import timezone
from django.utils.html import strip_tags

from plane.app.permissions import ROLE
from plane.db.models import (
    Product,
    ProductMember,
    ProjectMember,
    RequirementApprover,
    RequirementDetail,
    RequirementField,
    RequirementFieldType,
    User,
    Workspace,
    WorkspaceMember,
)


SORT_ORDER_STEP = 1000


class RequirementDataLossError(Exception):
    def __init__(self, affected_detail_count):
        self.affected_detail_count = affected_detail_count
        super().__init__("Saving this field structure will remove existing detail values.")


class RequirementDetailBatchConflict(Exception):
    def __init__(self, conflicts):
        self.conflicts = conflicts
        super().__init__("One or more requirement details changed before the batch was saved.")


def get_requirement_select_mode(field):
    config = (
        field.config
        if isinstance(field, RequirementField)
        else (field.get("config") or {})
    )
    return "multiple" if config.get("selection_mode") == "multiple" else "single"


def get_requirement_select_options(field):
    config = (
        field.config
        if isinstance(field, RequirementField)
        else (field.get("config") or {})
    )
    options = config.get("options") or []
    return options if isinstance(options, list) else []


def get_requirement_eligible_user_ids(
    *,
    workspace_id,
    user_ids,
    product_id=None,
    project_id=None,
):
    """Return users that can own or approve a requirement in its target scope."""
    candidate_ids = set(user_ids)
    if not candidate_ids:
        return set()

    workspace_member_ids = set(
        WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            member_id__in=candidate_ids,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("member_id", flat=True)
    )

    if product_id:
        product = Product.objects.filter(id=product_id).only("owner_id").first()
        product_member_ids = set(
            ProductMember.objects.filter(
                product_id=product_id,
                member_id__in=workspace_member_ids,
            ).values_list("member_id", flat=True)
        )
        privileged_ids = set(
            WorkspaceMember.objects.filter(
                workspace_id=workspace_id,
                member_id__in=workspace_member_ids,
                role=ROLE.ADMIN.value,
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("member_id", flat=True)
        )
        workspace_owner_id = (
            Workspace.objects.filter(id=workspace_id)
            .values_list("owner_id", flat=True)
            .first()
        )
        if workspace_owner_id in candidate_ids:
            privileged_ids.add(workspace_owner_id)
        if product is not None and product.owner_id in candidate_ids:
            privileged_ids.add(product.owner_id)
        return workspace_member_ids.intersection(product_member_ids).union(
            privileged_ids
        )

    if project_id:
        project_member_ids = set(
            ProjectMember.objects.filter(
                project_id=project_id,
                member_id__in=workspace_member_ids,
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("member_id", flat=True)
        )
        return workspace_member_ids.intersection(project_member_ids)

    return workspace_member_ids


def clone_requirement_children(*, source, target, include_details=True, actor=None):
    """Clone a template's field tree and optionally its detail rows."""
    source_fields = list(source.fields.all())
    field_map = {}

    root_fields = []
    for source_field in source_fields:
        if source_field.parent_field_id:
            continue
        cloned_field = RequirementField(
            requirement=target,
            name=source_field.name,
            field_type=source_field.field_type,
            is_required=source_field.is_required,
            is_active=source_field.is_active,
            sort_order=source_field.sort_order,
            config=deepcopy(source_field.config),
            default_value=deepcopy(source_field.default_value),
            created_by=actor,
        )
        root_fields.append(cloned_field)
        field_map[source_field.id] = cloned_field

    if root_fields:
        RequirementField.objects.bulk_create(root_fields)

    child_fields = []
    for source_field in source_fields:
        if not source_field.parent_field_id:
            continue
        cloned_parent = field_map.get(source_field.parent_field_id)
        if cloned_parent is None:
            raise ValueError("The requirement template contains an invalid field tree.")
        cloned_field = RequirementField(
            requirement=target,
            parent_field=cloned_parent,
            name=source_field.name,
            field_type=source_field.field_type,
            is_required=source_field.is_required,
            is_active=source_field.is_active,
            sort_order=source_field.sort_order,
            config=deepcopy(source_field.config),
            default_value=deepcopy(source_field.default_value),
            created_by=actor,
        )
        child_fields.append(cloned_field)
        field_map[source_field.id] = cloned_field

    if child_fields:
        RequirementField.objects.bulk_create(child_fields)

    def remap_detail_data(source_data):
        remapped = {}
        for source_key, value in deepcopy(source_data).items():
            try:
                source_field_id = UUID(str(source_key))
            except (TypeError, ValueError):
                continue
            target_field = field_map.get(source_field_id)
            if target_field is None:
                continue
            target_key = str(target_field.id)
            if target_field.field_type != RequirementFieldType.FORM:
                remapped[target_key] = value
                continue

            rows = []
            for row in value if isinstance(value, list) else []:
                if not isinstance(row, dict):
                    continue
                child_values = {}
                for child_key, child_value in (row.get("values") or {}).items():
                    try:
                        source_child_id = UUID(str(child_key))
                    except (TypeError, ValueError):
                        continue
                    target_child = field_map.get(source_child_id)
                    if target_child is not None:
                        child_values[str(target_child.id)] = child_value
                rows.append({**row, "values": child_values})
            remapped[target_key] = rows
        return remapped

    if not include_details:
        return

    details = [
        RequirementDetail(
            requirement=target,
            data=remap_detail_data(source_detail.data),
            sort_order=source_detail.sort_order,
            version=source_detail.version,
            created_by=actor,
        )
        for source_detail in source.details.all()
    ]
    if details:
        RequirementDetail.objects.bulk_create(details)


def replace_requirement_approvers(*, requirement, approver_ids, actor=None):
    """Replace the active approver list while preserving the submitted order."""
    RequirementApprover.objects.filter(requirement=requirement).delete()
    RequirementApprover.objects.bulk_create(
        [
            RequirementApprover(
                requirement=requirement,
                approver_id=approver_id,
                sort_order=index,
                created_by=actor,
            )
            for index, approver_id in enumerate(approver_ids)
        ]
    )
    if hasattr(requirement, "_prefetched_objects_cache"):
        requirement._prefetched_objects_cache.pop("approvers", None)


def serialize_requirement_field_tree(requirement):
    fields = list(
        requirement.fields.select_related("parent_field").order_by(
            "sort_order", "created_at", "id"
        )
    )
    children_by_parent = {}
    roots = []
    for field in fields:
        payload = {
            "id": str(field.id),
            "name": field.name,
            "field_type": field.field_type,
            "is_required": field.is_required,
            "is_active": field.is_active,
            "sort_order": field.sort_order,
            "config": deepcopy(field.config),
            "default_value": deepcopy(field.default_value),
            "children": [],
        }
        if field.parent_field_id:
            children_by_parent.setdefault(field.parent_field_id, []).append(payload)
        else:
            roots.append((field.id, payload))

    result = []
    for field_id, payload in roots:
        payload["children"] = children_by_parent.get(field_id, [])
        result.append(payload)
    return result


def _clean_detail_data_for_fields(data, removed_fields):
    cleaned = deepcopy(data)
    changed = False
    removed_root_ids = {
        str(field.id)
        for field in removed_fields
        if field.parent_field_id is None
    }
    for field_id in removed_root_ids:
        if field_id in cleaned:
            cleaned.pop(field_id, None)
            changed = True

    removed_children_by_parent = {}
    for field in removed_fields:
        if field.parent_field_id is not None:
            removed_children_by_parent.setdefault(str(field.parent_field_id), set()).add(
                str(field.id)
            )

    for parent_id, child_ids in removed_children_by_parent.items():
        rows = cleaned.get(parent_id)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("values"), dict):
                continue
            for child_id in child_ids:
                if child_id in row["values"]:
                    row["values"].pop(child_id, None)
                    changed = True
    return cleaned, changed


def _clear_detail_value_for_field(data, field, empty_value):
    cleaned = deepcopy(data)
    field_id = str(field.id)
    changed = False

    if field.parent_field_id is None:
        if not _is_empty_detail_value(cleaned.get(field_id)):
            cleaned[field_id] = deepcopy(empty_value)
            changed = True
        return cleaned, changed

    rows = cleaned.get(str(field.parent_field_id))
    if not isinstance(rows, list):
        return cleaned, changed
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("values"), dict):
            continue
        if not _is_empty_detail_value(row["values"].get(field_id)):
            row["values"][field_id] = deepcopy(empty_value)
            changed = True
    return cleaned, changed


def _select_config_removes_values(field, payload):
    if (
        field.field_type != RequirementFieldType.SELECT
        or payload["field_type"] != RequirementFieldType.SELECT
    ):
        return False
    old_ids = {
        str(option.get("id"))
        for option in get_requirement_select_options(field)
        if isinstance(option, dict) and option.get("id")
    }
    new_ids = {
        str(option.get("id"))
        for option in get_requirement_select_options(payload)
        if isinstance(option, dict) and option.get("id")
    }
    return (
        get_requirement_select_mode(field) != get_requirement_select_mode(payload)
        or not old_ids.issubset(new_ids)
    )


def sync_requirement_fields(
    *,
    requirement,
    field_payloads,
    actor=None,
    confirm_data_loss=False,
):
    existing_fields = {
        field.id: field
        for field in RequirementField.objects.filter(requirement=requirement).select_related(
            "parent_field"
        )
    }
    submitted_ids = set()
    created_field_ids = {}
    data_loss_fields = []
    reset_select_fields = {}

    def save_field(payload, parent=None, index=0):
        field_id = payload.get("id")
        if field_id:
            field = existing_fields.get(field_id)
            if field is None:
                raise ValueError("A submitted field does not belong to this requirement.")
            expected_parent_id = parent.id if parent else None
            if field.parent_field_id != expected_parent_id:
                raise ValueError("Existing fields cannot be moved between field levels.")
            if field.field_type != payload["field_type"]:
                data_loss_fields.append(deepcopy(field))
            elif _select_config_removes_values(field, payload):
                reset_select_fields[field.id] = (
                    deepcopy(field),
                    [] if get_requirement_select_mode(payload) == "multiple" else None,
                )
            submitted_ids.add(field.id)
        else:
            field = RequirementField(requirement=requirement, parent_field=parent)

        field.name = payload["name"]
        field.field_type = payload["field_type"]
        field.is_required = payload["is_required"]
        field.is_active = payload["is_active"]
        field.sort_order = (index + 1) * SORT_ORDER_STEP
        field.config = deepcopy(payload.get("config") or {})
        field.default_value = deepcopy(payload.get("default_value"))
        field.full_clean(exclude=["created_by", "updated_by"])
        if field._state.adding and actor is not None:
            field.created_by = actor
        field.save()

        client_id = payload.get("client_id")
        if client_id:
            created_field_ids[str(client_id)] = str(field.id)

        for child_index, child_payload in enumerate(payload.get("children") or []):
            save_field(child_payload, parent=field, index=child_index)
        return field

    for root_index, root_payload in enumerate(field_payloads):
        save_field(root_payload, index=root_index)

    deleted_fields = [
        field for field_id, field in existing_fields.items() if field_id not in submitted_ids
    ]
    cleanup_fields_by_id = {
        field.id: field for field in [*deleted_fields, *data_loss_fields]
    }
    cleanup_fields = list(cleanup_fields_by_id.values())

    changed_details = []
    if cleanup_fields or reset_select_fields:
        for detail in RequirementDetail.objects.select_for_update().filter(
            requirement=requirement
        ):
            cleaned_data, changed = _clean_detail_data_for_fields(
                detail.data, cleanup_fields
            )
            for field, empty_value in reset_select_fields.values():
                cleaned_data, select_changed = _clear_detail_value_for_field(
                    cleaned_data,
                    field,
                    empty_value,
                )
                changed = changed or select_changed
            if changed:
                detail.data = cleaned_data
                detail.version += 1
                detail.updated_at = timezone.now()
                detail.updated_by = actor
                changed_details.append(detail)

    if changed_details and not confirm_data_loss:
        raise RequirementDataLossError(len(changed_details))

    if deleted_fields:
        RequirementField.objects.filter(
            id__in=[field.id for field in deleted_fields]
        ).delete()
    if changed_details:
        RequirementDetail.objects.bulk_update(
            changed_details, ["data", "version", "updated_at", "updated_by"]
        )

    requirement.updated_by = actor
    requirement.save(update_fields=["updated_at", "updated_by"])
    return created_field_ids


def insert_requirement_detail(
    *,
    requirement,
    data,
    actor=None,
    before_id=None,
    after_id=None,
):
    if before_id and after_id:
        raise ValueError("Only one insertion anchor can be provided.")

    existing = list(
        RequirementDetail.objects.select_for_update()
        .filter(requirement=requirement)
        .order_by("sort_order", "created_at", "id")
    )
    ids = [detail.id for detail in existing]
    if before_id:
        try:
            insert_at = ids.index(before_id)
        except ValueError as exc:
            raise ValueError("The insertion anchor was not found.") from exc
    elif after_id:
        try:
            insert_at = ids.index(after_id) + 1
        except ValueError as exc:
            raise ValueError("The insertion anchor was not found.") from exc
    else:
        insert_at = len(existing)

    detail = RequirementDetail(
        requirement=requirement,
        data=deepcopy(data),
        sort_order=(insert_at + 1) * SORT_ORDER_STEP,
        created_by=actor,
    )
    detail.save()
    existing.insert(insert_at, detail)
    for index, item in enumerate(existing):
        item.sort_order = (index + 1) * SORT_ORDER_STEP
        item.updated_at = timezone.now()
    RequirementDetail.objects.bulk_update(existing, ["sort_order", "updated_at"])
    return detail


def save_requirement_detail_batch(
    *,
    requirement,
    creates,
    updates,
    deletes,
    actor=None,
):
    existing = list(
        RequirementDetail.objects.select_for_update()
        .filter(requirement=requirement)
        .order_by("sort_order", "created_at", "id")
    )
    details_by_id = {detail.id: detail for detail in existing}
    conflicts = []

    for item in [*updates, *deletes]:
        detail = details_by_id.get(item["id"])
        if detail is None:
            conflicts.append(
                {
                    "id": str(item["id"]),
                    "reason": "not_found",
                }
            )
        elif detail.version != item["version"]:
            conflicts.append(
                {
                    "id": str(item["id"]),
                    "reason": "version_conflict",
                    "current_version": detail.version,
                }
            )

    delete_ids = {item["id"] for item in deletes}
    for item in creates:
        anchor_id = item.get("before_id") or item.get("after_id")
        if anchor_id is None:
            continue
        if anchor_id in delete_ids:
            conflicts.append(
                {
                    "id": str(anchor_id),
                    "reason": "anchor_deleted",
                }
            )
        elif anchor_id not in details_by_id:
            conflicts.append(
                {
                    "id": str(anchor_id),
                    "reason": "anchor_not_found",
                }
            )

    if conflicts:
        raise RequirementDetailBatchConflict(conflicts)

    now = timezone.now()
    updated_details = []
    for item in updates:
        detail = details_by_id[item["id"]]
        detail.data = deepcopy(item["data"])
        detail.version += 1
        detail.updated_at = now
        detail.updated_by = actor
        updated_details.append(detail)
    if updated_details:
        RequirementDetail.objects.bulk_update(
            updated_details,
            ["data", "version", "updated_at", "updated_by"],
        )

    ordered_details = [
        detail for detail in existing if detail.id not in delete_ids
    ]
    created_details = []
    after_anchor_offsets = {}
    for item in creates:
        before_id = item.get("before_id")
        after_id = item.get("after_id")
        ordered_ids = [detail.id for detail in ordered_details]
        if before_id:
            insert_at = ordered_ids.index(before_id)
        elif after_id:
            anchor_offset = after_anchor_offsets.get(after_id, 0)
            insert_at = ordered_ids.index(after_id) + 1 + anchor_offset
            after_anchor_offsets[after_id] = anchor_offset + 1
        else:
            insert_at = len(ordered_details)

        detail = RequirementDetail(
            requirement=requirement,
            data=deepcopy(item["data"]),
            sort_order=(insert_at + 1) * SORT_ORDER_STEP,
            created_by=actor,
        )
        detail.save()
        ordered_details.insert(insert_at, detail)
        created_details.append((item["client_id"], detail))

    if delete_ids:
        RequirementDetail.objects.filter(
            requirement=requirement,
            id__in=delete_ids,
        ).delete()

    if creates or deletes:
        for index, detail in enumerate(ordered_details):
            detail.sort_order = (index + 1) * SORT_ORDER_STEP
            detail.updated_at = now
        RequirementDetail.objects.bulk_update(
            ordered_details,
            ["sort_order", "updated_at"],
        )

    return created_details, updated_details, list(delete_ids)


def _is_empty_detail_value(value):
    if value is None:
        return True
    if isinstance(value, str):
        return not strip_tags(value).strip()
    if isinstance(value, (list, dict)):
        return not value
    return False


def _value_matches_filter(value, operator, expected, field=None):
    if operator == "is_empty":
        return _is_empty_detail_value(value)
    if operator == "is_not_empty":
        return not _is_empty_detail_value(value)
    if operator == "contains":
        if (
            field is not None
            and field.field_type == RequirementFieldType.SELECT
            and get_requirement_select_mode(field) == "multiple"
        ):
            return isinstance(value, list) and expected in value
        return str(expected or "").casefold() in strip_tags(str(value or "")).casefold()
    if operator == "equals":
        if isinstance(value, str) and isinstance(expected, str):
            return value.casefold() == expected.casefold()
        return value == expected
    return False


def filter_requirement_detail_ids(*, requirement, search="", filters=None):
    filters = filters or []
    fields = list(requirement.fields.select_related("parent_field"))
    fields_by_id = {str(field.id): field for field in fields}
    details = list(
        RequirementDetail.objects.filter(requirement=requirement).order_by(
            "sort_order", "created_at", "id"
        )
    )

    member_ids = set()
    for detail in details:
        for field in fields:
            if field.field_type != RequirementFieldType.MEMBER:
                continue
            if field.parent_field_id:
                rows = detail.data.get(str(field.parent_field_id), [])
                for row in rows if isinstance(rows, list) else []:
                    value = (row.get("values") or {}).get(str(field.id))
                    if value:
                        member_ids.add(value)
            else:
                value = detail.data.get(str(field.id))
                if value:
                    member_ids.add(value)
    members = {}
    for member in User.objects.filter(id__in=member_ids):
        members[str(member.id)] = member.display_name

    def get_field_values(detail, field):
        if field.parent_field_id:
            rows = detail.data.get(str(field.parent_field_id), [])
            if not isinstance(rows, list):
                return []
            return [
                (row.get("values") or {}).get(str(field.id))
                for row in rows
                if isinstance(row, dict)
            ]
        return [detail.data.get(str(field.id))]

    def searchable_value(field, value):
        if field.field_type == RequirementFieldType.MEMBER:
            return members.get(str(value), str(value or ""))
        if field.field_type == RequirementFieldType.SELECT:
            option_labels = {
                str(option.get("id")): str(option.get("label") or "")
                for option in get_requirement_select_options(field)
                if isinstance(option, dict) and option.get("id")
            }
            selected_ids = value if isinstance(value, list) else [value]
            return " ".join(
                option_labels.get(str(option_id), "")
                for option_id in selected_ids
                if option_id
            )
        if field.field_type in (
            RequirementFieldType.ATTACHMENT,
            RequirementFieldType.IMAGE,
        ):
            if not isinstance(value, list):
                return ""
            return " ".join(
                str(item.get("name") or "")
                for item in value
                if isinstance(item, dict)
            )
        if field.field_type == RequirementFieldType.RICH_TEXT:
            return strip_tags(str(value or ""))
        return str(value or "")

    normalized_search = search.strip().casefold()
    matching_ids = []
    for detail in details:
        if normalized_search:
            haystack = []
            for field in fields:
                if field.field_type == RequirementFieldType.FORM:
                    continue
                haystack.extend(
                    searchable_value(field, value)
                    for value in get_field_values(detail, field)
                )
            if normalized_search not in " ".join(haystack).casefold():
                continue

        matches = True
        for item in filters:
            field = fields_by_id.get(str(item.get("field_id")))
            if field is None or field.field_type == RequirementFieldType.FORM:
                matches = False
                break
            values = get_field_values(detail, field)
            operator = item.get("operator")
            expected = item.get("value")
            if field.parent_field_id and operator == "is_empty":
                item_matches = not values or all(
                    _value_matches_filter(value, operator, expected, field)
                    for value in values
                )
            else:
                item_matches = any(
                    _value_matches_filter(value, operator, expected, field)
                    for value in values
                )
            if not item_matches:
                matches = False
                break
        if matches:
            matching_ids.append(detail.id)
    return matching_ids
