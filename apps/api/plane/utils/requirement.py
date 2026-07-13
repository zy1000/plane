from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from plane.app.permissions import can_view_product
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
    RequirementReviewOpinion,
    RequirementReviewRecord,
    RequirementVersion,
    RequirementVersionAttachment,
    WorkspaceMember,
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


def capture_requirement_snapshot(requirement):
    reviewers = list(requirement.reviewers.all().order_by("display_name", "id"))
    assets = [relation.asset for relation in requirement.requirement_attachments.all()]
    return {
        "name": requirement.name,
        "type": requirement.type,
        "priority": requirement.priority,
        "module": _module_snapshot(requirement.module),
        "parent": _parent_snapshot(requirement.parent),
        "assignee": _user_snapshot(requirement.assignee),
        "reviewers": [_user_snapshot(user) for user in reviewers],
        "description_html": requirement.description_html,
        "acceptance_criteria_html": requirement.acceptance_criteria_html,
        "attachments": [_asset_snapshot(asset) for asset in assets],
    }


def capture_change_snapshot(change):
    reviewers = list(change.proposed_reviewers.all().order_by("display_name", "id"))
    assets = [relation.asset for relation in change.change_attachments.all()]
    return {
        "name": change.name,
        "type": change.requirement.type,
        "priority": change.priority,
        "module": _module_snapshot(change.module),
        "parent": _parent_snapshot(change.parent),
        "assignee": _user_snapshot(change.assignee),
        "reviewers": [_user_snapshot(user) for user in reviewers],
        "description_html": change.description_html,
        "acceptance_criteria_html": change.acceptance_criteria_html,
        "attachments": [_asset_snapshot(asset) for asset in assets],
    }


def build_requirement_diff(from_snapshot, to_snapshot):
    from_snapshot = from_snapshot or {}
    to_snapshot = to_snapshot or {}
    labels = {
        "name": "需求名称",
        "type": "需求类型",
        "priority": "优先级",
        "module": "模块",
        "parent": "父需求",
        "assignee": "负责人",
        "reviewers": "评审人",
        "description_html": "需求描述",
        "acceptance_criteria_html": "验收标准",
        "attachments": "附件",
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


def _apply_proposal_to_requirement(requirement, change, actor):
    requirement.name = change.name
    requirement.priority = change.priority
    requirement.module = change.module
    requirement.parent = change.parent
    requirement.assignee = change.assignee
    requirement.description_html = change.description_html
    requirement.acceptance_criteria_html = change.acceptance_criteria_html
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
    requirement.status = Requirement.Status.ACTIVE
    requirement.save(update_fields=["current_version", "status", "updated_at"])
    return version


@transaction.atomic
def create_requirement_change(requirement, proposed_data, actor, kind=RequirementChangeKind.CHANGE):
    requirement = (
        Requirement.objects.select_for_update(of=("self",))
        .select_related("product", "product__workspace", "module", "parent", "assignee")
        .prefetch_related("reviewers", "requirement_attachments__asset")
        .get(pk=requirement.pk)
    )
    now = timezone.now()
    pending = (
        RequirementChange.objects.select_for_update()
        .filter(
            requirement=requirement,
            status=RequirementChangeStatus.PENDING,
        )
        .first()
    )
    if pending:
        pending.status = RequirementChangeStatus.SUPERSEDED
        pending.completed_at = now
        pending.updated_by = actor
        pending.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])

    max_sequence = (
        RequirementChange.all_objects.filter(requirement=requirement).aggregate(value=Max("sequence")).get("value") or 0
    )
    base_version = requirement.versions.filter(version=requirement.current_version).first()
    base_snapshot = capture_requirement_snapshot(requirement) if requirement.current_version else {}
    proposed_reviewers = list(proposed_data["reviewers"])
    proposed_reviewer_ids = [user.id for user in proposed_reviewers]
    current_reviewer_ids = list(requirement.reviewers.values_list("id", flat=True))
    approver_ids = _eligible_user_ids(requirement.product, current_reviewer_ids)
    if kind == RequirementChangeKind.INITIAL or not approver_ids:
        approver_ids = proposed_reviewer_ids

    change = RequirementChange.objects.create(
        requirement=requirement,
        sequence=max_sequence + 1,
        kind=kind,
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
    RequirementChangeReviewer.objects.bulk_create(
        [
            RequirementChangeReviewer(change=change, reviewer_id=reviewer_id, created_by=actor)
            for reviewer_id in approver_ids
        ],
        batch_size=100,
        ignore_conflicts=True,
    )
    change = (
        RequirementChange.objects.select_related("requirement", "module", "parent", "assignee")
        .prefetch_related("proposed_reviewers", "change_attachments__asset")
        .get(pk=change.pk)
    )
    change.proposal_snapshot = capture_change_snapshot(change)
    change.save(update_fields=["proposal_snapshot", "updated_at"])

    requirement.status = Requirement.Status.IN_REVIEW
    requirement.updated_by = actor
    if requirement.current_version == 0:
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

    _send_notifications(
        change,
        "reset" if kind == RequirementChangeKind.SYSTEM_RESET else "requested",
        approver_ids,
        actor,
    )
    return change


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
    if opinion == RequirementReviewOpinion.REJECTED:
        change.status = RequirementChangeStatus.REJECTED
        change.completed_at = timezone.now()
        change.updated_by = reviewer
        change.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])
        requirement.status = Requirement.Status.REJECTED
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
    requirement.status = Requirement.Status.ACTIVE
    requirement.current_version = 1
    requirement.save(update_fields=["status", "current_version", "updated_at"])
    return version
