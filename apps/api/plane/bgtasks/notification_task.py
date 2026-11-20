# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import uuid
from uuid import UUID


# Module imports
from plane.db.models import (
    IssueMention,
    IssueSubscriber,
    Project,
    User,
    IssueAssignee,
    Issue,
    Notification,
    IssueComment,
    IssueActivity,
    ProjectMember,
)
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception
from plane.utils.notify import emit
from plane.utils.notify.entities import resolve_entity
from django.db.models import Subquery

# Third Party imports
from celery import shared_task
from bs4 import BeautifulSoup


# =========== Issue Description Html Parsing and notification Functions ======================


def update_mentions_for_issue(issue, project, new_mentions, removed_mention):
    aggregated_issue_mentions = []
    for mention_id in new_mentions:
        aggregated_issue_mentions.append(
            IssueMention(
                mention_id=mention_id,
                issue=issue,
                project=project,
                workspace_id=project.workspace_id,
            )
        )

    IssueMention.objects.bulk_create(aggregated_issue_mentions, batch_size=100)
    IssueMention.objects.filter(issue=issue, mention__in=removed_mention).delete()


def get_new_mentions(requested_instance, current_instance):
    # requested_data is the newer instance of the current issue
    # current_instance is the older instance of the current issue, saved in the database

    # extract mentions from both the instance of data
    mentions_older = extract_mentions(current_instance)

    mentions_newer = extract_mentions(requested_instance)

    # Getting Set Difference from mentions_newer
    new_mentions = [mention for mention in mentions_newer if mention not in mentions_older]

    return new_mentions


# Get Removed Mention
def get_removed_mentions(requested_instance, current_instance):
    # requested_data is the newer instance of the current issue
    # current_instance is the older instance of the current issue, saved in the database

    # extract mentions from both the instance of data
    mentions_older = extract_mentions(current_instance)
    mentions_newer = extract_mentions(requested_instance)

    # Getting Set Difference from mentions_newer
    removed_mentions = [mention for mention in mentions_older if mention not in mentions_newer]

    return removed_mentions


# Parse Issue Description & extracts mentions
def extract_mentions(issue_instance):
    try:
        # issue_instance has to be a dictionary passed, containing the description_html and other set of activity data. # noqa: E501
        mentions = []
        # Convert string to dictionary
        data = json.loads(issue_instance)
        html = data.get("description_html")
        soup = BeautifulSoup(html, "html.parser")
        mention_tags = soup.find_all("mention-component", attrs={"entity_name": "user_mention"})

        mentions = [mention_tag["entity_identifier"] for mention_tag in mention_tags]

        return list(set(mentions))
    except Exception:
        return []


# =========== Comment Parsing and notification Functions ======================
def extract_comment_mentions(comment_value):
    try:
        mentions = []
        soup = BeautifulSoup(comment_value, "html.parser")
        mentions_tags = soup.find_all("mention-component", attrs={"entity_name": "user_mention"})
        for mention_tag in mentions_tags:
            mentions.append(mention_tag["entity_identifier"])
        return list(set(mentions))
    except Exception:
        return []


def get_new_comment_mentions(new_value, old_value):
    mentions_newer = extract_comment_mentions(new_value)
    if old_value is None:
        return mentions_newer

    mentions_older = extract_comment_mentions(old_value)
    # Getting Set Difference from mentions_newer
    new_mentions = [mention for mention in mentions_newer if mention not in mentions_older]

    return new_mentions


def create_mention_notification(project, notification_comment, issue, actor_id, mention_id, issue_id, activity):
    return Notification(
        workspace=project.workspace,
        sender="in_app:issue_activities:mentioned",
        triggered_by_id=actor_id,
        receiver_id=mention_id,
        entity_identifier=issue_id,
        entity_name="issue",
        project=project,
        message=notification_comment,
        data={
            "issue": {
                "id": str(issue_id),
                "name": str(issue.name),
                "identifier": str(issue.project.identifier),
                "sequence_id": issue.sequence_id,
                "state_name": issue.state.name,
                "state_group": issue.state.group,
            },
            "issue_activity": {
                "id": str(activity.get("id")),
                "verb": str(activity.get("verb")),
                "field": str(activity.get("field")),
                "actor": str(activity.get("actor_id")),
                "new_value": str(activity.get("new_value")),
                "old_value": str(activity.get("old_value")),
                "old_identifier": (str(activity.get("old_identifier")) if activity.get("old_identifier") else None),
                "new_identifier": (str(activity.get("new_identifier")) if activity.get("new_identifier") else None),
            },
        },
    )


