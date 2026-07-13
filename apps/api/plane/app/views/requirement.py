from uuid import UUID

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission, can_view_product
from plane.app.serializers.requirement import (
    RequirementModuleSerializer,
    UserRequirementDetailSerializer,
    UserRequirementListSerializer,
    UserRequirementWriteSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import FileAsset, Product, Requirement, RequirementAttachment, RequirementModule
from plane.utils.paginator import CustomPaginator


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


class UserRequirementViewSet(ProductRequirementMixin, BaseViewSet):
    serializer_class = UserRequirementListSerializer
    model = Requirement
    pagination_class = CustomPaginator
    search_fields = ["name"]
    filterset_fields = {
        "priority": ["exact", "in"],
        "module": ["exact"],
        "assignee": ["exact"],
        "parent": ["exact"],
    }

    def get_queryset(self):
        return (
            Requirement.objects.filter(
                product_id=self.kwargs.get("product_id"),
                product__workspace__slug=self.kwargs.get("slug"),
                type=Requirement.RequirementType.USER,
            )
            .select_related(
                "product",
                "module",
                "parent",
                "assignee",
                "created_by",
                "updated_by",
            )
            .prefetch_related("reviewers", "requirement_attachments__asset")
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

    def write_context(self, product):
        return {"request": self.request, "product": product}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, product_id):
        product = self.get_product()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        queryset = self.filter_queryset(self.get_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request)
        return Response(
            {
                "count": queryset.count(),
                "data": UserRequirementListSerializer(page, many=True).data,
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
        return Response(UserRequirementDetailSerializer(requirement).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create(self, request, slug, product_id):
        product = self.get_product()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserRequirementWriteSerializer(
            data=request.data,
            context=self.write_context(product),
        )
        serializer.is_valid(raise_exception=True)
        requirement = serializer.save()
        requirement = self.get_requirement(requirement.id)
        return Response(
            UserRequirementDetailSerializer(requirement).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, product_id, pk):
        product = self.get_product()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        requirement = self.get_requirement(pk)
        if requirement is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserRequirementWriteSerializer(
            requirement,
            data=request.data,
            partial=True,
            context=self.write_context(product),
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            UserRequirementDetailSerializer(self.get_requirement(pk)).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, product_id, pk):
        product = self.get_product()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        requirement = self.get_requirement(pk)
        if requirement is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)

        subtree_ids = {requirement.id}
        frontier = {requirement.id}
        while frontier:
            child_ids = set(
                Requirement.objects.filter(
                    product=product,
                    parent_id__in=frontier,
                ).values_list("id", flat=True)
            ) - subtree_ids
            if not child_ids:
                break
            subtree_ids.update(child_ids)
            frontier = child_ids

        now = timezone.now()
        with transaction.atomic():
            asset_ids = list(
                RequirementAttachment.objects.filter(
                    requirement_id__in=subtree_ids
                ).values_list("asset_id", flat=True)
            )
            RequirementAttachment.objects.filter(
                requirement_id__in=subtree_ids
            ).update(deleted_at=now, updated_by=request.user)
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

        queryset = self.get_queryset()
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
                child_ids = set(
                    Requirement.objects.filter(
                        product_id=product_id,
                        parent_id__in=frontier,
                    ).values_list("id", flat=True)
                ) - excluded_ids
                if not child_ids:
                    break
                excluded_ids.update(child_ids)
                frontier = child_ids
            queryset = queryset.exclude(id__in=excluded_ids)

        return Response(
            list(queryset.values("id", "name")[:50]),
            status=status.HTTP_200_OK,
        )


class RequirementModuleViewSet(ProductRequirementMixin, BaseViewSet):
    serializer_class = RequirementModuleSerializer
    model = RequirementModule
    search_fields = ["name"]

    def get_queryset(self):
        return (
            RequirementModule.objects.filter(
                product_id=self.kwargs.get("product_id"),
                product__workspace__slug=self.kwargs.get("slug"),
            )
            .annotate(
                requirement_count=Count(
                    "requirements",
                    filter=Q(
                        requirements__type=Requirement.RequirementType.USER,
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
            type=Requirement.RequirementType.USER,
            deleted_at__isnull=True,
        ).count()
        return Response(
            {"total": total, "modules": self.get_serializer(queryset, many=True).data},
            status=status.HTTP_200_OK,
        )

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
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, product_id, pk):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        module = self.get_queryset().filter(pk=pk).first()
        if module is None:
            return Response({"error": "Requirement module not found."}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            Requirement.objects.filter(module=module).update(
                module=None,
                updated_at=timezone.now(),
                updated_by=request.user,
            )
            module.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
