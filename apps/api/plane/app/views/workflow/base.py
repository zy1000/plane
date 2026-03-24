from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.workflow import (
    IssueTransitionActionSerializer,
    IssueTransitionRecordListSerializer,
    WorkflowSerializer,
    WorkflowTransitionSerializer,
)
from plane.app.views import BaseAPIView
from plane.db.models import (
    IssueTransitionApprovalRecord,
    IssueTransitionRecord,
    TransitionRecordStatus,
    Workflow,
    WorkflowApproverTarget,
    WorkflowTransition,
    WorkflowTransitionApproval,
)
from plane.utils.workflow.transition import approve_transition_record

SPECIAL_APPROVER_PREFIX = "special:"
SPECIAL_APPROVER_ID_MAP = {
    f"{SPECIAL_APPROVER_PREFIX}{WorkflowApproverTarget.ASSIGNEES}": WorkflowApproverTarget.ASSIGNEES,
    f"{SPECIAL_APPROVER_PREFIX}{WorkflowApproverTarget.CREATED_BY}": WorkflowApproverTarget.CREATED_BY,
}


class WorkflowAPIView(BaseAPIView):
    model = Workflow
    serializer_class = WorkflowSerializer
    filterset_fields = {
        'issue_type_id': ['exact'],
        'id': ['exact'],
    }

    def get_project_queryset(self, project_id):
        return Workflow.objects.filter(project_id=project_id)

    def get(self, request, slug, project_id):
        workflows = self.filter_queryset(self.get_project_queryset(project_id))
        serializer = self.serializer_class(instance=workflows, many=True)
        return Response(serializer.data)

    def post(self, request, slug, project_id):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, project_id):
        self.filter_queryset(self.get_project_queryset(project_id)).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def put(self, request, slug, project_id):
        data = request.data.copy()
        workflow_id = data.pop('id')
        workflow = self.get_project_queryset(project_id).get(id=workflow_id)
        update_serializer = self.serializer_class(instance=workflow, data=data, partial=True)
        update_serializer.is_valid(raise_exception=True)
        update_serializer.save()
        return Response(update_serializer.data, status=status.HTTP_200_OK)


