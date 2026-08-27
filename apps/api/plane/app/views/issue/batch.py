import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.issue import IssueBatchUpdateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.app.views import BaseAPIView
from plane.db.models import (
    Issue,
    IssueTransitionRecord,
    RequirementIssue,
    State,
    TransitionRecordStatus,
    UserRecentVisit,
)
from plane.utils.host import base_host
from plane.utils.workflow.transition import (
    cancel_issue_pending_transitions,
    capture_issue_content_snapshot,
    check_added_assignee_constraint,
    check_update_state_permission,
    reset_pending_transition_votes_if_content_changed,
)


def _format_serializer_errors(errors):
    if isinstance(errors, dict):
        return "; ".join(f"{field}: {detail}" for field, detail in errors.items())
    return str(errors)


class IssueBatchUpdate(BaseAPIView):
    model = Issue
    queryset = Issue.objects.all()

    def post(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])
        properties = dict(request.data.get("properties", {}) or {})
        approval_reason = properties.pop("approval_reason", "")

        state_id = properties.get("state_id")
        has_assignee_update = "assignee_ids" in properties

        queryset = self.queryset.filter(project_id=project_id, id__in=issue_ids).select_related("state", "type")
        blocked = []
        updated_issue_ids = []
        to_state = None

        if state_id:
            try:
                to_state = State.objects.get(pk=state_id, project_id=project_id)
            except (State.DoesNotExist, DjangoValidationError, TypeError, ValueError):
                to_state = None

        for query in queryset:
            if state_id:
                if to_state is None:
                    blocked.append(
                        {
                            "issue_id": str(query.id),
                            "error": "目标状态不存在或不属于当前项目",
                            "transition_record_id": None,
                        }
                    )
                    continue
                if to_state.issue_type_id and str(to_state.issue_type_id) != str(query.type_id):
                    blocked.append(
                        {
                            "issue_id": str(query.id),
                            "error": "目标状态不适用于该工作项类型",
                            "transition_record_id": None,
                        }
                    )
                    continue

            # 工作流审批检查（批量更新中仅对实际变更状态的 issue 生效）
            if state_id and str(state_id) != str(query.state_id):
                allowed, error_msg, transition_record = check_update_state_permission(
                    issue=query,
                    to_state=to_state,
                    user=request.user,
                    project_id=project_id,
                    target_assignee_ids=properties.get("assignee_ids"),
                    approval_reason=approval_reason,
                )
                if not allowed:
                    blocked.append({
                        "issue_id": str(query.id),
                        "error": error_msg,
                        "transition_record_id": str(transition_record.id) if transition_record else None,
                    })
                    continue
            elif has_assignee_update and query.state_id:
                allowed, error_msg = check_added_assignee_constraint(
                    issue=query,
                    state=query.state,
                    desired_assignee_ids=properties.get("assignee_ids"),
                )
                if not allowed:
                    blocked.append(
                        {
                            "issue_id": str(query.id),
                            "error": error_msg,
                            "transition_record_id": None,
                        }
                    )
                    continue

            serializer = IssueBatchUpdateSerializer(instance=query, data=properties, partial=True)
            if not serializer.is_valid():
                blocked.append(
                    {
                        "issue_id": str(query.id),
                        "error": _format_serializer_errors(serializer.errors),
                        "transition_record_id": None,
                    }
                )
                continue

            if state_id and str(state_id) != str(query.state_id):
                cancel_issue_pending_transitions(
                    issue=query,
                    cancelled_by=request.user,
                    project_id=str(project_id),
                )
            # 评审期间内容变更检测：仅在存在 PENDING 审批时捕获快照
            approval_before_snapshot = None
            if IssueTransitionRecord.objects.filter(
                issue=query, status=TransitionRecordStatus.PENDING
            ).exists():
                approval_before_snapshot = capture_issue_content_snapshot(issue=query)

            serializer.save()

            if approval_before_snapshot is not None:
                query.refresh_from_db()
                reset_pending_transition_votes_if_content_changed(
                    issue=query,
                    before_snapshot=approval_before_snapshot,
                    actor=request.user,
                    project_id=str(project_id),
                )
            updated_issue_ids.append(str(query.id))

        if blocked:
            return Response(
                {
                    "workflow_blocked": True,
                    "blocked_issues": blocked,
                    "updated_issue_ids": updated_issue_ids,
                },
                status=status.HTTP_207_MULTI_STATUS,
            )
        return Response({"updated_issue_ids": updated_issue_ids}, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])
        # 先做作用域校验，只保留本 workspace/project 下真实存在的 id —— 与
        # base.py destroy 先取 scoped issue 的做法对齐。不能拿原始 issue_ids
        # 直接删关联行：跨项目 id 会越权删掉其他项目的需求关联；无效/过期 id
        # 会让下方删除循环中途 404，此时关联行已删而逐对重算还没跑到
        valid_ids = list(
            Issue.objects.filter(
                workspace__slug=slug, project_id=project_id, pk__in=issue_ids
            ).values_list("id", flat=True)
        )
        # 同步软删关联行，保证需求侧工作项计数准确 —— 不能等 Celery 级联清理
        RequirementIssue.objects.filter(issue_id__in=valid_ids).delete()
        for pk in valid_ids:
            issue = Issue.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
            issue.delete()
            # delete the issue from recent visits
            UserRecentVisit.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                entity_identifier=pk,
                entity_name="issue",
            ).delete(soft=False)
            issue_activity.delay(
                type="issue.activity.deleted",
                requested_data=json.dumps({"issue_id": str(pk)}),
                actor_id=str(request.user.id),
                issue_id=str(pk),
                project_id=str(project_id),
                current_instance={},
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
                subscriber=False,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
