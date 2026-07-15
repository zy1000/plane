from django.db import transaction
from django.db.models import Max
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone

from plane.app.permissions import can_manage_product, can_view_product
from plane.db.models import (
    FileAsset,
    Notification,
    Requirement,
    RequirementAttachment,
    RequirementChange,
    RequirementChangeAttachment,
    RequirementChangeKind,
    RequirementChangeReviewer,
    RequirementChangeStatus,
    RequirementFieldTemplate,
    RequirementLifecycleAction,
    RequirementLifecycleEvent,
    RequirementReviewOpinion,
    RequirementReviewRecord,
    RequirementVersion,
    RequirementVersionAttachment,
    WorkspaceMember,
)
from plane.utils.requirement_structure import (
    RequirementStructureError,
    create_structured_revision,
    lock_revision_for_review,
)


class RequirementReviewError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def _user_snapshot(user):
    if user is None:
        return None
    return {
        "id": str(user.id),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "display_name": user.display_name,
        "avatar": user.avatar,
        "avatar_url": user.avatar_url,
        "is_bot": user.is_bot,
    }


def _asset_snapshot(asset):
    return {
        "id": str(asset.id),
        "attributes": asset.attributes or {},
        "asset_url": asset.asset_url,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "updated_at": asset.updated_at.isoformat() if asset.updated_at else None,
        "created_by": str(asset.created_by_id) if asset.created_by_id else None,
    }


def _module_snapshot(module):
    if module is None:
        return None
    return {"id": str(module.id), "name": module.name}


def _parent_snapshot(parent):
    if parent is None:
        return None
    return {"id": str(parent.id), "name": parent.name, "type": parent.type}


def _structured_snapshot(revision):
    if revision is None:
        return None
    return {
        "revision_id": str(revision.id),
        "source_revision_id": str(revision.source_revision_id) if revision.source_revision_id else None,
        "source_template_id": str(revision.source_template_id) if revision.source_template_id else None,
        "source_template_revision": revision.source_template_revision,
        "schema_hash": revision.schema_hash,
        "content_hash": revision.content_hash,
        "root_row_count": revision.root_row_count,
        "child_row_count": revision.child_row_count,
    }


def capture_requirement_snapshot(requirement):
    reviewers = list(requirement.reviewers.all().order_by("display_name", "id"))
    assets = [relation.asset for relation in requirement.requirement_attachments.all()]
    return {
        "name": requirement.name,
        "type": requirement.type,
        "content_mode": requirement.content_mode,
        "priority": requirement.priority,
        "module": _module_snapshot(requirement.module),
        "parent": _parent_snapshot(requirement.parent),
        "assignee": _user_snapshot(requirement.assignee),
        "reviewers": [_user_snapshot(user) for user in reviewers],
        "description_html": requirement.description_html,
        "acceptance_criteria_html": requirement.acceptance_criteria_html,
        "attachments": [_asset_snapshot(asset) for asset in assets],
        "structured": _structured_snapshot(requirement.active_structured_revision),
    }


def capture_change_snapshot(change):
    reviewers = list(change.proposed_reviewers.all().order_by("display_name", "id"))
    assets = [relation.asset for relation in change.change_attachments.all()]
    try:
        structured_revision = change.structured_revision
    except ObjectDoesNotExist:
        structured_revision = None
    return {
        "name": change.name,
        "type": change.requirement.type,
        "content_mode": change.requirement.content_mode,
        "priority": change.priority,
        "module": _module_snapshot(change.module),
        "parent": _parent_snapshot(change.parent),
        "assignee": _user_snapshot(change.assignee),
        "reviewers": [_user_snapshot(user) for user in reviewers],
        "description_html": change.description_html,
        "acceptance_criteria_html": change.acceptance_criteria_html,
        "attachments": [_asset_snapshot(asset) for asset in assets],
        "structured": _structured_snapshot(structured_revision),
    }


def build_requirement_diff(from_snapshot, to_snapshot):
    from_snapshot = from_snapshot or {}
    to_snapshot = to_snapshot or {}
    labels = {
        "name": "需求名称",
        "type": "需求类型",
        "content_mode": "内容模式",
        "priority": "优先级",
        "module": "模块",
        "parent": "父需求",
        "assignee": "负责人",
        "reviewers": "评审人",
        "description_html": "需求描述",
        "acceptance_criteria_html": "验收标准",
        "attachments": "附件",
        "structured": "结构化数据",
    }
    set_fields = {"reviewers", "attachments"}
    changes = []
    for field, label in labels.items():
        old_value = from_snapshot.get(field)
        new_value = to_snapshot.get(field)
        if field in set_fields:
            old_items = old_value or []
            new_items = new_value or []
            old_by_id = {str(item.get("id")): item for item in old_items if item and item.get("id")}
            new_by_id = {str(item.get("id")): item for item in new_items if item and item.get("id")}
            if set(old_by_id) == set(new_by_id):
                continue
            added_ids = sorted(set(new_by_id) - set(old_by_id))
            removed_ids = sorted(set(old_by_id) - set(new_by_id))
            changes.append(
                {
                    "field": field,
                    "label": label,
                    "change_type": "modified",
                    "from": old_items,
                    "to": new_items,
                    "added": [new_by_id[item_id] for item_id in added_ids],
                    "removed": [old_by_id[item_id] for item_id in removed_ids],
                }
            )
        elif old_value != new_value:
            changes.append(
                {
                    "field": field,
                    "label": label,
                    "change_type": "added" if old_value in (None, "", [], {}) else "modified",
                    "from": old_value,
                    "to": new_value,
                }
            )
    return {
        "from_snapshot": from_snapshot,
        "to_snapshot": to_snapshot,
        "changed_fields": changes,
        "changed_count": len(changes),
    }