# =========== 邮件：走统一通知入口 ======================

ISSUE_FIELD_LABELS = {
    "state": "状态",
    "priority": "优先级",
    "name": "标题",
    "target_date": "截止日期",
    "start_date": "开始日期",
    "labels": "标签",
    "parent": "父工作项",
    "assignees": "负责人",
    "link": "链接",
    "attachment": "附件",
    "cycles": "迭代",
    "modules": "模块",
    "releases": "发布",
    "estimate_point": "估算",
    "archived_at": "归档",
    "product": "产品",
    "product_module": "产品模块",
    "stage": "阶段",
    "test_plan": "测试计划",
    "extra_field": "自定义字段",
    "relates_to": "关联",
    "blocking": "阻塞",
    "blocked_by": "被阻塞",
    "duplicate": "重复",
}
PRIORITY_LABELS = {"urgent": "紧急", "high": "高", "medium": "中", "low": "低", "none": "无"}


def _plain(value):
    text = "" if value is None else str(value).strip()
    return "" if text in ("None", "null") else text


def _change_summary(activity):
    """一条活动 →「状态 进行中 → 待测试」这样的一句话。"""
    field = activity.get("field") or ""
    label = ISSUE_FIELD_LABELS.get(field, field)
    old, new = _plain(activity.get("old_value")), _plain(activity.get("new_value"))
    if field == "priority":
        old, new = PRIORITY_LABELS.get(old, old), PRIORITY_LABELS.get(new, new)
    if field == "comment":
        if activity.get("verb") == "deleted":
            return "删除了评论"
        text = BeautifulSoup(new, "html.parser").get_text(" ", strip=True)
        text = f"{text[:80]}…" if len(text) > 80 else text
        prefix = "新增评论" if activity.get("verb") == "created" else "修改了评论"
        return f"{prefix}：{text}" if text else prefix
    if old and new:
        return f"{label} {old} → {new}"
    if new:
        return f"{label} 新增 {new}"
    if old:
        return f"{label} 移除 {old}"
    return f"{label} 已更新"


def _emit_issue_events(issue_id, issue_activities, actor_id, actor, description_mentions, comment_mentions):
    """把这批活动报给统一通知入口：指派和提及即时发，其余变更进订阅人的每日摘要。"""
    ctx = resolve_entity("issue", issue_id)
    if ctx is None:
        return
    actor_name = actor.display_name or actor.email
    # 这里是后台任务，拿不到请求；操作时的访问地址由 issue_activity 存在 Redis 里（10 分钟），
    # 取不到也照发，链接退回到系统配置的站点地址
    stored_origin = redis_instance().get(str(issue_id))
    origin = stored_origin.decode() if stored_origin else ""
    for activity in issue_activities:
        field = activity.get("field")
        # 关系类活动会带出另一个工作项的记录；描述改动不通知；没有字段的是「创建 / 删除」本身
        if (activity.get("issue_detail") or {}).get("id") != issue_id or not field or field == "description":
            continue
        if field == "assignees" and activity.get("new_identifier"):
            emit(
                "issue.assigned",
                "issue",
                issue_id,
                actor_id=actor_id,
                summary=f"{actor_name} 将工作项指派给 {_plain(activity.get('new_value'))}",
                extra_roles={"new_assignee": [activity.get("new_identifier")]},
                origin=origin, context=ctx,
            )
        elif field == "comment":
            emit("issue.commented", "issue", issue_id, actor_id=actor_id, summary=_change_summary(activity), origin=origin, context=ctx)
        else:
            # 被移除的负责人已经不在对象上了，单独带上，让他知道自己不用再管
            removed = [activity.get("old_identifier")] if field == "assignees" and activity.get("old_identifier") else []
            emit(
                "issue.updated",
                "issue",
                issue_id,
                actor_id=actor_id,
                summary=_change_summary(activity),
                extra_roles={"assignee": list(ctx.roles.get("assignee") or []) + removed} if removed else None,
                origin=origin, context=ctx,
            )
    for mentioned, where in ((comment_mentions, "评论"), (description_mentions, "描述")):
        if mentioned:
            emit(
                "issue.mentioned",
                "issue",
                issue_id,
                actor_id=actor_id,
                summary=f"{actor_name} 在{where}中提及了你",
                extra_roles={"mentioned": list(set(mentioned))},
                origin=origin, context=ctx,
            )