class WorkflowTransitionAPIView(BaseAPIView):
    serializer_class = WorkflowTransitionSerializer

    def get_workflow_queryset(self, project_id, workflow_id):
        return WorkflowTransition.objects.filter(
            project_id=project_id,
            workflow_id=workflow_id,
        )

    def _build_approvals(self, transition, approver_ids):
        """批量创建审批人记录，忽略已存在的重复项。"""
        WorkflowTransitionApproval.objects.bulk_create(
            [
                WorkflowTransitionApproval(transition=transition, approver_id=approver_id)
                for approver_id in approver_ids
            ],
            ignore_conflicts=True,
        )

    def _parse_approver_selections(self, approver_ids):
        static_approver_ids = []
        dynamic_approver_types = []

        for approver_id in approver_ids:
            if approver_id in SPECIAL_APPROVER_ID_MAP:
                approver_type = SPECIAL_APPROVER_ID_MAP[approver_id]
                if approver_type not in dynamic_approver_types:
                    dynamic_approver_types.append(approver_type)
                continue
            static_approver_ids.append(approver_id)

        return static_approver_ids, dynamic_approver_types

    def _with_approvers(self, serializer_data, transition):
        """在序列化数据中附加当前审批人 ID 列表。"""
        approver_ids = list(
            transition.approvals.filter(deleted_at__isnull=True).values_list("approver_id", flat=True)
        )
        approver_ids.extend(
            f"{SPECIAL_APPROVER_PREFIX}{approver_type}"
            for approver_type in (transition.dynamic_approver_types or [])
        )
        return {**serializer_data, "approver_ids": approver_ids}

    def get(self, request, slug, project_id, workflow_id):
        transitions = self.get_workflow_queryset(project_id, workflow_id).prefetch_related("approvals")
        serializer = self.serializer_class(instance=transitions, many=True)
        data = [self._with_approvers(item, transition) for item, transition in zip(serializer.data, transitions)]
        return Response(data)

    def post(self, request, slug, project_id, workflow_id):
        data = {**request.data, "workflow_id": str(workflow_id)}
        serializer = self.serializer_class(data=data)
        if serializer.is_valid():
            transition = serializer.save(project_id=project_id)
            approver_ids = request.data.get("approver_ids") or []
            static_approver_ids, dynamic_approver_types = self._parse_approver_selections(approver_ids)
            if static_approver_ids:
                self._build_approvals(transition, static_approver_ids)
            if transition.dynamic_approver_types != dynamic_approver_types:
                transition.dynamic_approver_types = dynamic_approver_types
                transition.save(update_fields=["dynamic_approver_types", "updated_at"])
            return Response(self._with_approvers(serializer.data, transition), status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, slug, project_id, workflow_id):
        data = request.data.copy()
        transition_id = data.pop("id")
        transition = self.get_workflow_queryset(project_id, workflow_id).get(id=transition_id)
        serializer = self.serializer_class(instance=transition, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # 若请求中包含 approver_ids，则全量替换审批人
        if "approver_ids" in request.data:
            transition.approvals.all().delete()
            approver_ids = request.data["approver_ids"] or []
            static_approver_ids, dynamic_approver_types = self._parse_approver_selections(approver_ids)
            if static_approver_ids:
                self._build_approvals(transition, static_approver_ids)
            transition.dynamic_approver_types = dynamic_approver_types
            transition.save(update_fields=["dynamic_approver_types", "updated_at"])
        return Response(self._with_approvers(serializer.data, transition), status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, workflow_id):
        transition_id = request.data.get("id") or request.query_params.get("id")
        qs = self.get_workflow_queryset(project_id, workflow_id)
        if transition_id:
            qs = qs.filter(id=transition_id)
        qs.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyApprovalsAPIView(BaseAPIView):
    """
    GET /workspaces/<slug>/projects/<project_id>/my-approvals/?tab=pending|processed
    返回当前用户在该项目下所有需要/已经审批的状态变更申请。
    同时在响应头中附带 X-Pending-Count。
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        tab = request.query_params.get("tab", "pending")
        issue_id = request.query_params.get("issue_id")
        user = request.user

        # 找出当前用户在该项目下有审批资格的 IssueTransitionApprovalRecord
        my_approval_qs = IssueTransitionApprovalRecord.objects.filter(
            approver=user,
            deleted_at__isnull=True,
            transition_record__issue__project_id=project_id,
            transition_record__issue__deleted_at__isnull=True,
        )

        if tab == "pending":
            my_approval_qs = my_approval_qs.filter(
                action__isnull=True,
                transition_record__status=TransitionRecordStatus.PENDING,
            )
        else:
            my_approval_qs = my_approval_qs.filter(action__isnull=False)

        if issue_id:
            my_approval_qs = my_approval_qs.filter(transition_record__issue_id=issue_id)

        record_ids = my_approval_qs.values_list("transition_record_id", flat=True)

        records = (
            IssueTransitionRecord.objects.filter(id__in=record_ids)
            .select_related(
                "issue",
                "from_state",
                "to_state",
                "transition",
            )
            .prefetch_related("approval_records__approver")
        )

        # 计算 pending 数量（用于红点）
        pending_count = IssueTransitionApprovalRecord.objects.filter(
            approver=user,
            deleted_at__isnull=True,
            action__isnull=True,
            transition_record__status=TransitionRecordStatus.PENDING,
            transition_record__issue__project_id=project_id,
            transition_record__issue__deleted_at__isnull=True,
        ).count()

        serializer = IssueTransitionRecordListSerializer(records, many=True)
        response = Response({"results": serializer.data, "pending_count": pending_count})
        response["X-Pending-Count"] = str(pending_count)
        return response


class IssueTransitionRecordsAPIView(BaseAPIView):
    """
    GET /workspaces/<slug>/projects/<project_id>/issues/<issue_id>/transition-records/
    返回该 issue 当前所有 pending 状态的审批记录，所有项目成员均可查看。
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        records = (
            IssueTransitionRecord.objects.filter(
                issue_id=issue_id,
                issue__project_id=project_id,
                issue__deleted_at__isnull=True,
                status=TransitionRecordStatus.PENDING,
            )
            .select_related("issue", "from_state", "to_state", "transition")
            .prefetch_related("approval_records__approver")
        )
        serializer = IssueTransitionRecordListSerializer(records, many=True)
        return Response(serializer.data)


class BatchIssueTransitionRecordsAPIView(BaseAPIView):
    """
    POST /workspaces/<slug>/projects/<project_id>/batch-transition-records/
    批量查询多个 issue 的 pending 审批记录，返回以 issue_id 为 key 的字典。
    Body: { "issue_ids": ["uuid1", "uuid2", ...] }
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])
        if not issue_ids:
            return Response({})

        records = (
            IssueTransitionRecord.objects.filter(
                issue_id__in=issue_ids,
                issue__project_id=project_id,
                issue__deleted_at__isnull=True,
                status=TransitionRecordStatus.PENDING,
            )
            .select_related("issue", "from_state", "to_state", "transition")
            .prefetch_related("approval_records__approver")
        )
        serializer = IssueTransitionRecordListSerializer(records, many=True)

        result: dict[str, list] = {str(iid): [] for iid in issue_ids}
        for item in serializer.data:
            iid = str(item["issue_id"])
            if iid in result:
                result[iid].append(item)

        return Response(result)


class TransitionRecordActionAPIView(BaseAPIView):
    """
    GET  /workspaces/<slug>/projects/<project_id>/transition-records/<record_id>/action/ - 获取单条审批记录
    POST /workspaces/<slug>/projects/<project_id>/transition-records/<record_id>/action/ - 提交审批动作
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, record_id):
        try:
            record = (
                IssueTransitionRecord.objects.filter(
                    pk=record_id,
                    issue__project_id=project_id,
                    issue__deleted_at__isnull=True,
                )
                .select_related("issue", "from_state", "to_state", "transition")
                .prefetch_related("approval_records__approver")
                .get()
            )
        except IssueTransitionRecord.DoesNotExist:
            return Response({"error": "审批记录不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response(IssueTransitionRecordListSerializer(record).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, record_id):
        serializer = IssueTransitionActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action = serializer.validated_data["action"]
        comment = serializer.validated_data.get("comment", "")

        success, error, record = approve_transition_record(
            record_id=record_id,
            approver=request.user,
            action=action,
            comment=comment,
        )

        if not success:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        record.refresh_from_db()
        return Response(
            IssueTransitionRecordListSerializer(record).data,
            status=status.HTTP_200_OK,
        )