def proposal_data_from_change(change, **overrides):
    data = {
        "name": change.name,
        "priority": change.priority,
        "module": change.module,
        "parent": change.parent,
        "assignee": change.assignee,
        "reviewers": list(change.proposed_reviewers.all()),
        "description_html": change.description_html,
        "acceptance_criteria_html": change.acceptance_criteria_html,
        "attachment_ids": list(change.change_attachments.values_list("asset_id", flat=True)),
    }
    data.update(overrides)
    return data


def is_eligible_requirement_member(product, user):
    if user is None:
        return False
    if not WorkspaceMember.objects.filter(
        workspace=product.workspace,
        member=user,
        is_active=True,
    ).exists():
        return False
    return can_view_product(user, product)


def can_edit_requirement_draft(change, user):
    requirement = change.requirement
    return bool(
        user
        and not user.is_anonymous
        and (
            change.created_by_id == user.id
            or requirement.assignee_id == user.id
            or can_manage_product(user, requirement.product)
        )
    )


def can_manage_requirement_lifecycle(requirement, user):
    return bool(
        user
        and not user.is_anonymous
        and (requirement.assignee_id == user.id or can_manage_product(user, requirement.product))
    )


def _eligible_user_ids(product, user_ids):
    members = WorkspaceMember.objects.filter(
        workspace=product.workspace,
        member_id__in=user_ids,
        is_active=True,
    ).select_related("member")
    return [member.member_id for member in members if can_view_product(member.member, product)]


def _sync_current_attachments(requirement, asset_ids, actor):
    asset_ids = set(asset_ids)
    current_relations = RequirementAttachment.objects.filter(requirement=requirement)
    current_ids = set(current_relations.values_list("asset_id", flat=True))
    current_relations.exclude(asset_id__in=asset_ids).delete()
    for asset_id in asset_ids - current_ids:
        RequirementAttachment.objects.create(
            requirement=requirement,
            asset_id=asset_id,
            created_by=actor,
        )
    FileAsset.objects.filter(id__in=asset_ids).update(
        entity_identifier=str(requirement.id),
        is_deleted=False,
        deleted_at=None,
    )


def _bind_change_attachments(change, asset_ids, actor):
    RequirementChangeAttachment.objects.bulk_create(
        [
            RequirementChangeAttachment(change=change, asset_id=asset_id, created_by=actor)
            for asset_id in dict.fromkeys(asset_ids)
        ],
        batch_size=100,
        ignore_conflicts=True,
    )


def _sync_change_attachments(change, asset_ids, actor):
    asset_ids = set(asset_ids)
    current_relations = RequirementChangeAttachment.objects.filter(change=change)
    current_ids = set(current_relations.values_list("asset_id", flat=True))
    current_relations.exclude(asset_id__in=asset_ids).update(
        deleted_at=timezone.now(),
        updated_by=actor,
    )
    for asset_id in asset_ids - current_ids:
        RequirementChangeAttachment.objects.create(
            change=change,
            asset_id=asset_id,
            created_by=actor,
        )


def _record_lifecycle_event(
    requirement,
    action,
    actor,
    *,
    change=None,
    from_status="",
    to_status="",
    reason_code="",
    note="",
    metadata=None,
):
    return RequirementLifecycleEvent.objects.create(
        requirement=requirement,
        change=change,
        action=action,
        from_status=from_status or "",
        to_status=to_status or "",
        reason_code=reason_code or "",
        note=str(note or "").strip(),
        metadata=metadata or {},
        created_by=actor,
    )


def _requirement_url(requirement, review=False):
    prefix = "user-requirements" if requirement.type == Requirement.RequirementType.USER else "development-requirements"
    suffix = "/review" if review else ""
    return f"/{requirement.product.workspace.slug}/products/{requirement.product_id}/{prefix}/{requirement.id}{suffix}"