@shared_task
def notifications(
    type,
    issue_id,
    project_id,
    actor_id,
    subscriber,
    issue_activities_created,
    requested_data,
    current_instance,
):
    try:
        issue_activities_created = (
            json.loads(issue_activities_created) if issue_activities_created is not None else None
        )
        if type not in [
            "cycle.activity.created",
            "cycle.activity.deleted",
            "module.activity.created",
            "module.activity.deleted",
            "issue_reaction.activity.created",
            "issue_reaction.activity.deleted",
            "comment_reaction.activity.created",
            "comment_reaction.activity.deleted",
            "issue_vote.activity.created",
            "issue_vote.activity.deleted",
            "issue_draft.activity.created",
            "issue_draft.activity.updated",
            "issue_draft.activity.deleted",
        ]:
            # Create Notifications
            bulk_notifications = []

            # get the list of active project members
            project_members = ProjectMember.objects.filter(project_id=project_id, is_active=True).values_list(
                "member_id", flat=True
            )

            # Get new mentions from the newer instance
            new_mentions = get_new_mentions(requested_instance=requested_data, current_instance=current_instance)
            new_mentions = list(set(new_mentions) & {str(member) for member in project_members})
            removed_mention = get_removed_mentions(requested_instance=requested_data, current_instance=current_instance)

            comment_mentions = []

            for issue_activity in issue_activities_created:
                issue_comment = issue_activity.get("issue_comment")
                issue_comment_new_value = issue_activity.get("new_value")
                issue_comment_old_value = issue_activity.get("old_value")
                if issue_comment is not None:
                    new_comment_mentions = get_new_comment_mentions(
                        old_value=issue_comment_old_value,
                        new_value=issue_comment_new_value,
                    )
                    comment_mentions = comment_mentions + new_comment_mentions
                    comment_mentions = [
                        mention for mention in comment_mentions if UUID(mention) in set(project_members)
                    ]

            """
            We will not send subscription activity notification to the below mentioned user sets
            - Those who have been newly mentioned in the issue description, we will send mention notification to them.
            - When the activity is a comment_created and there exist a mention in the comment, 
              then we have to send the "mention_in_comment" notification
            - When the activity is a comment_updated and there exist a mention change, 
              then also we have to send the "mention_in_comment" notification
            """

            # ---------------------------------------------------------------------------------------------------------
            issue_subscribers = list(
                IssueSubscriber.objects.filter(
                    project_id=project_id,
                    issue_id=issue_id,
                    subscriber__in=Subquery(project_members),
                )
                .exclude(subscriber_id__in=list(new_mentions + comment_mentions + [actor_id]))
                .values_list("subscriber", flat=True)
            )

            issue = Issue.objects.filter(pk=issue_id).first()

            # 订阅收紧：只有创建工作项时把创建人加为订阅人。之后操作过、被 @ 过都不再自动订阅，
            # 要关注就自己点「订阅」（负责人在指派时订阅、移除时取消，见 issue_activities_task.track_assignees）。
            if subscriber and type == "issue.activity.created":
                try:
                    _ = IssueSubscriber.objects.get_or_create(
                        project_id=project_id, issue_id=issue_id, subscriber_id=actor_id
                    )
                except Exception:
                    pass

            project = Project.objects.get(pk=project_id)

            issue_assignees = IssueAssignee.objects.filter(
                issue_id=issue_id,
                project_id=project_id,
                assignee__in=Subquery(project_members),
            ).values_list("assignee", flat=True)

            issue_subscribers = list(set(issue_subscribers) - {uuid.UUID(actor_id)})

            for subscriber in issue_subscribers:
                if issue.created_by_id and issue.created_by_id == subscriber:
                    sender = "in_app:issue_activities:created"
                elif subscriber in issue_assignees and issue.created_by_id not in issue_assignees:
                    sender = "in_app:issue_activities:assigned"
                else:
                    sender = "in_app:issue_activities:subscribed"

                for issue_activity in issue_activities_created:
                    # If activity done in blocking then blocked by email should not go
                    if issue_activity.get("issue_detail").get("id") != issue_id:
                        continue

                    # Do not send notification for description update
                    if issue_activity.get("field") == "description":
                        continue

                    # If activity is of issue comment fetch the comment
                    issue_comment = (
                        IssueComment.objects.filter(
                            id=issue_activity.get("issue_comment"),
                            issue_id=issue_id,
                            project_id=project_id,
                            workspace_id=project.workspace_id,
                        ).first()
                        if issue_activity.get("issue_comment")
                        else None
                    )

                    # Create in app notification
                    bulk_notifications.append(
                        Notification(
                            workspace=project.workspace,
                            sender=sender,
                            triggered_by_id=actor_id,
                            receiver_id=subscriber,
                            entity_identifier=issue_id,
                            entity_name="issue",
                            project=project,
                            title=issue_activity.get("comment"),
                            data={
                                "issue": {
                                    "id": str(issue_id),
                                    "name": str(issue.name),
                                    "identifier": str(issue.project.identifier),
                                    "sequence_id": issue.sequence_id,
                                    "state_name": issue.state.name,
                                    "state_group": issue.state.group,
                                },
                                "issue_activity": {
                                    "id": str(issue_activity.get("id")),
                                    "verb": str(issue_activity.get("verb")),
                                    "field": str(issue_activity.get("field")),
                                    "actor": str(issue_activity.get("actor_id")),
                                    "new_value": str(issue_activity.get("new_value")),
                                    "old_value": str(issue_activity.get("old_value")),
                                    "issue_comment": str(
                                        issue_comment.comment_stripped if issue_comment is not None else ""
                                    ),
                                    "old_identifier": (
                                        str(issue_activity.get("old_identifier"))
                                        if issue_activity.get("old_identifier")
                                        else None
                                    ),
                                    "new_identifier": (
                                        str(issue_activity.get("new_identifier"))
                                        if issue_activity.get("new_identifier")
                                        else None
                                    ),
                                },
                            },
                        )
                    )

            # -------------------------------------------------------------------------------------------------------- #

            last_activity = IssueActivity.objects.filter(issue_id=issue_id).order_by("-created_at").first()

            actor = User.objects.get(pk=actor_id)

            for mention_id in comment_mentions:
                if mention_id != actor_id:
                    for issue_activity in issue_activities_created:
                        notification = create_mention_notification(
                            project=project,
                            issue=issue,
                            notification_comment=f"{actor.display_name} has mentioned you in a comment in issue {issue.name}",  # noqa: E501
                            actor_id=actor_id,
                            mention_id=mention_id,
                            issue_id=issue_id,
                            activity=issue_activity,
                        )
                        bulk_notifications.append(notification)

            for mention_id in new_mentions:
                if mention_id != actor_id:
                    if (
                        last_activity is not None
                        and last_activity.field == "description"
                        and actor_id == str(last_activity.actor_id)
                    ):
                        bulk_notifications.append(
                            Notification(
                                workspace=project.workspace,
                                sender="in_app:issue_activities:mentioned",
                                triggered_by_id=actor_id,
                                receiver_id=mention_id,
                                entity_identifier=issue_id,
                                entity_name="issue",
                                project=project,
                                message=f"You have been mentioned in the issue {issue.name}",
                                data={
                                    "issue": {
                                        "id": str(issue_id),
                                        "name": str(issue.name),
                                        "identifier": str(issue.project.identifier),
                                        "sequence_id": issue.sequence_id,
                                        "state_name": issue.state.name,
                                        "state_group": issue.state.group,
                                        "project_id": str(issue.project.id),
                                        "workspace_slug": str(issue.project.workspace.slug),
                                    },
                                    "issue_activity": {
                                        "id": str(last_activity.id),
                                        "verb": str(last_activity.verb),
                                        "field": str(last_activity.field),
                                        "actor": str(last_activity.actor_id),
                                        "new_value": str(last_activity.new_value),
                                        "old_value": str(last_activity.old_value),
                                        "old_identifier": (
                                            str(last_activity.old_identifier) if last_activity.old_identifier else None
                                        ),
                                        "new_identifier": (
                                            str(last_activity.new_identifier) if last_activity.new_identifier else None
                                        ),
                                    },
                                },
                            )
                        )
                    else:
                        for issue_activity in issue_activities_created:
                            notification = create_mention_notification(
                                project=project,
                                issue=issue,
                                notification_comment=f"You have been mentioned in the issue {issue.name}",
                                actor_id=actor_id,
                                mention_id=mention_id,
                                issue_id=issue_id,
                                activity=issue_activity,
                            )
                            bulk_notifications.append(notification)

            # save new mentions for the particular issue and remove the mentions that has been deleted from the description # noqa: E501
            update_mentions_for_issue(
                issue=issue,
                project=project,
                new_mentions=new_mentions,
                removed_mention=removed_mention,
            )
            # Bulk create notifications
            Notification.objects.bulk_create(bulk_notifications, batch_size=100)

            # 邮件：统一通知入口负责找人、分档、合并，这里只报事件
            _emit_issue_events(issue_id, issue_activities_created, actor_id, actor, new_mentions, comment_mentions)
        return
    except Exception as e:
        log_exception(e)
        return
