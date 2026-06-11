from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    ROLE,
    allow_permission,
    allow_fine_permission,
    PermissionKey,
)
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
    ProjectMember,
    ProjectRole,
    TransitionRecordStatus,
    Workflow,
    WorkflowApproverTarget,
    WorkflowPrincipalDimension,
    WorkflowPrincipalKind,
    WorkflowTransition,
    WorkflowTransitionPrincipal,
)
from plane.db.models.workflow import WorkflowTransitionRequiredField
from plane.utils.workflow.transition import approve_transition_record

SPECIAL_APPROVER_PREFIX = "special:"
SPECIAL_APPROVER_ID_MAP = {
    f"{SPECIAL_APPROVER_PREFIX}{WorkflowApproverTarget.ASSIGNEES}": WorkflowApproverTarget.ASSIGNEES,
    f"{SPECIAL_APPROVER_PREFIX}{WorkflowApproverTarget.CREATED_BY}": WorkflowApproverTarget.CREATED_BY,
}
ROLE_PRINCIPAL_PREFIX = "role:"
PRINCIPAL_DIMENSION_FIELD_MAP = {
    WorkflowPrincipalDimension.INITIATOR: "initiator_ids",
    WorkflowPrincipalDimension.ASSIGNEE: "assignee_ids",
    WorkflowPrincipalDimension.APPROVER: "approver_ids",
}