def _send_notifications(change, event, receivers, triggered_by):
    receiver_ids = list(dict.fromkeys(str(receiver_id) for receiver_id in receivers if receiver_id))
    if not receiver_ids:
        return
    requirement = change.requirement
    event_titles = {
        "requested": f"需要你评审需求「{change.name}」",
        "reset": f"需求「{change.name}」的评审内容已更新，请重新评审",
        "clarification": f"需求「{change.name}」有待明确",
        "approved": f"需求「{change.name}」已通过评审",
        "rejected": f"需求「{change.name}」已被拒绝",
    }
    review_target = event in {"requested", "reset", "clarification"}
    notifications = [
        Notification(
            workspace=requirement.product.workspace,
            project=None,
            sender=f"in_app:requirement_review:{event}",
            triggered_by=triggered_by,
            receiver_id=receiver_id,
            entity_identifier=requirement.id,
            entity_name="requirement",
            title=event_titles[event],
            data={
                "requirement": {
                    "id": str(requirement.id),
                    "name": change.name,
                    "type": requirement.type,
                    "product_id": str(requirement.product_id),
                },
                "requirement_change_id": str(change.id),
                "event": event,
                "target_url": _requirement_url(requirement, review=review_target),
            },
        )
        for receiver_id in receiver_ids
    ]
    Notification.objects.bulk_create(notifications, batch_size=100)


def _send_requirement_lifecycle_notifications(requirement, event, triggered_by, change=None):
    receiver_ids = [
        requirement.created_by_id,
        requirement.assignee_id,
        *requirement.reviewers.values_list("id", flat=True),
    ]
    receiver_ids = list(
        dict.fromkeys(
            str(receiver_id)
            for receiver_id in receiver_ids
            if receiver_id and str(receiver_id) != str(triggered_by.id)
        )
    )
    if not receiver_ids:
        return
    event_titles = {
        "withdrawn": f"需求「{requirement.name}」的评审已撤回",
        "discarded": f"需求「{requirement.name}」的修订草稿已放弃",
        "closed": f"需求「{requirement.name}」已关闭",
        "reopened": f"需求「{requirement.name}」已重新打开",
        "archived": f"需求「{requirement.name}」已归档",
        "restored": f"需求「{requirement.name}」已恢复归档",
        "deleted": f"需求「{requirement.name}」已删除",
    }
    notifications = [
        Notification(
            workspace=requirement.product.workspace,
            project=None,
            sender=f"in_app:requirement_lifecycle:{event}",
            triggered_by=triggered_by,
            receiver_id=receiver_id,
            entity_identifier=requirement.id,
            entity_name="requirement",
            title=event_titles[event],
            data={
                "requirement": {
                    "id": str(requirement.id),
                    "name": requirement.name,
                    "type": requirement.type,
                    "product_id": str(requirement.product_id),
                },
                "requirement_change_id": str(change.id) if change else None,
                "event": event,
                "target_url": _requirement_url(requirement),
            },
        )
        for receiver_id in receiver_ids
    ]
    Notification.objects.bulk_create(notifications, batch_size=100)


def notify_requirement_deleted(requirement, actor):
    _send_requirement_lifecycle_notifications(requirement, "deleted", actor)


def _apply_proposal_to_requirement(requirement, change, actor):
    requirement.name = change.name
    requirement.priority = change.priority
    requirement.module = change.module
    requirement.parent = change.parent
    requirement.assignee = change.assignee
    requirement.description_html = change.description_html
    requirement.acceptance_criteria_html = change.acceptance_criteria_html
    if requirement.content_mode == Requirement.ContentMode.STRUCTURED:
        requirement.active_structured_revision = change.structured_revision
        requirement.structured_root_row_count = change.structured_revision.root_row_count
    requirement.updated_by = actor
    requirement.save()
    requirement.reviewers.set(change.proposed_reviewers.all())
    _sync_current_attachments(
        requirement,
        change.change_attachments.values_list("asset_id", flat=True),
        actor,
    )


def _create_version(requirement, change, actor):
    snapshot = capture_requirement_snapshot(requirement)
    next_version = requirement.current_version + 1
    version = RequirementVersion.objects.create(
        requirement=requirement,
        version=next_version,
        source_change=change,
        structured_revision=(
            change.structured_revision if requirement.content_mode == Requirement.ContentMode.STRUCTURED else None
        ),
        snapshot=snapshot,
        source="review",
        created_by=actor,
    )
    RequirementVersionAttachment.objects.bulk_create(
        [
            RequirementVersionAttachment(version=version, asset_id=asset_id, created_by=actor)
            for asset_id in requirement.requirement_attachments.values_list("asset_id", flat=True)
        ],
        batch_size=100,
        ignore_conflicts=True,
    )
    requirement.current_version = next_version
    requirement.status = Requirement.Status.PUBLISHED
    requirement.save(update_fields=["current_version", "status", "updated_at"])
    return version


