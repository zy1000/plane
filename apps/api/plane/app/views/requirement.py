from uuid import UUID

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission, can_view_product
from plane.app.serializers.requirement import (
    RequirementChangeSerializer,
    RequirementCommentSerializer,
    RequirementDetailSerializer,
    RequirementLifecycleActionSerializer,
    RequirementLifecycleEventSerializer,
    RequirementListSerializer,
    RequirementModuleSerializer,
    RequirementReviewActionSerializer,
    RequirementVersionDetailSerializer,
    RequirementVersionListSerializer,
    RequirementWriteSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import (
    FileAsset,
    Product,
    Requirement,
    RequirementAttachment,
    RequirementChange,
    RequirementChangeAttachment,
    RequirementChangeKind,
    RequirementChangeReviewer,
    RequirementChangeStatus,
    RequirementComment,
    RequirementModule,
    RequirementLifecycleEvent,
    RequirementReviewOpinion,
    RequirementReviewRecord,
    RequirementVersion,
    RequirementVersionAttachment,
)
from plane.utils.paginator import CustomPaginator
from plane.utils.requirement import (
    RequirementReviewError,
    build_requirement_diff,
    create_requirement_change,
    discard_requirement_draft,
    notify_requirement_deleted,
    proposal_data_from_change,
    set_requirement_archived,
    submit_requirement_change,
    submit_requirement_review,
    transition_requirement_lifecycle,
    withdraw_requirement_change,
)


class ProductRequirementMixin:
    def get_product(self):
        product = (
            Product.objects.filter(
                id=self.kwargs.get("product_id"),
                workspace__slug=self.kwargs.get("slug"),
            )
            .select_related("workspace")
            .first()
        )
        if product is None or not can_view_product(self.request.user, product):
            return None
        return product


class RequirementViewSet(ProductRequirementMixin, BaseViewSet):
    serializer_class = RequirementListSerializer
    model = Requirement
    pagination_class = CustomPaginator
    requirement_type = Requirement.RequirementType.USER
    search_fields = ["name"]
    filterset_fields = {
        "priority": ["exact", "in"],
        "status": ["exact", "in"],
        "module": ["exact"],
        "assignee": ["exact"],
        "parent": ["exact"],
    }

    def get_change_queryset(self):
        record_queryset = RequirementReviewRecord.objects.select_related("assignment", "assignment__reviewer").order_by(
            "created_at"
        )
        assignment_queryset = (
            RequirementChangeReviewer.objects.select_related("reviewer")
            .prefetch_related(Prefetch("records", queryset=record_queryset))
            .order_by("created_at")
        )
        return (
            RequirementChange.objects.select_related(
                "requirement",
                "requirement__product",
                "requirement__product__workspace",
                "base_version",
                "module",
                "parent",
                "assignee",
                "created_by",
            )
            .prefetch_related(
                "proposed_reviewers",
                "change_attachments__asset",
                Prefetch("reviewer_assignments", queryset=assignment_queryset),
            )
            .filter(
                requirement__product_id=self.kwargs.get("product_id"),
                requirement__product__workspace__slug=self.kwargs.get("slug"),
                requirement__type=self.requirement_type,
                requirement__deleted_at__isnull=True,
            )
        )

    def get_queryset(self):
        changes = self.get_change_queryset().order_by("-sequence")
        open_changes = self.get_change_queryset().filter(
            status__in=[RequirementChangeStatus.DRAFT, RequirementChangeStatus.PENDING]
        )
        return (
            Requirement.objects.filter(
                product_id=self.kwargs.get("product_id"),
                product__workspace__slug=self.kwargs.get("slug"),
                type=self.requirement_type,
            )
            .select_related(
                "product",
                "product__workspace",
                "module",
                "parent",
                "assignee",
                "created_by",
                "updated_by",
                "closed_by",
                "archived_by",
            )
            .prefetch_related(
                "reviewers",
                "requirement_attachments__asset",
                Prefetch("changes", queryset=changes, to_attr="prefetched_changes"),
                Prefetch(
                    "changes",
                    queryset=open_changes,
                    to_attr="prefetched_open_changes",
                ),
            )
            .annotate(
                attachment_count=Count(
                    "requirement_attachments",
                    filter=Q(requirement_attachments__deleted_at__isnull=True),
                    distinct=True,
                ),
                sub_requirements_count=Count(
                    "sub_requirements",
                    filter=Q(sub_requirements__deleted_at__isnull=True),
                    distinct=True,
                ),
            )
            .order_by("-created_at")
        )

    def get_requirement(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    def get_change(self, requirement_id, change_id):
        return (
            self.get_change_queryset()
            .filter(
                requirement_id=requirement_id,
                id=change_id,
            )
            .first()
        )

    def write_context(self, product, **extra):
        return {
            "request": self.request,
            "product": product,
            "requirement_type": self.requirement_type,
            **extra,
        }

    def error_response(self, exc):
        response_status = (
            status.HTTP_403_FORBIDDEN
            if exc.code in {
                "REQUIREMENT_REVIEW_FORBIDDEN",
                "REQUIREMENT_DRAFT_EDIT_FORBIDDEN",
                "REQUIREMENT_LIFECYCLE_FORBIDDEN",
            }
            else status.HTTP_409_CONFLICT
        )
        return Response({"error": exc.message, "code": exc.code}, status=response_status)

    def parse_write_payload(self, request, default_submit=True):
        payload = request.data.copy()
        submit_for_review = payload.pop("submit_for_review", default_submit)
        if isinstance(submit_for_review, list):
            submit_for_review = submit_for_review[0] if submit_for_review else default_submit
        if isinstance(submit_for_review, str):
            submit_for_review = submit_for_review.lower() not in {"false", "0", "no"}
        return payload, bool(submit_for_review)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, product_id):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        archived = request.query_params.get("archived", "false").lower() == "true"
        base_queryset = self.get_queryset().filter(archived_at__isnull=not archived)
        change_status = request.query_params.get("change_status")
        if change_status in {RequirementChangeStatus.DRAFT, RequirementChangeStatus.PENDING}:
            base_queryset = base_queryset.filter(changes__status=change_status).distinct()
        elif change_status == "none":
            base_queryset = base_queryset.exclude(
                changes__status__in=[RequirementChangeStatus.DRAFT, RequirementChangeStatus.PENDING]
            )
        queryset = self.filter_queryset(base_queryset)
        facet_queryset = self.get_queryset().filter(archived_at__isnull=not archived)
        search = request.query_params.get("search", "").strip()
        if search:
            facet_queryset = facet_queryset.filter(name__icontains=search)
        for field in ["priority", "module", "assignee", "parent"]:
            value = request.query_params.get(field)
            if value:
                facet_queryset = facet_queryset.filter(**{field: value})
        if change_status in {RequirementChangeStatus.DRAFT, RequirementChangeStatus.PENDING}:
            facet_queryset = facet_queryset.filter(changes__status=change_status).distinct()
        elif change_status == "none":
            facet_queryset = facet_queryset.exclude(
                changes__status__in=[RequirementChangeStatus.DRAFT, RequirementChangeStatus.PENDING]
            )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request)
        return Response(
            {
                "count": queryset.count(),
                "status_counts": {
                    choice: facet_queryset.filter(status=choice).count() for choice, _label in Requirement.Status.choices
                },
                "archived_count": self.get_queryset().filter(archived_at__isnull=False).count(),
                "data": RequirementListSerializer(
                    page,
                    many=True,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, product_id, pk):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        requirement = self.get_requirement(pk)
        if requirement is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            RequirementDetailSerializer(requirement, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create(self, request, slug, product_id):
        product = self.get_product()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        payload, submit_for_review = self.parse_write_payload(request)
        serializer = RequirementWriteSerializer(
            data=payload,
            context=self.write_context(product, submit_for_review=submit_for_review),
        )
        serializer.is_valid(raise_exception=True)
        try:
            requirement = serializer.save()
        except RequirementReviewError as exc:
            return self.error_response(exc)
        return Response(
            RequirementDetailSerializer(
                self.get_requirement(requirement.id),
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, product_id, pk):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        if self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "error": "需求创建后不可直接编辑，请发起需求变更。",
                "code": "REQUIREMENT_CHANGE_REQUIRED",
            },
            status=status.HTTP_409_CONFLICT,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create_change(self, request, slug, product_id, pk):
        product = self.get_product()
        requirement = self.get_requirement(pk)
        if product is None or requirement is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        payload, submit_for_review = self.parse_write_payload(request)
        serializer = RequirementWriteSerializer(
            requirement,
            data=payload,
            partial=True,
            context=self.write_context(product, submit_for_review=submit_for_review),
        )
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except RequirementReviewError as exc:
            return self.error_response(exc)
        change = self.get_change(pk, serializer.change.id)
        return Response(
            RequirementChangeSerializer(change, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def changes(self, request, slug, product_id, pk):
        if self.get_product() is None or self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        queryset = self.get_change_queryset().filter(requirement_id=pk).order_by("-sequence")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request)
        return Response(
            {
                "count": queryset.count(),
                "data": RequirementChangeSerializer(
                    page,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def change_detail(self, request, slug, product_id, pk, change_id):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        change = self.get_change(pk, change_id)
        if change is None:
            return Response({"error": "Requirement change not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RequirementChangeSerializer(change, context={"request": request}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def update_change(self, request, slug, product_id, pk, change_id):
        product = self.get_product()
        requirement = self.get_requirement(pk)
        change = self.get_change(pk, change_id)
        if product is None or requirement is None or change is None:
            return Response({"error": "Requirement change not found."}, status=status.HTTP_404_NOT_FOUND)
        payload, submit_for_review = self.parse_write_payload(request, default_submit=False)
        serializer = RequirementWriteSerializer(
            requirement,
            data=payload,
            partial=True,
            context=self.write_context(
                product,
                draft_change=change,
                submit_for_review=submit_for_review,
            ),
        )
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except RequirementReviewError as exc:
            return self.error_response(exc)
        updated = self.get_change(pk, serializer.change.id)
        return Response(RequirementChangeSerializer(updated, context={"request": request}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def submit_change(self, request, slug, product_id, pk, change_id):
        product = self.get_product()
        requirement = self.get_requirement(pk)
        change = self.get_change(pk, change_id)
        if product is None or requirement is None or change is None:
            return Response({"error": "Requirement change not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            if request.data:
                serializer = RequirementWriteSerializer(
                    requirement,
                    data=request.data,
                    partial=True,
                    context=self.write_context(product, draft_change=change, submit_for_review=True),
                )
                serializer.is_valid(raise_exception=True)
                serializer.save()
                submitted_change_id = serializer.change.id
            else:
                submit_requirement_change(change.id, request.user)
                submitted_change_id = change.id
        except RequirementReviewError as exc:
            return self.error_response(exc)
        submitted = self.get_change(pk, submitted_change_id)
        return Response(RequirementChangeSerializer(submitted, context={"request": request}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def withdraw_change(self, request, slug, product_id, pk, change_id):
        if self.get_product() is None or self.get_change(pk, change_id) is None:
            return Response({"error": "Requirement change not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            draft = withdraw_requirement_change(change_id, request.user)
        except RequirementReviewError as exc:
            return self.error_response(exc)
        refreshed = self.get_change(pk, draft.id)
        return Response(RequirementChangeSerializer(refreshed, context={"request": request}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy_change(self, request, slug, product_id, pk, change_id):
        if self.get_product() is None or self.get_change(pk, change_id) is None:
            return Response({"error": "Requirement change not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            discard_requirement_draft(change_id, request.user)
        except RequirementReviewError as exc:
            return self.error_response(exc)
        return Response(
            RequirementDetailSerializer(self.get_requirement(pk), context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def review_change(self, request, slug, product_id, pk, change_id):
        if self.get_product() is None or self.get_change(pk, change_id) is None:
            return Response({"error": "Requirement change not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementReviewActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            submit_requirement_review(
                change_id,
                request.user,
                serializer.validated_data["opinion"],
                serializer.validated_data.get("reason", ""),
            )
        except RequirementReviewError as exc:
            return self.error_response(exc)
        return Response(
            RequirementChangeSerializer(
                self.get_change(pk, change_id),
                context={"request": request},
            ).data
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def my_reviews(self, request, slug, product_id):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        actionable = Q(change__status=RequirementChangeStatus.PENDING) & (
            Q(latest_opinion__isnull=True) | Q(latest_opinion=RequirementReviewOpinion.NEEDS_CLARIFICATION)
        )
        assignments = RequirementChangeReviewer.objects.filter(
            reviewer=request.user,
            change__requirement__product_id=product_id,
            change__requirement__product__workspace__slug=slug,
            change__requirement__type=self.requirement_type,
            change__requirement__deleted_at__isnull=True,
        )
        tab = request.query_params.get("tab", "pending")
        if tab == "pending":
            assignments = assignments.filter(actionable)
        else:
            assignments = assignments.exclude(actionable).filter(records__isnull=False).distinct()
        change_ids = assignments.values_list("change_id", flat=True)
        changes = self.get_change_queryset().filter(id__in=change_ids).order_by("-created_at")
        pending_count = (
            RequirementChangeReviewer.objects.filter(
                reviewer=request.user,
                change__requirement__product_id=product_id,
                change__requirement__product__workspace__slug=slug,
                change__requirement__type=self.requirement_type,
                change__requirement__deleted_at__isnull=True,
            )
            .filter(actionable)
            .count()
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(changes, request)
        return Response(
            {
                "count": changes.count(),
                "pending_count": pending_count,
                "data": RequirementChangeSerializer(
                    page,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def versions(self, request, slug, product_id, pk):
        if self.get_product() is None or self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        versions = RequirementVersion.objects.filter(requirement_id=pk).order_by("-version")
        return Response(RequirementVersionListSerializer(versions, many=True).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def version_detail(self, request, slug, product_id, pk, version):
        if self.get_product() is None or self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        version_obj = (
            RequirementVersion.objects.filter(requirement_id=pk, version=version)
            .select_related("source_change")
            .first()
        )
        if version_obj is None:
            return Response({"error": "Requirement version not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RequirementVersionDetailSerializer(version_obj, context={"request": request}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def compare(self, request, slug, product_id, pk):
        if self.get_product() is None or self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        from_version = request.query_params.get("from_version")
        to_version = request.query_params.get("to_version")
        to_change_id = request.query_params.get("to_change_id")
        from_snapshot = {}
        if from_version is not None:
            source = RequirementVersion.objects.filter(
                requirement_id=pk,
                version=from_version,
            ).first()
            if source is None:
                return Response({"error": "From version not found."}, status=status.HTTP_404_NOT_FOUND)
            from_snapshot = source.snapshot
        if to_change_id:
            target_change = self.get_change(pk, to_change_id)
            if target_change is None:
                return Response({"error": "Target change not found."}, status=status.HTTP_404_NOT_FOUND)
            to_snapshot = target_change.proposal_snapshot
        elif to_version is not None:
            target = RequirementVersion.objects.filter(
                requirement_id=pk,
                version=to_version,
            ).first()
            if target is None:
                return Response({"error": "To version not found."}, status=status.HTTP_404_NOT_FOUND)
            to_snapshot = target.snapshot
        else:
            return Response(
                {"error": "to_version or to_change_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(build_requirement_diff(from_snapshot, to_snapshot))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def lifecycle(self, request, slug, product_id, pk):
        if self.get_product() is None or self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementLifecycleActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transition_requirement_lifecycle(
                pk,
                request.user,
                serializer.validated_data["action"],
                serializer.validated_data.get("reason_code", ""),
                serializer.validated_data.get("note", ""),
            )
        except RequirementReviewError as exc:
            return self.error_response(exc)
        return Response(RequirementDetailSerializer(self.get_requirement(pk), context={"request": request}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def archive(self, request, slug, product_id, pk):
        if self.get_product() is None or self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            set_requirement_archived(pk, request.user, True)
        except RequirementReviewError as exc:
            return self.error_response(exc)
        return Response(RequirementDetailSerializer(self.get_requirement(pk), context={"request": request}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def unarchive(self, request, slug, product_id, pk):
        if self.get_product() is None or self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            set_requirement_archived(pk, request.user, False)
        except RequirementReviewError as exc:
            return self.error_response(exc)
        return Response(RequirementDetailSerializer(self.get_requirement(pk), context={"request": request}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def lifecycle_events(self, request, slug, product_id, pk):
        if self.get_product() is None or self.get_requirement(pk) is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        events = RequirementLifecycleEvent.objects.filter(requirement_id=pk).select_related("created_by", "change")
        return Response(RequirementLifecycleEventSerializer(events, many=True).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, product_id, pk):
        product = self.get_product()
        requirement = self.get_requirement(pk)
        if product is None or requirement is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        subtree_ids = {requirement.id}
        frontier = {requirement.id}
        while frontier:
            child_ids = (
                set(Requirement.objects.filter(product=product, parent_id__in=frontier).values_list("id", flat=True))
                - subtree_ids
            )
            if not child_ids:
                break
            subtree_ids.update(child_ids)
            frontier = child_ids

        now = timezone.now()
        with transaction.atomic():
            notify_requirement_deleted(requirement, request.user)
            pending_parent_changes = list(
                RequirementChange.objects.filter(
                    requirement__product=product,
                    status=RequirementChangeStatus.PENDING,
                    parent_id__in=subtree_ids,
                )
                .exclude(requirement_id__in=subtree_ids)
                .select_related("requirement", "assignee", "parent", "module")
                .prefetch_related("proposed_reviewers", "change_attachments")
            )
            for change in pending_parent_changes:
                create_requirement_change(
                    change.requirement,
                    proposal_data_from_change(change, parent=None),
                    request.user,
                    kind=RequirementChangeKind.SYSTEM_RESET,
                )
            asset_ids = set(
                RequirementAttachment.objects.filter(requirement_id__in=subtree_ids).values_list("asset_id", flat=True)
            )
            asset_ids.update(
                RequirementChangeAttachment.objects.filter(change__requirement_id__in=subtree_ids).values_list(
                    "asset_id", flat=True
                )
            )
            asset_ids.update(
                RequirementVersionAttachment.objects.filter(version__requirement_id__in=subtree_ids).values_list(
                    "asset_id", flat=True
                )
            )
            RequirementAttachment.objects.filter(requirement_id__in=subtree_ids).update(
                deleted_at=now,
                updated_by=request.user,
            )
            FileAsset.objects.filter(id__in=asset_ids).update(
                is_deleted=True,
                deleted_at=now,
                updated_by=request.user,
            )
            Requirement.objects.filter(id__in=subtree_ids).update(
                deleted_at=now,
                updated_at=now,
                updated_by=request.user,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def options(self, request, slug, product_id):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        queryset = Requirement.objects.filter(
            product_id=product_id,
            product__workspace__slug=slug,
            archived_at__isnull=True,
            status__in=[Requirement.Status.DRAFT, Requirement.Status.IN_REVIEW, Requirement.Status.PUBLISHED],
        )
        if self.requirement_type == Requirement.RequirementType.USER:
            queryset = queryset.filter(type=Requirement.RequirementType.USER)
        else:
            queryset = queryset.filter(
                type__in=[
                    Requirement.RequirementType.USER,
                    Requirement.RequirementType.DEVELOPMENT,
                ]
            )
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name__icontains=search)
        exclude_id = request.query_params.get("exclude")
        if exclude_id:
            try:
                current_id = UUID(exclude_id)
            except ValueError:
                return Response(
                    {"exclude": ["Invalid requirement id."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            excluded_ids = {current_id}
            frontier = {current_id}
            while frontier:
                child_ids = (
                    set(
                        Requirement.objects.filter(
                            product_id=product_id,
                            parent_id__in=frontier,
                        ).values_list("id", flat=True)
                    )
                    - excluded_ids
                )
                if not child_ids:
                    break
                excluded_ids.update(child_ids)
                frontier = child_ids
            queryset = queryset.exclude(id__in=excluded_ids)
        return Response(list(queryset.values("id", "name", "type")[:50]))


class RequirementCommentViewSet(ProductRequirementMixin, BaseViewSet):
    serializer_class = RequirementCommentSerializer
    model = RequirementComment
    requirement_type = Requirement.RequirementType.USER

    def get_requirement(self):
        product = self.get_product()
        if product is None:
            return None
        return (
            Requirement.objects.filter(
                id=self.kwargs.get("pk"),
                product=product,
                type=self.requirement_type,
            )
            .select_related("product", "product__workspace")
            .first()
        )

    def get_queryset(self):
        return (
            RequirementComment.objects.filter(
                requirement_id=self.kwargs.get("pk"),
                requirement__product_id=self.kwargs.get("product_id"),
                requirement__product__workspace__slug=self.kwargs.get("slug"),
                requirement__type=self.requirement_type,
            )
            .select_related("actor", "requirement", "requirement__product", "parent")
            .order_by("created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, product_id, pk):
        if self.get_requirement() is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create(self, request, slug, product_id, pk):
        requirement = self.get_requirement()
        if requirement is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        if requirement.archived_at is not None or requirement.status == Requirement.Status.CLOSED:
            return Response(
                {"error": "当前需求为只读状态。", "code": "REQUIREMENT_TERMINAL_READ_ONLY"},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = self.get_serializer(
            data=request.data,
            context={"request": request, "requirement": requirement},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, product_id, pk, comment_id):
        requirement = self.get_requirement()
        if requirement is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        if requirement.archived_at is not None or requirement.status == Requirement.Status.CLOSED:
            return Response(
                {"error": "当前需求为只读状态。", "code": "REQUIREMENT_TERMINAL_READ_ONLY"},
                status=status.HTTP_409_CONFLICT,
            )
        comment = self.get_queryset().filter(id=comment_id).first()
        if comment is None:
            return Response({"error": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)
        if comment.actor_id != request.user.id:
            return Response(
                {"error": "Only the comment author can delete this comment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        comment_ids = {comment.id}
        frontier = {comment.id}
        while frontier:
            child_ids = set(
                RequirementComment.objects.filter(
                    requirement_id=pk,
                    parent_id__in=frontier,
                ).values_list("id", flat=True)
            ) - comment_ids
            if not child_ids:
                break
            comment_ids.update(child_ids)
            frontier = child_ids

        now = timezone.now()
        with transaction.atomic():
            FileAsset.objects.filter(requirement_comment_id__in=comment_ids).update(
                is_deleted=True,
                deleted_at=now,
                updated_by=request.user,
            )
            RequirementComment.objects.filter(id__in=comment_ids).update(
                deleted_at=now,
                updated_at=now,
                updated_by=request.user,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


# Backward-compatible class name used by existing imports.
UserRequirementViewSet = RequirementViewSet


class RequirementModuleViewSet(ProductRequirementMixin, BaseViewSet):
    serializer_class = RequirementModuleSerializer
    model = RequirementModule
    search_fields = ["name"]

    def get_requirement_type(self):
        value = self.request.query_params.get("requirement_type", Requirement.RequirementType.USER)
        if value not in Requirement.RequirementType.values:
            return Requirement.RequirementType.USER
        return value

    def get_queryset(self):
        requirement_type = self.get_requirement_type()
        return (
            RequirementModule.objects.filter(
                product_id=self.kwargs.get("product_id"),
                product__workspace__slug=self.kwargs.get("slug"),
            )
            .annotate(
                requirement_count=Count(
                    "requirements",
                    filter=Q(
                        requirements__type=requirement_type,
                        requirements__deleted_at__isnull=True,
                    ),
                    distinct=True,
                )
            )
            .order_by("name")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, product_id):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        queryset = self.filter_queryset(self.get_queryset())
        total = Requirement.objects.filter(
            product_id=product_id,
            product__workspace__slug=slug,
            type=self.get_requirement_type(),
            deleted_at__isnull=True,
        ).count()
        return Response({"total": total, "modules": self.get_serializer(queryset, many=True).data})

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create(self, request, slug, product_id):
        product = self.get_product()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(
            data=request.data,
            context={"request": request, "product": product},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, product_id, pk):
        product = self.get_product()
        module = self.get_queryset().filter(pk=pk).first()
        if product is None or module is None:
            return Response({"error": "Requirement module not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(
            module,
            data=request.data,
            partial=True,
            context={"request": request, "product": product},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, product_id, pk):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        module = self.get_queryset().filter(pk=pk).first()
        if module is None:
            return Response({"error": "Requirement module not found."}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            pending_changes = list(
                RequirementChange.objects.filter(
                    requirement__product_id=product_id,
                    requirement__product__workspace__slug=slug,
                    status=RequirementChangeStatus.PENDING,
                    module=module,
                )
                .select_related("requirement", "assignee", "parent", "module")
                .prefetch_related("proposed_reviewers", "change_attachments")
            )
            Requirement.objects.filter(module=module).update(
                module=None,
                updated_at=timezone.now(),
                updated_by=request.user,
            )
            for change in pending_changes:
                create_requirement_change(
                    change.requirement,
                    proposal_data_from_change(change, module=None),
                    request.user,
                    kind=RequirementChangeKind.SYSTEM_RESET,
                )
            module.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
