from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    ROLE,
    allow_permission,
    can_manage_product,
    can_view_product,
    filter_products_for_user,
)
from plane.app.serializers.product import ProductMemberSerializer, ProductSerializer
from plane.app.serializers.user import UserLiteSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.asset.v2 import _rebind_assets_to_final_path
from plane.db.models import (
    FileAsset,
    Product,
    ProductMember,
    Requirement,
    RequirementChange,
    RequirementChangeReviewer,
    RequirementChangeStatus,
    Workspace,
    WorkspaceMember,
)


class ProductViewSet(BaseViewSet):
    serializer_class = ProductSerializer
    model = Product
    search_fields = ["name"]
    filterset_fields = {"network": ["exact"], "owner_id": ["exact"]}

    def get_queryset(self):
        queryset = (
            Product.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "owner", "created_by", "updated_by")
            .order_by("-created_at")
        )
        return self.filter_queryset(filter_products_for_user(queryset, self.request.user, self.kwargs.get("slug")))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        workspace = Workspace.objects.filter(slug=self.kwargs.get("slug")).first()
        context.update({"request": self.request, "workspace": workspace})
        return context

    def _participant_ids(self, product):
        requirements = Requirement.objects.filter(product=product)
        pending_changes = RequirementChange.objects.filter(
            requirement__product=product,
            status=RequirementChangeStatus.PENDING,
        )
        participant_ids = set(requirements.exclude(assignee__isnull=True).values_list("assignee_id", flat=True))
        participant_ids.update(requirements.exclude(reviewers__isnull=True).values_list("reviewers__id", flat=True))
        participant_ids.update(pending_changes.exclude(assignee__isnull=True).values_list("assignee_id", flat=True))
        participant_ids.update(
            pending_changes.exclude(proposed_reviewers__isnull=True).values_list("proposed_reviewers__id", flat=True)
        )
        participant_ids.update(
            RequirementChangeReviewer.objects.filter(change__in=pending_changes).values_list("reviewer_id", flat=True)
        )
        return participant_ids - {None}

    def _secret_product_member_ids(self, product):
        member_ids = set(ProductMember.objects.filter(product=product).values_list("member_id", flat=True))
        member_ids.update(
            WorkspaceMember.objects.filter(
                workspace=product.workspace,
                role=ROLE.ADMIN.value,
                is_active=True,
            ).values_list("member_id", flat=True)
        )
        member_ids.update({product.owner_id, product.created_by_id})
        return member_ids - {None}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(product).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(
            data=request.data,
            context={"request": request, "workspace": workspace},
        )
        serializer.is_valid(raise_exception=True)
        product = serializer.save()

        asset_ids = getattr(serializer, "bound_description_asset_ids", [])
        if asset_ids:
            assets = list(FileAsset.objects.filter(id__in=asset_ids, product=product))
            _rebind_assets_to_final_path(assets, request=request)

        return Response(self.get_serializer(product).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_product(request.user, product):
            return Response({"error": "You do not have permission."}, status=status.HTTP_403_FORBIDDEN)

        if str(request.data.get("network")) == "0" and product.network != 0:
            missing_ids = self._participant_ids(product) - self._secret_product_member_ids(product)
            if missing_ids:
                return Response(
                    {
                        "error": "产品转为私有前，需求负责人和评审人必须先加入产品成员。",
                        "code": "PRODUCT_PRIVATE_REQUIREMENT_MEMBERS_MISSING",
                        "member_ids": [str(member_id) for member_id in sorted(missing_ids)],
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        serializer = self.get_serializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def members(self, request, slug, pk):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.method == "GET":
            members = ProductMember.objects.filter(product=product).select_related("member")
            return Response(
                ProductMemberSerializer(members, many=True).data,
                status=status.HTTP_200_OK,
            )

        if not can_manage_product(request.user, product):
            return Response(
                {"error": "You do not have permission."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ProductMemberSerializer(
            data=request.data,
            context={"request": request, "product": product},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def eligible_members(self, request, slug, pk):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        explicit_member_ids = set(ProductMember.objects.filter(product=product).values_list("member_id", flat=True))
        workspace_members = WorkspaceMember.objects.filter(
            workspace=product.workspace,
            is_active=True,
        ).select_related("member")
        data = []
        for workspace_member in workspace_members:
            if not can_view_product(workspace_member.member, product):
                continue
            member_data = UserLiteSerializer(workspace_member.member).data
            member_data["is_product_member"] = workspace_member.member_id in explicit_member_ids
            data.append(member_data)
        return Response(data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def remove_member(self, request, slug, pk, member_id):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_product(request.user, product):
            return Response(
                {"error": "You do not have permission."},
                status=status.HTTP_403_FORBIDDEN,
            )
        product_member = ProductMember.objects.filter(
            product=product,
            member_id=member_id,
        ).first()
        if product_member is None:
            return Response(
                {"error": "Product member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if member_id in {product.owner_id, product.created_by_id}:
            return Response(
                {
                    "error": "产品负责人和创建人不能被移出产品。",
                    "code": "PRODUCT_MEMBER_PROTECTED",
                },
                status=status.HTTP_409_CONFLICT,
            )
        if member_id in self._participant_ids(product):
            return Response(
                {
                    "error": "该成员仍是需求负责人或当前/待评审人员，不能移出产品。",
                    "code": "PRODUCT_MEMBER_IN_REQUIREMENT_USE",
                },
                status=status.HTTP_409_CONFLICT,
            )
        product_member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_product(request.user, product):
            return Response({"error": "You do not have permission."}, status=status.HTTP_403_FORBIDDEN)

        product.assets.update(is_deleted=True, deleted_at=timezone.now())
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