@transaction.atomic
def create_requirement_change(
    requirement,
    proposed_data,
    actor,
    kind=RequirementChangeKind.CHANGE,
    submit_for_review=True,
):
    requirement = (
        Requirement.objects.select_for_update(of=("self",))
        .select_related(
            "product",
            "product__workspace",
            "module",
            "parent",
            "assignee",
            "active_structured_revision",
        )
        .prefetch_related("reviewers", "requirement_attachments__asset")
        .get(pk=requirement.pk)
    )
    if requirement.archived_at is not None:
        raise RequirementReviewError("REQUIREMENT_ARCHIVED_READ_ONLY", "已归档需求不可发起修订。")
    if requirement.status == Requirement.Status.CLOSED:
        raise RequirementReviewError("REQUIREMENT_TERMINAL_READ_ONLY", "已关闭的需求不可发起修订。")
    from_status = requirement.status
    now = timezone.now()
    open_change = (
        RequirementChange.objects.select_for_update()
        .filter(
            requirement=requirement,
            status__in=[RequirementChangeStatus.DRAFT, RequirementChangeStatus.PENDING],
        )
        .first()
    )
    if open_change and kind != RequirementChangeKind.SYSTEM_RESET:
        raise RequirementReviewError("REQUIREMENT_OPEN_CHANGE_EXISTS", "该需求已有草稿或评审中的修订。")
    if open_change:
        open_change.status = RequirementChangeStatus.SUPERSEDED
        open_change.completed_at = now
        open_change.updated_by = actor
        open_change.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])

    max_sequence = (
        RequirementChange.all_objects.filter(requirement=requirement).aggregate(value=Max("sequence")).get("value") or 0
    )
    base_version = requirement.versions.filter(version=requirement.current_version).first()
    base_snapshot = capture_requirement_snapshot(requirement) if requirement.current_version else {}
    proposed_reviewers = list(proposed_data["reviewers"])
    change = RequirementChange.objects.create(
        requirement=requirement,
        sequence=max_sequence + 1,
        kind=kind,
        status=RequirementChangeStatus.DRAFT,
        base_version=base_version,
        base_snapshot=base_snapshot,
        proposal_snapshot={},
        name=proposed_data["name"],
        priority=proposed_data.get("priority", "none"),
        module=proposed_data.get("module"),
        parent=proposed_data.get("parent"),
        assignee=proposed_data.get("assignee"),
        description_html=proposed_data.get("description_html"),
        acceptance_criteria_html=proposed_data.get("acceptance_criteria_html"),
        created_by=actor,
    )
    change.proposed_reviewers.set(proposed_reviewers)
    _bind_change_attachments(change, proposed_data.get("attachment_ids", []), actor)
    if requirement.content_mode == Requirement.ContentMode.STRUCTURED:
        source_revision = proposed_data.get("source_structured_revision") or requirement.active_structured_revision
        if source_revision is None and requirement.current_version == 0:
            source_revision = (
                requirement.structured_revisions.filter(status="locked")
                .order_by("-created_at")
                .first()
            )
        template = proposed_data.get("template")
        if template is not None and (
            template.product_id != requirement.product_id
            or not template.is_active
            or template.template_type != RequirementFieldTemplate.TemplateType.STRUCTURED
        ):
            raise RequirementReviewError("REQUIREMENT_TEMPLATE_INVALID", "需求模板不可用于当前产品。")
        create_structured_revision(
            change,
            actor,
            template=template if source_revision is None else None,
            source_revision=source_revision,
        )
    change = (
        RequirementChange.objects.select_related(
            "requirement",
            "module",
            "parent",
            "assignee",
            "structured_revision",
        )
        .prefetch_related("proposed_reviewers", "change_attachments__asset")
        .get(pk=change.pk)
    )
    change.proposal_snapshot = capture_change_snapshot(change)
    change.save(update_fields=["proposal_snapshot", "updated_at"])

    requirement.updated_by = actor
    if requirement.current_version == 0:
        requirement.status = Requirement.Status.DRAFT
        requirement.name = change.name
        requirement.priority = change.priority
        requirement.module = change.module
        requirement.parent = change.parent
        requirement.assignee = change.assignee
        requirement.description_html = change.description_html
        requirement.acceptance_criteria_html = change.acceptance_criteria_html
    requirement.save()
    if requirement.current_version == 0:
        requirement.reviewers.set(proposed_reviewers)
        _sync_current_attachments(requirement, proposed_data.get("attachment_ids", []), actor)

    _record_lifecycle_event(
        requirement,
        RequirementLifecycleAction.DRAFT_CREATED,
        actor,
        change=change,
        from_status=from_status,
        to_status=requirement.status,
    )
    if submit_for_review:
        return submit_requirement_change(change.id, actor)
    return change