class WorkflowAPIView(BaseAPIView):
    model = Workflow
    serializer_class = WorkflowSerializer
    filterset_fields = {
        "issue_type_id": ["exact"],
        "id": ["exact"],
    }

    def get_project_queryset(self, project_id):
        return Workflow.objects.filter(project_id=project_id)

    @allow_fine_permission(PermissionKey.WORKFLOW_VIEW)
    def get(self, request, slug, project_id):
        workflows = self.filter_queryset(self.get_project_queryset(project_id))
        serializer = self.serializer_class(instance=workflows, many=True)
        return Response(serializer.data)

    @allow_fine_permission(PermissionKey.WORKFLOW_CREATE)
    def post(self, request, slug, project_id):
        serializer = self.serializer_class(
            data=request.data, context={"project_id": project_id}
        )
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.WORKFLOW_DELETE)
    def delete(self, request, slug, project_id):
        self.filter_queryset(self.get_project_queryset(project_id)).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(PermissionKey.WORKFLOW_EDIT)
    def put(self, request, slug, project_id):
        data = request.data.copy()
        workflow_id = data.pop("id")
        workflow = self.get_project_queryset(project_id).get(id=workflow_id)
        update_serializer = self.serializer_class(
            instance=workflow,
            data=data,
            partial=True,
            context={"project_id": project_id},
        )
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

    def _build_principals(
        self, transition, dimension, member_ids, role_ids, dynamic_targets
    ):
        """批量创建指定维度对象行（成员/角色/动态对象），忽略重复项。"""
        principals = [
            WorkflowTransitionPrincipal(
                transition=transition,
                dimension=dimension,
                kind=WorkflowPrincipalKind.MEMBER,
                member_id=member_id,
            )
            for member_id in member_ids
        ]
        principals.extend(
            WorkflowTransitionPrincipal(
                transition=transition,
                dimension=dimension,
                kind=WorkflowPrincipalKind.ROLE,
                role_id=role_id,
            )
            for role_id in role_ids
        )
        principals.extend(
            WorkflowTransitionPrincipal(
                transition=transition,
                dimension=dimension,
                kind=WorkflowPrincipalKind.DYNAMIC,
                dynamic_target=dynamic_target,
            )
            for dynamic_target in dynamic_targets
        )
        if principals:
            WorkflowTransitionPrincipal.objects.bulk_create(
                principals, ignore_conflicts=True
            )

    def _parse_principal_tokens(self, tokens):
        member_ids = []
        role_ids = []
        dynamic_targets = []

        for token in tokens:
            token = str(token)
            if token in SPECIAL_APPROVER_ID_MAP:
                dynamic_target = SPECIAL_APPROVER_ID_MAP[token]
                if dynamic_target not in dynamic_targets:
                    dynamic_targets.append(dynamic_target)
                continue
            if token.startswith(SPECIAL_APPROVER_PREFIX):
                raise ValueError(f"不支持的动态对象：{token}")
            if token.startswith(ROLE_PRINCIPAL_PREFIX):
                role_id = token[len(ROLE_PRINCIPAL_PREFIX):]
                if role_id and role_id not in role_ids:
                    role_ids.append(role_id)
                continue
            if token not in member_ids:
                member_ids.append(token)

        return member_ids, role_ids, dynamic_targets

    def _parse_and_validate_principal_tokens(self, project_id, dimension, tokens):
        member_ids, role_ids, dynamic_targets = self._parse_principal_tokens(tokens)

        if member_ids:
            member_qs = ProjectMember.objects.filter(
                project_id=project_id,
                member_id__in=member_ids,
                is_active=True,
                deleted_at__isnull=True,
            )
            if dimension == WorkflowPrincipalDimension.ASSIGNEE:
                member_qs = member_qs.filter(role__gte=15)
            valid_member_ids = {str(member_id) for member_id in member_qs.values_list("member_id", flat=True)}
            invalid_member_ids = set(member_ids) - valid_member_ids
            if invalid_member_ids:
                raise ValueError("成员不属于当前项目或不可用于该配置")

        if role_ids:
            valid_role_ids = {
                str(role_id)
                for role_id in ProjectRole.objects.filter(
                    project_id=project_id,
                    id__in=role_ids,
                    deleted_at__isnull=True,
                ).values_list("id", flat=True)
            }
            invalid_role_ids = set(role_ids) - valid_role_ids
            if invalid_role_ids:
                raise ValueError("角色不属于当前项目")

        return member_ids, role_ids, dynamic_targets

    def _save_principals(self, transition, dimension, tokens, replace=False):
        if replace:
            transition.principals.filter(dimension=dimension).delete()
        member_ids, role_ids, dynamic_targets = self._parse_and_validate_principal_tokens(
            project_id=transition.project_id,
            dimension=dimension,
            tokens=tokens or [],
        )
        self._build_principals(
            transition=transition,
            dimension=dimension,
            member_ids=member_ids,
            role_ids=role_ids,
            dynamic_targets=dynamic_targets,
        )

    def _with_principals(self, serializer_data, transition, dimension, field_name):
        """在序列化数据中附加指定维度 ID 列表（member/role/special 三类令牌）。"""
        principal_ids = []
        principals = transition.principals.filter(
            dimension=dimension,
            deleted_at__isnull=True,
        )
        for principal in principals:
            if principal.kind == WorkflowPrincipalKind.MEMBER and principal.member_id:
                principal_ids.append(str(principal.member_id))
            elif principal.kind == WorkflowPrincipalKind.ROLE and principal.role_id:
                principal_ids.append(f"{ROLE_PRINCIPAL_PREFIX}{principal.role_id}")
            elif (
                principal.kind == WorkflowPrincipalKind.DYNAMIC
                and principal.dynamic_target
            ):
                principal_ids.append(
                    f"{SPECIAL_APPROVER_PREFIX}{principal.dynamic_target}"
                )
        return {**serializer_data, field_name: principal_ids}

    def _with_required_field_ids(self, serializer_data, transition):
        """在序列化数据中附加当前必填字段 ID 列表。"""
        ids = list(
            transition.required_fields.filter(deleted_at__isnull=True).values_list(
                "extra_field_id", flat=True
            )
        )
        return {**serializer_data, "extra_field_ids": [str(i) for i in ids]}

    def _enrich(self, serializer_data, transition):
        """附加发起人/目标负责人/审批人/必填字段，统一在一处调用。"""
        data = serializer_data
        for dimension, field_name in PRINCIPAL_DIMENSION_FIELD_MAP.items():
            data = self._with_principals(data, transition, dimension, field_name)
        return self._with_required_field_ids(data, transition)

    @allow_fine_permission(PermissionKey.WORKFLOW_VIEW)
    def get(self, request, slug, project_id, workflow_id):
        transitions = self.get_workflow_queryset(
            project_id, workflow_id
        ).prefetch_related("principals", "required_fields")
        serializer = self.serializer_class(instance=transitions, many=True)
        data = [
            self._enrich(item, transition)
            for item, transition in zip(serializer.data, transitions)
        ]
        return Response(data)

    @allow_fine_permission(PermissionKey.WORKFLOW_CONFIG)
    def post(self, request, slug, project_id, workflow_id):
        data = {**request.data, "workflow_id": str(workflow_id)}
        serializer = self.serializer_class(
            data=data, context={"project_id": project_id}
        )
        if serializer.is_valid():
            try:
                for dimension, field_name in PRINCIPAL_DIMENSION_FIELD_MAP.items():
                    if field_name in request.data:
                        self._parse_and_validate_principal_tokens(
                            project_id=project_id,
                            dimension=dimension,
                            tokens=request.data.get(field_name) or [],
                        )
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            transition = serializer.save(project_id=project_id)
            for dimension, field_name in PRINCIPAL_DIMENSION_FIELD_MAP.items():
                if field_name in request.data:
                    self._save_principals(
                        transition=transition,
                        dimension=dimension,
                        tokens=request.data.get(field_name) or [],
                    )
            # 判断是否有绑定自定义字段
            if extra_field_ids := request.data.get("extra_field_ids"):
                bulk_object = [
                    WorkflowTransitionRequiredField(
                        workflow=transition, extra_field_id=extra_field_id
                    )
                    for extra_field_id in extra_field_ids
                ]
                WorkflowTransitionRequiredField.objects.bulk_create(bulk_object)

            return Response(
                self._enrich(serializer.data, transition),
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.WORKFLOW_CONFIG)
    def put(self, request, slug, project_id, workflow_id):
        data = request.data.copy()
        transition_id = data.pop("id")
        extra_field_ids = data.pop("extra_field_ids", [])
        transition = self.get_workflow_queryset(project_id, workflow_id).get(
            id=transition_id
        )
        serializer = self.serializer_class(
            instance=transition,
            data=data,
            partial=True,
            context={"project_id": project_id},
        )
        serializer.is_valid(raise_exception=True)
        try:
            for dimension, field_name in PRINCIPAL_DIMENSION_FIELD_MAP.items():
                if field_name in request.data:
                    self._parse_and_validate_principal_tokens(
                        project_id=project_id,
                        dimension=dimension,
                        tokens=request.data.get(field_name) or [],
                    )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        # 若请求中包含维度字段，则按维度全量替换对象行
        for dimension, field_name in PRINCIPAL_DIMENSION_FIELD_MAP.items():
            if field_name in request.data:
                self._save_principals(
                    transition=transition,
                    dimension=dimension,
                    tokens=request.data.get(field_name) or [],
                    replace=True,
                )

        # 先清空之前的必须字段
        WorkflowTransitionRequiredField.objects.filter(workflow=transition).delete(
            soft=False
        )
        # 创建新的必须字段
        bulk_object = [
            WorkflowTransitionRequiredField(
                workflow=transition, extra_field_id=extra_field_id
            )
            for extra_field_id in extra_field_ids
        ]
        WorkflowTransitionRequiredField.objects.bulk_create(bulk_object)

        return Response(
            self._enrich(serializer.data, transition), status=status.HTTP_200_OK
        )

    @allow_fine_permission(PermissionKey.WORKFLOW_CONFIG)
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
        response = Response(
            {"results": serializer.data, "pending_count": pending_count}
        )
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


class WorkspaceBatchIssueTransitionRecordsAPIView(BaseAPIView):
    """
    POST /workspaces/<slug>/batch-transition-records/
    工作区级批量查询多个 issue 的 pending 审批记录（跨项目），返回以 issue_id 为 key 的字典。
    Body: { "issue_ids": ["uuid1", "uuid2", ...] }
    """

    def post(self, request, slug):
        issue_ids = request.data.get("issue_ids", [])
        if not issue_ids:
            return Response({})

        records = (
            IssueTransitionRecord.objects.filter(
                issue_id__in=issue_ids,
                issue__workspace__slug=slug,
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
            return Response(
                {"error": "审批记录不存在"}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(
            IssueTransitionRecordListSerializer(record).data, status=status.HTTP_200_OK
        )

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
