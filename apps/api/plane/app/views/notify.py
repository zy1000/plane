"""统一通知入口的接口：对象订阅人、通知对象、我的订阅、通知规则、邮件发送记录。

规则和发送逻辑在 ``plane/utils/notify/``。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    PermissionKey,
    allow_fine_permission,
    allow_project_member,
    allow_workspace_member,
    resolve_project_grant,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import NotifyMail, NotifySubscriber, Workspace
from plane.utils.exception_logger import log_exception
from plane.utils.notify.entities import resolve_entity
from plane.utils.notify.mailer import display_name, requeue
from plane.utils.notify.rule_settings import RULE_MODES, rules_payload, save_rule
from plane.utils.notify.rules import ROLE_LABELS, RULES, configurable_roles
from plane.utils.notify.subscriptions import (
    MY_SUBSCRIPTION_TYPES,
    SUBSCRIBER_MODES,
    add_subscribers,
    list_subscribers,
    mail_queryset,
    mail_stats,
    my_subscription_model,
    my_subscriptions,
    scope,
    subscribable_entity,
)

# 给别人加 / 改 / 移除订阅要有对象的编辑权限；自己订阅、取消订阅只要能进项目
EDIT_KEYS = {
    "release": PermissionKey.PROJECT_RELEASE_EDIT,
    "cycle": PermissionKey.PROJECT_CYCLE_EDIT,
    "project_stage": PermissionKey.PROJECT_STAGE_MANAGE,
    "test_plan": PermissionKey.PROJECT_TEST_PLAN_EDIT,
    "requirement": PermissionKey.PROJECT_REQUIREMENT_EDIT,
}
MAX_PAGE_SIZE = 100


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"error": message}, status=code)


def _can_manage(request, slug, project_id, entity_type):
    key = EDIT_KEYS.get(entity_type)
    return bool(key) and key.value in resolve_project_grant(request.user, slug, project_id).keys


def _page(request, default=20):
    try:
        page = max(int(request.query_params.get("page", 1)), 1)
        per_page = min(max(int(request.query_params.get("per_page", default)), 1), MAX_PAGE_SIZE)
    except (TypeError, ValueError):
        page, per_page = 1, default
    return page, per_page


class NotifySubscriberEndpoint(BaseAPIView):
    """项目内对象（发布、迭代等）的订阅人。"""

    @allow_project_member
    def get(self, request, slug, project_id):
        ctx = subscribable_entity(
            request.query_params.get("entity_type"), request.query_params.get("entity_id"), project_id
        )
        if ctx is None:
            return _error("Object not found.", status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "subscribers": list_subscribers(ctx.entity_type, ctx.entity_id),
                "can_manage": _can_manage(request, slug, project_id, ctx.entity_type),
            },
            status=status.HTTP_200_OK,
        )

    @allow_project_member
    def post(self, request, slug, project_id):
        ctx = subscribable_entity(request.data.get("entity_type"), request.data.get("entity_id"), project_id)
        if ctx is None:
            return _error("Object not found.", status.HTTP_404_NOT_FOUND)
        user_ids = [str(user_id) for user_id in request.data.get("subscriber_ids") or []]
        mode = request.data.get("mode") or SUBSCRIBER_MODES[1]
        if not user_ids or mode not in SUBSCRIBER_MODES:
            return _error("subscriber_ids and a valid mode are required.")
        only_self = user_ids == [str(request.user.id)]
        if not only_self and not _can_manage(request, slug, project_id, ctx.entity_type):
            return _error("You do not have permission to manage subscribers.", status.HTTP_403_FORBIDDEN)
        add_subscribers(ctx, user_ids, mode, members_only=not only_self)
        return Response({"subscribers": list_subscribers(ctx.entity_type, ctx.entity_id)}, status=status.HTTP_200_OK)


class NotifySubscriberDetailEndpoint(BaseAPIView):
    def _row(self, request, slug, project_id, pk):
        row = NotifySubscriber.objects.filter(pk=pk, project_id=project_id, workspace__slug=slug).first()
        if row is None:
            return None, _error("Subscriber not found.", status.HTTP_404_NOT_FOUND)
        own = str(row.subscriber_id) == str(request.user.id)
        if not own and not _can_manage(request, slug, project_id, row.entity_type):
            return None, _error("You do not have permission to manage subscribers.", status.HTTP_403_FORBIDDEN)
        return row, None

    @allow_project_member
    def patch(self, request, slug, project_id, pk):
        row, denied = self._row(request, slug, project_id, pk)
        if denied:
            return denied
        mode = request.data.get("mode")
        if mode not in SUBSCRIBER_MODES:
            return _error("A valid mode is required.")
        row.mode = mode
        row.save(update_fields=["mode", "updated_at"])
        return Response({"subscribers": list_subscribers(row.entity_type, row.entity_id)}, status=status.HTTP_200_OK)

    @allow_project_member
    def delete(self, request, slug, project_id, pk):
        row, denied = self._row(request, slug, project_id, pk)
        if denied:
            return denied
        entity_type, entity_id = row.entity_type, row.entity_id
        NotifySubscriber.objects.filter(pk=row.pk).delete()
        return Response({"subscribers": list_subscribers(entity_type, entity_id)}, status=status.HTTP_200_OK)


class NotifyScopeEndpoint(BaseAPIView):
    """详情页的「通知对象」：这个对象的邮件即时发给谁、进谁的每日摘要。"""

    @allow_project_member
    def get(self, request, slug, project_id):
        entity_type = request.query_params.get("entity_type")
        if entity_type not in ROLE_LABELS:
            return _error("Unsupported entity type.")
        ctx = resolve_entity(entity_type, request.query_params.get("entity_id"))
        if ctx is None or str(ctx.project_id) != str(project_id):
            return _error("Object not found.", status.HTTP_404_NOT_FOUND)
        return Response(scope(ctx), status=status.HTTP_200_OK)


class MyNotifySubscriptionEndpoint(BaseAPIView):
    """个人设置 › 我的订阅。"""

    @allow_workspace_member
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return _error("Workspace not found.", status.HTTP_404_NOT_FOUND)
        rows = my_subscriptions(workspace, request.user)
        counts = {kind: 0 for kind in MY_SUBSCRIPTION_TYPES}
        for row in rows:
            counts[row["type"]] = counts.get(row["type"], 0) + 1
        projects = sorted(
            {(row["project_id"], row["project_name"]) for row in rows if row["project_id"]}, key=lambda item: item[1]
        )

        kind = request.query_params.get("type")
        mode = request.query_params.get("mode")
        project_id = request.query_params.get("project_id")
        needle = (request.query_params.get("search") or "").strip().lower()
        if kind in MY_SUBSCRIPTION_TYPES:
            rows = [row for row in rows if row["type"] == kind]
        if mode in SUBSCRIBER_MODES:
            rows = [row for row in rows if row["mode"] == mode]
        if project_id:
            rows = [row for row in rows if row["project_id"] == project_id]
        if needle:
            rows = [row for row in rows if needle in f"{row['code']} {row['name']}".lower()]
        page, per_page = _page(request)
        start = (page - 1) * per_page
        return Response(
            {
                "counts": counts,
                "projects": [{"id": project_id, "name": name} for project_id, name in projects],
                "total": len(rows),
                "results": rows[start : start + per_page],
            },
            status=status.HTTP_200_OK,
        )


class MyNotifySubscriptionDetailEndpoint(BaseAPIView):
    def _row(self, request, slug, kind, pk):
        if kind not in MY_SUBSCRIPTION_TYPES:
            return None
        return my_subscription_model(kind).objects.filter(
            pk=pk, subscriber_id=request.user.id, workspace__slug=slug
        ).first()

    @allow_workspace_member
    def patch(self, request, slug, kind, pk):
        row = self._row(request, slug, kind, pk)
        if row is None:
            return _error("Subscription not found.", status.HTTP_404_NOT_FOUND)
        mode = request.data.get("mode")
        if mode not in SUBSCRIBER_MODES:
            return _error("A valid mode is required.")
        row.mode = mode
        row.save(update_fields=["mode", "updated_at"])
        return Response({"id": str(row.pk), "mode": row.mode}, status=status.HTTP_200_OK)

    @allow_workspace_member
    def delete(self, request, slug, kind, pk):
        row = self._row(request, slug, kind, pk)
        if row is None:
            return _error("Subscription not found.", status.HTTP_404_NOT_FOUND)
        my_subscription_model(kind).objects.filter(pk=row.pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotifyRuleEndpoint(BaseAPIView):
    """工作区设置 › 通知 › 通知规则：全部规则一次返回，页面按业务分组展示。"""

    @allow_fine_permission(PermissionKey.WORKSPACE_SETTINGS_EDIT, level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return _error("Workspace not found.", status.HTTP_404_NOT_FOUND)
        return Response(rules_payload(workspace.id), status=status.HTTP_200_OK)


class NotifyRuleDetailEndpoint(BaseAPIView):
    """改一条规则里各收件角色的方式。全部等于系统默认就是恢复默认（不留任何修改记录）。"""

    @allow_fine_permission(PermissionKey.WORKSPACE_SETTINGS_EDIT, level="WORKSPACE")
    def put(self, request, slug, event):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None or event not in RULES:
            return _error("Rule not found.", status.HTTP_404_NOT_FOUND)
        modes = request.data.get("roles")
        allowed = configurable_roles(event)
        if not isinstance(modes, dict) or any(
            role not in allowed or mode not in RULE_MODES for role, mode in modes.items()
        ):
            return _error("roles must map each configurable role to instant, digest or none.")
        return Response(save_rule(workspace.id, event, modes), status=status.HTTP_200_OK)


class NotifyMailEndpoint(BaseAPIView):
    """工作区设置 › 通知 › 发送记录。"""

    @allow_fine_permission(PermissionKey.WORKSPACE_SETTINGS_EDIT, level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return _error("Workspace not found.", status.HTTP_404_NOT_FOUND)
        mails = mail_queryset(
            workspace.id,
            status=request.query_params.get("status"),
            kind=request.query_params.get("kind"),
            time_range=request.query_params.get("range"),
            search=request.query_params.get("search"),
        )
        page, per_page = _page(request)
        start = (page - 1) * per_page
        results = [
            {
                "id": str(mail.id),
                "created_at": mail.created_at,
                "receiver_name": display_name(mail.receiver) if mail.receiver_id else "",
                "kind": mail.kind,
                "subject": mail.subject,
                "status": mail.status,
                "reason": mail.reason,
                "attempts": mail.attempts,
            }
            for mail in mails[start : start + per_page]
        ]
        return Response(
            {"stats": mail_stats(workspace.id), "total": mails.count(), "results": results},
            status=status.HTTP_200_OK,
        )


class NotifyMailResendEndpoint(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_SETTINGS_EDIT, level="WORKSPACE")
    def post(self, request, slug, pk):
        mail = NotifyMail.objects.filter(pk=pk, workspace__slug=slug, status=NotifyMail.Status.FAILED).first()
        if mail is None:
            return _error("Only failed mails can be resent.", status.HTTP_404_NOT_FOUND)
        requeue(mail)
        try:
            from plane.bgtasks.notify_task import flush_notify_mails

            flush_notify_mails.delay()
        except Exception as error:
            # 入队失败不影响结果：每分钟的定时任务也会把它发出去
            log_exception(error)
        return Response({"id": str(mail.id), "status": mail.status}, status=status.HTTP_200_OK)