@transaction.atomic
def update_requirement_draft(change_id, proposed_data, actor):
    change = (
        RequirementChange.objects.select_for_update(of=("self",))
        .select_related(
            "requirement",
            "requirement__product",
            "requirement__product__workspace",
            "module",
            "parent",
            "assignee",
        )
        .prefetch_related("proposed_reviewers", "change_attachments__asset")
        .get(pk=change_id)
    )
    requirement = change.requirement
    if change.status != RequirementChangeStatus.DRAFT:
        raise RequirementReviewError("REQUIREMENT_DRAFT_EDIT_CLOSED", "只有草稿修订可以编辑。")
    if not can_edit_requirement_draft(change, actor):
        raise RequirementReviewError("REQUIREMENT_DRAFT_EDIT_FORBIDDEN", "你没有编辑该草稿的权限。")
    if requirement.archived_at is not None or requirement.status == Requirement.Status.CLOSED:
        raise RequirementReviewError("REQUIREMENT_TERMINAL_READ_ONLY", "当前需求不可编辑。")

    change.name = proposed_data["name"]
    change.priority = proposed_data.get("priority", "none")
    change.module = proposed_data.get("module")
    change.parent = proposed_data.get("parent")
    change.assignee = proposed_data.get("assignee")
    change.description_html = proposed_data.get("description_html")
    change.acceptance_criteria_html = proposed_data.get("acceptance_criteria_html")
    change.updated_by = actor
    change.save()
    change.proposed_reviewers.set(proposed_data.get("reviewers", []))
    _sync_change_attachments(change, proposed_data.get("attachment_ids", []), actor)
    change = (
        RequirementChange.objects.select_related("requirement", "module", "parent", "assignee")
        .prefetch_related("proposed_reviewers", "change_attachments__asset")
        .get(pk=change.pk)
    )
    change.proposal_snapshot = capture_change_snapshot(change)
    change.updated_by = actor
    change.save(update_fields=["proposal_snapshot", "updated_by", "updated_at"])

    if requirement.current_version == 0:
        requirement.name = change.name
        requirement.priority = change.priority
        requirement.module = change.module
        requirement.parent = change.parent
        requirement.assignee = change.assignee
        requirement.description_html = change.description_html
        requirement.acceptance_criteria_html = change.acceptance_criteria_html
        requirement.status = Requirement.Status.DRAFT
        requirement.updated_by = actor
        requirement.save()
        requirement.reviewers.set(change.proposed_reviewers.all())
        _sync_current_attachments(
            requirement,
            change.change_attachments.values_list("asset_id", flat=True),
            actor,
        )
    return change


@transaction.atomic
def submit_requirement_change(change_id, actor):
    change = (
        RequirementChange.objects.select_for_update(of=("self",))
        .select_related("requirement", "requirement__product", "requirement__product__workspace", "assignee")
        .prefetch_related("proposed_reviewers")
        .get(pk=change_id)
    )
    requirement = Requirement.objects.select_for_update().select_related("product", "product__workspace").get(
        pk=change.requirement_id
    )
    if change.status != RequirementChangeStatus.DRAFT:
        raise RequirementReviewError("REQUIREMENT_SUBMIT_CLOSED", "只有草稿修订可以提交评审。")
    if not can_edit_requirement_draft(change, actor):
        raise RequirementReviewError("REQUIREMENT_DRAFT_EDIT_FORBIDDEN", "你没有提交该草稿的权限。")
    if requirement.archived_at is not None or requirement.status == Requirement.Status.CLOSED:
        raise RequirementReviewError("REQUIREMENT_TERMINAL_READ_ONLY", "当前需求不可提交评审。")
    proposed_reviewer_ids = list(change.proposed_reviewers.values_list("id", flat=True))
    if not proposed_reviewer_ids:
        raise RequirementReviewError("REQUIREMENT_REVIEWERS_REQUIRED", "需求至少需要一名评审人。")
    participant_ids = set(proposed_reviewer_ids)
    if change.assignee_id:
        participant_ids.add(change.assignee_id)
    if set(_eligible_user_ids(requirement.product, participant_ids)) != participant_ids:
        raise RequirementReviewError(
            "REQUIREMENT_PARTICIPANTS_INVALID",
            "需求负责人或评审人已失去产品访问权限。",
        )

    if requirement.content_mode == Requirement.ContentMode.STRUCTURED:
        try:
            revision = change.structured_revision
        except ObjectDoesNotExist as exc:
            raise RequirementReviewError(
                "STRUCTURED_REVISION_REQUIRED",
                "结构化需求缺少可评审的数据修订。",
            ) from exc
        try:
            lock_revision_for_review(revision, actor)
        except RequirementStructureError as exc:
            raise RequirementReviewError(exc.code, exc.message) from exc
        change = (
            RequirementChange.objects.select_related("requirement", "structured_revision", "module", "parent", "assignee")
            .prefetch_related("proposed_reviewers", "change_attachments__asset")
            .get(pk=change.pk)
        )
        change.proposal_snapshot = capture_change_snapshot(change)
        change.save(update_fields=["proposal_snapshot", "updated_at"])

    current_reviewer_ids = list(requirement.reviewers.values_list("id", flat=True))
    approver_ids = _eligible_user_ids(requirement.product, current_reviewer_ids)
    if change.kind == RequirementChangeKind.INITIAL or not approver_ids:
        approver_ids = proposed_reviewer_ids
    RequirementChangeReviewer.objects.filter(change=change).delete()
    RequirementChangeReviewer.objects.bulk_create(
        [
            RequirementChangeReviewer(change=change, reviewer_id=reviewer_id, created_by=actor)
            for reviewer_id in approver_ids
        ],
        batch_size=100,
        ignore_conflicts=True,
    )
    from_status = requirement.status
    change.status = RequirementChangeStatus.PENDING
    change.updated_by = actor
    change.save(update_fields=["status", "updated_by", "updated_at"])
    if requirement.current_version == 0:
        requirement.status = Requirement.Status.IN_REVIEW
        requirement.updated_by = actor
        requirement.save(update_fields=["status", "updated_by", "updated_at"])
    _record_lifecycle_event(
        requirement,
        RequirementLifecycleAction.SUBMITTED,
        actor,
        change=change,
        from_status=from_status,
        to_status=requirement.status,
    )
    _send_notifications(
        change,
        "reset" if change.kind == RequirementChangeKind.SYSTEM_RESET else "requested",
        approver_ids,
        actor,
    )
    return change


