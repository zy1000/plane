from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.workflow import WorkflowSerializer, WorkflowTransitionSerializer
from plane.app.views import BaseAPIView
from plane.db.models import Workflow, WorkflowTransition, WorkflowTransitionApproval


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

    def _with_approvers(self, serializer_data, transition):
        """在序列化数据中附加当前审批人 ID 列表。"""
        approver_ids = list(
            transition.approvals.filter(deleted_at__isnull=True).values_list("approver_id", flat=True)
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
            if approver_ids:
                self._build_approvals(transition, approver_ids)
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
            if approver_ids:
                self._build_approvals(transition, approver_ids)
        return Response(self._with_approvers(serializer.data, transition), status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, workflow_id):
        transition_id = request.data.get("id") or request.query_params.get("id")
        qs = self.get_workflow_queryset(project_id, workflow_id)
        if transition_id:
            qs = qs.filter(id=transition_id)
        qs.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