@transaction.atomic
def withdraw_requirement_change(change_id, actor):
    change = (
        RequirementChange.objects.select_for_update(of=("self",))
        .select_related("requirement", "requirement__product", "requirement__product__workspace", "module", "parent", "assignee")
        .prefetch_related("proposed_reviewers", "change_attachments")
        .get(pk=change_id)
    )
    if change.status != RequirementChangeStatus.PENDING:
        raise RequirementReviewError("REQUIREMENT_WITHDRAW_CLOSED", "只有评审中的修订可以撤回。")
    if not can_edit_requirement_draft(change, actor):
        raise RequirementReviewError("REQUIREMENT_DRAFT_EDIT_FORBIDDEN", "你没有撤回该评审的权限。")
    requirement = change.requirement
    proposed_data = proposal_data_from_change(change)
    if requirement.content_mode == Requirement.ContentMode.STRUCTURED:
        try:
            proposed_data["source_structured_revision"] = change.structured_revision
        except ObjectDoesNotExist:
            pass
    from_status = requirement.status
    change.status = RequirementChangeStatus.CANCELLED
    change.completed_at = timezone.now()
    change.updated_by = actor
    change.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])
    if requirement.current_version == 0:
        requirement.status = Requirement.Status.DRAFT
        requirement.updated_by = actor
        requirement.save(update_fields=["status", "updated_by", "updated_at"])
    _record_lifecycle_event(
        requirement,
        RequirementLifecycleAction.WITHDRAWN,
        actor,
        change=change,
        from_status=from_status,
        to_status=requirement.status,
    )
    _send_requirement_lifecycle_notifications(requirement, "withdrawn", actor, change)
    return create_requirement_change(
        requirement,
        proposed_data,
        actor,
        kind=change.kind,
        submit_for_review=False,
    )


@transaction.atomic
def discard_requirement_draft(change_id, actor):
    change = (
        RequirementChange.objects.select_for_update(of=("self",))
        .select_related("requirement", "requirement__product", "requirement__product__workspace")
        .get(pk=change_id)
    )
    if change.status != RequirementChangeStatus.DRAFT:
        raise RequirementReviewError("REQUIREMENT_DRAFT_DISCARD_CLOSED", "只有草稿修订可以放弃。")
    if not can_edit_requirement_draft(change, actor):
        raise RequirementReviewError("REQUIREMENT_DRAFT_EDIT_FORBIDDEN", "你没有放弃该草稿的权限。")
    requirement = change.requirement
    if requirement.current_version == 0:
        raise RequirementReviewError("REQUIREMENT_INITIAL_DRAFT_DELETE_REQUIRED", "初始草稿请直接删除需求。")
    change.status = RequirementChangeStatus.CANCELLED
    change.completed_at = timezone.now()
    change.updated_by = actor
    change.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])
    _record_lifecycle_event(
        requirement,
        RequirementLifecycleAction.DRAFT_DISCARDED,
        actor,
        change=change,
        from_status=requirement.status,
        to_status=requirement.status,
    )
    _send_requirement_lifecycle_notifications(requirement, "discarded", actor, change)
    return requirement


@transaction.atomic
def transition_requirement_lifecycle(requirement_id, actor, action, reason_code="", note=""):
    requirement = (
        Requirement.objects.select_for_update(of=("self",))
        .select_related("product", "product__workspace", "assignee")
        .prefetch_related("reviewers")
        .get(pk=requirement_id)
    )
    if not can_manage_requirement_lifecycle(requirement, actor):
        raise RequirementReviewError("REQUIREMENT_LIFECYCLE_FORBIDDEN", "你没有执行该状态操作的权限。")
    if requirement.archived_at is not None:
        raise RequirementReviewError("REQUIREMENT_ARCHIVED_READ_ONLY", "请先恢复归档需求。")
    note = str(note or "").strip()
    reason_code = str(reason_code or "").strip()
    from_status = requirement.status
    if action == RequirementLifecycleAction.CLOSED:
        if requirement.status != Requirement.Status.PUBLISHED or requirement.current_version == 0:
            raise RequirementReviewError("REQUIREMENT_CLOSE_REQUIRES_PUBLISHED", "只有已发布需求可以关闭。")
        if requirement.changes.filter(
            status__in=[RequirementChangeStatus.DRAFT, RequirementChangeStatus.PENDING]
        ).exists():
            raise RequirementReviewError(
                "REQUIREMENT_OPEN_CHANGE_BLOCKS_TRANSITION",
                "请先处理草稿或评审中的修订。",
            )
        valid_reasons = {choice for choice, _label in Requirement.CloseReason.choices}
        if reason_code not in valid_reasons:
            raise RequirementReviewError("REQUIREMENT_CLOSE_REASON_REQUIRED", "请选择有效的关闭原因。")
        if reason_code == Requirement.CloseReason.OTHER and not note:
            raise RequirementReviewError("REQUIREMENT_CLOSE_NOTE_REQUIRED", "选择其他原因时必须填写说明。")
        requirement.status = Requirement.Status.CLOSED
        requirement.closed_at = timezone.now()
        requirement.closed_by = actor
        requirement.closed_reason_code = reason_code
        requirement.closed_note = note
        event_name = "closed"
    elif action == RequirementLifecycleAction.REOPENED:
        if requirement.status != Requirement.Status.CLOSED:
            raise RequirementReviewError("REQUIREMENT_REOPEN_INVALID_STATUS", "只有已关闭的需求可以重新打开。")
        if not note:
            raise RequirementReviewError("REQUIREMENT_REOPEN_REASON_REQUIRED", "重新打开时必须填写原因。")
        requirement.status = Requirement.Status.PUBLISHED
        requirement.closed_at = None
        requirement.closed_by = None
        requirement.closed_reason_code = ""
        requirement.closed_note = ""
        event_name = "reopened"
    else:
        raise RequirementReviewError("REQUIREMENT_LIFECYCLE_ACTION_INVALID", "不支持的需求状态操作。")

    requirement.updated_by = actor
    requirement.save()
    _record_lifecycle_event(
        requirement,
        action,
        actor,
        from_status=from_status,
        to_status=requirement.status,
        reason_code=reason_code,
        note=note,
    )
    _send_requirement_lifecycle_notifications(requirement, event_name, actor)
    return requirement


def _unarchived_descendant_ids(requirement):
    visited_ids = {requirement.id}
    unarchived_ids = set()
    frontier = {requirement.id}
    while frontier:
        children = list(
            Requirement.objects.filter(
                product_id=requirement.product_id,
                parent_id__in=frontier,
            ).values_list("id", "archived_at")
        )
        child_ids = {child_id for child_id, _archived_at in children} - visited_ids
        if not child_ids:
            break
        visited_ids.update(child_ids)
        unarchived_ids.update(
            child_id for child_id, archived_at in children if child_id in child_ids and archived_at is None
        )
        frontier = child_ids
    return unarchived_ids


def _has_archived_ancestor(requirement):
    parent_id = requirement.parent_id
    visited_ids = {requirement.id}
    while parent_id and parent_id not in visited_ids:
        visited_ids.add(parent_id)
        ancestor = Requirement.objects.filter(
            id=parent_id,
            product_id=requirement.product_id,
        ).values("parent_id", "archived_at").first()
        if ancestor is None:
            return False
        if ancestor["archived_at"] is not None:
            return True
        parent_id = ancestor["parent_id"]
    return False


@transaction.atomic
def set_requirement_archived(requirement_id, actor, archived):
    requirement = (
        Requirement.objects.select_for_update(of=("self",))
        .select_related("product", "product__workspace", "assignee")
        .prefetch_related("reviewers")
        .get(pk=requirement_id)
    )
    if not can_manage_requirement_lifecycle(requirement, actor):
        raise RequirementReviewError("REQUIREMENT_LIFECYCLE_FORBIDDEN", "你没有执行归档操作的权限。")
    if archived:
        if requirement.archived_at is not None:
            return requirement
        if requirement.status != Requirement.Status.CLOSED:
            raise RequirementReviewError("REQUIREMENT_ARCHIVE_STATUS_INVALID", "只有已关闭的需求可以归档。")
        descendant_ids = _unarchived_descendant_ids(requirement)
        if descendant_ids:
            raise RequirementReviewError(
                "REQUIREMENT_ARCHIVE_DESCENDANTS_EXIST",
                f"仍有 {len(descendant_ids)} 个未归档后代需求，请先处理后再归档。",
            )
        requirement.archived_at = timezone.now()
        requirement.archived_by = actor
        action = RequirementLifecycleAction.ARCHIVED
        event_name = "archived"
    else:
        if requirement.archived_at is None:
            return requirement
        if _has_archived_ancestor(requirement):
            raise RequirementReviewError(
                "REQUIREMENT_RESTORE_ANCESTOR_ARCHIVED",
                "请先恢复该需求的已归档上级需求。",
            )
        requirement.archived_at = None
        requirement.archived_by = None
        action = RequirementLifecycleAction.RESTORED
        event_name = "restored"
    requirement.updated_by = actor
    requirement.save(update_fields=["archived_at", "archived_by", "updated_by", "updated_at"])
    _record_lifecycle_event(
        requirement,
        action,
        actor,
        from_status=requirement.status,
        to_status=requirement.status,
    )
    _send_requirement_lifecycle_notifications(requirement, event_name, actor)
    return requirement


@transaction.atomic
def submit_requirement_review(change_id, reviewer, opinion, reason=""):
    reason = str(reason or "").strip()
    try:
        change = (
            RequirementChange.objects.select_for_update(of=("self",))
            .select_related(
                "requirement",
                "requirement__product",
                "requirement__product__workspace",
                "assignee",
            )
            .prefetch_related("proposed_reviewers")
            .get(pk=change_id)
        )
    except RequirementChange.DoesNotExist as exc:
        raise RequirementReviewError("REQUIREMENT_CHANGE_NOT_FOUND", "需求变更不存在。") from exc
    if change.status != RequirementChangeStatus.PENDING:
        raise RequirementReviewError("REQUIREMENT_REVIEW_CLOSED", "该轮评审已结束。")
    try:
        assignment = RequirementChangeReviewer.objects.select_for_update().get(
            change=change,
            reviewer=reviewer,
        )
    except RequirementChangeReviewer.DoesNotExist as exc:
        raise RequirementReviewError("REQUIREMENT_REVIEW_FORBIDDEN", "你不是该轮评审人。") from exc
    if assignment.latest_opinion in {
        RequirementReviewOpinion.APPROVED,
        RequirementReviewOpinion.REJECTED,
    }:
        raise RequirementReviewError("REQUIREMENT_REVIEW_ALREADY_FINAL", "你已经完成本轮评审。")
    if opinion == RequirementReviewOpinion.REJECTED and not reason:
        raise RequirementReviewError("REQUIREMENT_REJECT_REASON_REQUIRED", "拒绝需求时必须填写评审原因。")
    if opinion == RequirementReviewOpinion.APPROVED:
        participant_ids = set(change.proposed_reviewers.values_list("id", flat=True))
        if change.assignee_id:
            participant_ids.add(change.assignee_id)
        eligible_ids = set(_eligible_user_ids(change.requirement.product, participant_ids))
        if eligible_ids != participant_ids:
            raise RequirementReviewError(
                "REQUIREMENT_PARTICIPANTS_INVALID",
                "需求负责人或评审人已失去产品访问权限，请先调整产品成员后再评审。",
            )

    RequirementReviewRecord.objects.create(
        assignment=assignment,
        opinion=opinion,
        reason=reason,
        created_by=reviewer,
    )
    assignment.latest_opinion = opinion
    assignment.latest_reason = reason
    assignment.reviewed_at = timezone.now()
    assignment.updated_by = reviewer
    assignment.save(update_fields=["latest_opinion", "latest_reason", "reviewed_at", "updated_by", "updated_at"])

    requirement = Requirement.objects.select_for_update().get(pk=change.requirement_id)
    if requirement.archived_at is not None or requirement.status == Requirement.Status.CLOSED:
        raise RequirementReviewError("REQUIREMENT_TERMINAL_READ_ONLY", "当前需求不可继续评审。")
    if opinion == RequirementReviewOpinion.REJECTED:
        change.status = RequirementChangeStatus.REJECTED
        change.completed_at = timezone.now()
        change.updated_by = reviewer
        change.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])
        requirement.status = (
            Requirement.Status.REJECTED if requirement.current_version == 0 else Requirement.Status.PUBLISHED
        )
        requirement.updated_by = reviewer
        requirement.save(update_fields=["status", "updated_by", "updated_at"])
        _send_notifications(change, "rejected", [change.created_by_id], reviewer)
        return change

    if opinion == RequirementReviewOpinion.NEEDS_CLARIFICATION:
        _send_notifications(change, "clarification", [change.created_by_id], reviewer)
        return change

    all_approved = (
        not RequirementChangeReviewer.objects.filter(change=change)
        .exclude(latest_opinion=RequirementReviewOpinion.APPROVED)
        .exists()
    )
    if not all_approved:
        return change

    change = (
        RequirementChange.objects.select_related("module", "parent", "assignee")
        .prefetch_related("proposed_reviewers", "change_attachments__asset")
        .get(pk=change.pk)
    )
    if not change.proposed_reviewers.exists():
        raise RequirementReviewError("REQUIREMENT_REVIEWERS_REQUIRED", "需求至少需要一名评审人。")
    _apply_proposal_to_requirement(requirement, change, reviewer)
    _create_version(requirement, change, reviewer)
    change.status = RequirementChangeStatus.APPROVED
    change.completed_at = timezone.now()
    change.updated_by = reviewer
    change.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])
    _send_notifications(change, "approved", [change.created_by_id], reviewer)
    return change


def create_legacy_version(requirement, actor=None):
    snapshot = capture_requirement_snapshot(requirement)
    version = RequirementVersion.objects.create(
        requirement=requirement,
        version=1,
        snapshot=snapshot,
        source="legacy_migration",
        created_by=actor,
    )
    RequirementVersionAttachment.objects.bulk_create(
        [
            RequirementVersionAttachment(version=version, asset_id=asset_id, created_by=actor)
            for asset_id in requirement.requirement_attachments.values_list("asset_id", flat=True)
        ],
        batch_size=100,
        ignore_conflicts=True,
    )
    requirement.status = Requirement.Status.PUBLISHED
    requirement.current_version = 1
    requirement.save(update_fields=["status", "current_version", "updated_at"])
    return version
