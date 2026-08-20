# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.http import HttpResponseRedirect
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

# Module imports
from ..base import BaseAPIView
from plane.db.models import (
    FileAsset,
    Workspace,
    Project,
    Product,
    RequirementLibrary,
    User,
    Cycle,
    Release,
    TestCase,
)
from plane.settings.storage import S3Storage
from plane.app.permissions import allow_permission, ROLE
from plane.utils.cache import invalidate_cache_directly
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.throttles.asset import AssetRateThrottle
from plane.utils.file_path import build_resolver, rebind_asset_to_path
from plane.utils.asset_upload import presigned_post_for_asset
from plane.utils.product import can_create_product, can_manage_product, can_view_product


def requirement_asset_owner_exists(workspace, entity_identifier):
    """需求附件挂在**网格的归属方**（产品或标准库）上，而不是某一行需求。

    网格允许在还没落库的新行里上传附件，那一刻并没有需求行的 id 可用；归属方在
    整个编辑过程中都是稳定的，也不会因为草稿物化时重建行而失效。
    """
    if not entity_identifier:
        return False
    try:
        return (
            Product.objects.filter(
                id=entity_identifier, workspace=workspace
            ).exists()
            or RequirementLibrary.objects.filter(
                id=entity_identifier, workspace=workspace
            ).exists()
        )
    except (DjangoValidationError, ValueError):
        return False


def _rebind_assets_to_final_path(assets, request):
    """把仍处于 _temp 节点下的 asset 物理迁移到正式路径，并同步刷新 path/filename。

    用于 bulk 绑定接口在写入 issue_id/case_id 等关联 ID 之后，将先前
    保存到 ``_temp/{asset_id}/`` 下的对象搬运到 ``ws/[proj]/<业务>/<id>/`` 下。
    复制失败的 asset 会保留原 temp 路径，下次绑定可重试。
    """

    if not assets:
        return []

    storage = S3Storage(request=request)
    resolver = build_resolver()
    failed_asset_ids = []
    for asset in assets:
        try:
            rebind_asset_to_path(asset, storage=storage, resolver=resolver)
            if (
                getattr(asset.path, "entity_type", None) == "TEMP"
                and asset.product_id is not None
            ):
                failed_asset_ids.append(str(asset.id))
        except Exception:
            # 单条失败不要影响后续 asset；下次 bulk 还能重试
            failed_asset_ids.append(str(asset.id))
    return failed_asset_ids


def _get_product(workspace, product_id):
    if not product_id:
        return None
    try:
        return (
            Product.objects.select_related("workspace", "workspace__owner", "owner")
            .prefetch_related("reviewers")
            .filter(id=product_id, workspace=workspace)
            .first()
        )
    except (TypeError, ValueError, DjangoValidationError):
        return None


def _is_cross_workspace_product(workspace, product_id):
    if not product_id:
        return False
    try:
        return Product.objects.filter(id=product_id).exclude(workspace=workspace).exists()
    except (TypeError, ValueError, DjangoValidationError):
        return False


def _can_access_product_asset(user, asset, *, manage=False):
    if asset.entity_type not in (
        FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
        FileAsset.EntityTypeContext.PRODUCT_COVER,
    ):
        return True
    if asset.product_id:
        return (
            can_manage_product(user, asset.product)
            if manage
            else can_view_product(user, asset.product)
        )
    return asset.created_by_id == user.id


class UserAssetsV2Endpoint(BaseAPIView):
    """This endpoint is used to upload user profile images."""

    def asset_delete(self, asset_id):
        asset = FileAsset.objects.filter(id=asset_id).first()
        if asset is None:
            return
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return

    def entity_asset_save(self, asset_id, entity_type, asset, request):
        # User Avatar
        if entity_type == FileAsset.EntityTypeContext.USER_AVATAR:
            user = User.objects.get(id=asset.user_id)
            user.avatar = ""
            # Delete the previous avatar
            if user.avatar_asset_id:
                self.asset_delete(user.avatar_asset_id)
            # Save the new avatar
            user.avatar_asset_id = asset_id
            user.save()
            invalidate_cache_directly(
                path="/api/users/me/", url_params=False, user=True, request=request
            )
            invalidate_cache_directly(
                path="/api/users/me/settings/",
                url_params=False,
                user=True,
                request=request,
            )
            return
        # User Cover
        if entity_type == FileAsset.EntityTypeContext.USER_COVER:
            user = User.objects.get(id=asset.user_id)
            user.cover_image = None
            # Delete the previous cover image
            if user.cover_image_asset_id:
                self.asset_delete(user.cover_image_asset_id)
            # Save the new cover image
            user.cover_image_asset_id = asset_id
            user.save()
            invalidate_cache_directly(
                path="/api/users/me/", url_params=False, user=True, request=request
            )
            invalidate_cache_directly(
                path="/api/users/me/settings/",
                url_params=False,
                user=True,
                request=request,
            )
            return
        return

    def entity_asset_delete(self, entity_type, asset, request):
        # User Avatar
        if entity_type == FileAsset.EntityTypeContext.USER_AVATAR:
            user = User.objects.get(id=asset.user_id)
            user.avatar_asset_id = None
            user.save()
            invalidate_cache_directly(
                path="/api/users/me/", url_params=False, user=True, request=request
            )
            invalidate_cache_directly(
                path="/api/users/me/settings/",
                url_params=False,
                user=True,
                request=request,
            )
            return
        # User Cover
        if entity_type == FileAsset.EntityTypeContext.USER_COVER:
            user = User.objects.get(id=asset.user_id)
            user.cover_image_asset_id = None
            user.save()
            invalidate_cache_directly(
                path="/api/users/me/", url_params=False, user=True, request=request
            )
            invalidate_cache_directly(
                path="/api/users/me/settings/",
                url_params=False,
                user=True,
                request=request,
            )
            return
        return

    def post(self, request):
        # get the asset key
        name = request.data.get("name")
        type = request.data.get("type", "image/jpeg")
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        entity_type = request.data.get("entity_type", False)

        # Check if the file size is within the limit
        size_limit = min(size, settings.FILE_SIZE_LIMIT)

        #  Check if the entity type is allowed
        if not entity_type or entity_type not in ["USER_AVATAR", "USER_COVER"]:
            return Response(
                {"error": "Invalid entity type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if the file type is allowed
        allowed_types = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/jpg",
            "image/gif",
        ]
        if type not in allowed_types:
            return Response(
                {
                    "error": "Invalid file type. Only JPEG, PNG, WebP, JPG and GIF files are allowed.",
                    "status": False,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create a File Asset（save() 钩子会自动 resolve path 与 dedup filename）
        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            size=size_limit,
            user=request.user,
            created_by=request.user,
            entity_type=entity_type,
        )

        presigned_url = presigned_post_for_asset(
            request=request, asset=asset, file_type=type, file_size=size_limit
        )
        # Return the presigned URL
        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset_url": asset.asset_url,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id, user_id=request.user.id)
        # get the storage metadata
        asset.is_uploaded = True
        # get the storage metadata
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(asset_id=str(asset_id))
        # get the entity and save the asset id for the request field
        self.entity_asset_save(
            asset_id=asset_id,
            entity_type=asset.entity_type,
            asset=asset,
            request=request,
        )
        # update the attributes
        asset.attributes = request.data.get("attributes", asset.attributes)
        # save the asset
        asset.save(update_fields=["is_uploaded", "attributes"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, asset_id):
        asset = FileAsset.objects.get(id=asset_id, user_id=request.user.id)
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        # get the entity and save the asset id for the request field
        self.entity_asset_delete(
            entity_type=asset.entity_type, asset=asset, request=request
        )
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceFileAssetEndpoint(BaseAPIView):
    """This endpoint is used to upload cover images/logos etc for workspace, projects and users."""

    def get_entity_id_field(self, entity_type, entity_id):
        # Workspace Logo
        if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
            return {"workspace_id": entity_id}

        # Project Cover
        if entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            return {"project_id": entity_id}

        # Product Cover（创建流 entity_id 为空串，显式归一成 NULL）
        if entity_type == FileAsset.EntityTypeContext.PRODUCT_COVER:
            return {"product_id": entity_id or None}

        # User Avatar and Cover
        if entity_type in [
            FileAsset.EntityTypeContext.USER_AVATAR,
            FileAsset.EntityTypeContext.USER_COVER,
        ]:
            return {"user_id": entity_id}

        # Issue Attachment and Description
        if entity_type in [
            FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
        ]:
            return {"issue_id": entity_id}

        # Page Description
        if entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION:
            return {"page_id": entity_id}
        if entity_type == FileAsset.EntityTypeContext.CASE_ATTACHMENT:
            # entity_identifier 可能是 ""/False（先传后绑、模板贴图不绑 case），
            # 必须归一为 None，否则 UUIDField 会把 False 变成 UUID(int=0)
            return {"case_id": entity_id or None}

        if entity_type == FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT:
            return {"entity_identifier": str(entity_id)}

        # Comment Description
        if entity_type == FileAsset.EntityTypeContext.COMMENT_DESCRIPTION:
            return {"comment_id": entity_id}
        return {}

    def asset_delete(self, asset_id):
        asset = FileAsset.objects.filter(id=asset_id).first()
        # Check if the asset exists
        if asset is None:
            return
        # Mark the asset as deleted
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return

    def entity_asset_save(self, asset_id, entity_type, asset, request):
        # Workspace Logo
        if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
            workspace = Workspace.objects.filter(id=asset.workspace_id).first()
            if workspace is None:
                return
            # Delete the previous logo
            if workspace.logo_asset_id:
                self.asset_delete(workspace.logo_asset_id)
            # Save the new logo
            workspace.logo = ""
            workspace.logo_asset_id = asset_id
            workspace.save()
            invalidate_cache_directly(
                path="/api/workspaces/", url_params=False, user=False, request=request
            )
            invalidate_cache_directly(
                path="/api/users/me/workspaces/",
                url_params=False,
                user=True,
                request=request,
            )
            invalidate_cache_directly(
                path="/api/instances/", url_params=False, user=False, request=request
            )
            return

        # Project Cover
        elif entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            project = Project.objects.filter(id=asset.project_id).first()
            if project is None:
                return
            # Delete the previous cover image
            if project.cover_image_asset_id:
                self.asset_delete(project.cover_image_asset_id)
            # Save the new cover image
            project.cover_image = ""
            project.cover_image_asset_id = asset_id
            project.save()
            return

        # Product Cover（创建流上传时 product_id 为空，绑定由 ProductViewSet.create 完成）
        elif entity_type == FileAsset.EntityTypeContext.PRODUCT_COVER:
            product = Product.objects.filter(id=asset.product_id).first()
            if product is None:
                return
            # Delete the previous cover image
            if product.cover_image_asset_id:
                self.asset_delete(product.cover_image_asset_id)
            # Save the new cover image
            product.cover_image = ""
            product.cover_image_asset_id = asset_id
            product.save()
            return
        else:
            return

    def entity_asset_delete(self, entity_type, asset, request):
        # Workspace Logo
        if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
            workspace = Workspace.objects.get(id=asset.workspace_id)
            if workspace is None:
                return
            workspace.logo_asset_id = None
            workspace.save()
            invalidate_cache_directly(
                path="/api/workspaces/", url_params=False, user=False, request=request
            )
            invalidate_cache_directly(
                path="/api/users/me/workspaces/",
                url_params=False,
                user=True,
                request=request,
            )
            invalidate_cache_directly(
                path="/api/instances/", url_params=False, user=False, request=request
            )
            return
        # Project Cover
        elif entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            project = Project.objects.filter(id=asset.project_id).first()
            if project is None:
                return
            project.cover_image_asset_id = None
            project.save()
            return
        # Product Cover
        elif entity_type == FileAsset.EntityTypeContext.PRODUCT_COVER:
            product = Product.objects.filter(id=asset.product_id).first()
            if product is None:
                return
            product.cover_image_asset_id = None
            product.save()
            return
        else:
            return

    def post(self, request, slug):
        name = request.data.get("name")
        type = request.data.get("type", "image/jpeg")
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        entity_type = request.data.get("entity_type")
        entity_identifier = request.data.get("entity_identifier", False)
        project_scope_id = request.data.get("project_id")

        # Check if the entity type is allowed
        if entity_type not in FileAsset.EntityTypeContext.values:
            return Response(
                {"error": "Invalid entity type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # # Check if the file type is allowed
        # allowed_types = [
        #     "image/jpeg",
        #     "image/png",
        #     "image/webp",
        #     "image/jpg",
        #     "image/gif",
        # ]
        # if type not in allowed_types:
        #     return Response(
        #         {
        #             "error": "Invalid file type. Only JPEG, PNG, WebP, JPG and GIF files are allowed.",
        #             "status": False,
        #         },
        #         status=status.HTTP_400_BAD_REQUEST,
        #     )

        # Get the size limit
        size_limit = min(settings.FILE_SIZE_LIMIT, size)

        # Get the workspace
        workspace = Workspace.objects.get(slug=slug)

        # PROJECT_COVER 兼容旧请求：前端通常把 project_id 放在 entity_identifier。
        if (
            entity_type == FileAsset.EntityTypeContext.PROJECT_COVER
            and not project_scope_id
            and entity_identifier
        ):
            project_scope_id = str(entity_identifier)

        entity_id_fields = self.get_entity_id_field(
            entity_type=entity_type, entity_id=entity_identifier
        )
        if entity_type == FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT:
            if not requirement_asset_owner_exists(workspace, entity_identifier):
                return Response(
                    {"error": "Requirement owner not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        if entity_type == FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION:
            product = _get_product(workspace, entity_identifier)
            if product is not None:
                if not can_manage_product(request.user, product):
                    return Response(
                        {"error": "You do not have permission to edit this product."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                entity_id_fields["product_id"] = product.id
            elif _is_cross_workspace_product(workspace, entity_identifier):
                return Response(
                    {"error": "Product not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            elif not can_create_product(request.user, workspace):
                return Response(
                    {"error": "You do not have permission to create product assets."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        if entity_type == FileAsset.EntityTypeContext.PRODUCT_COVER:
            product = _get_product(workspace, entity_identifier)
            if product is not None:
                if not can_manage_product(request.user, product):
                    return Response(
                        {"error": "You do not have permission to edit this product."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                entity_id_fields["product_id"] = product.id
            elif entity_identifier:
                # 传了 id 却解析不到（跨 workspace 或不存在），一律 404，
                # 避免把无效 id 直接写进 FK 触发 IntegrityError
                return Response(
                    {"error": "Product not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            elif not can_create_product(request.user, workspace):
                return Response(
                    {"error": "You do not have permission to create product assets."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        if project_scope_id and entity_type not in (
            FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
            FileAsset.EntityTypeContext.PRODUCT_COVER,
        ):
            entity_id_fields["project_id"] = project_scope_id

        # Create a File Asset（save() 钩子根据 entity_type + 各 FK 自动落 path/filename）
        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            size=size_limit,
            workspace=workspace,
            created_by=request.user,
            entity_type=entity_type,
            **entity_id_fields,
        )

        presigned_url = presigned_post_for_asset(
            request=request, asset=asset, file_type=type, file_size=size_limit
        )
        # Return the presigned URL
        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset_url": asset.asset_url,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, slug, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id, workspace__slug=slug)
        if not _can_access_product_asset(request.user, asset, manage=True):
            return Response(
                {"error": "You do not have permission to update this asset."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # get the storage metadata
        asset.is_uploaded = True
        # get the storage metadata
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(asset_id=str(asset_id))
        # get the entity and save the asset id for the request field
        self.entity_asset_save(
            asset_id=asset_id,
            entity_type=asset.entity_type,
            asset=asset,
            request=request,
        )
        # update the attributes
        asset.attributes = request.data.get("attributes", asset.attributes)
        # save the asset
        asset.save(update_fields=["is_uploaded", "attributes"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def put(self, request, slug, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id, workspace__slug=slug)
        if not _can_access_product_asset(request.user, asset, manage=True):
            return Response(
                {"error": "You do not have permission to update this asset."},
                status=status.HTTP_403_FORBIDDEN,
            )
        case_id = request.data.get("case_id")
        asset.case_id = case_id
        asset.save()

        # 如果这条 asset 是 CASE_ATTACHMENT 且当前还挂在 _temp 节点下，绑定 case 后立即物理迁移
        if asset.entity_type == FileAsset.EntityTypeContext.CASE_ATTACHMENT and case_id:
            asset.refresh_from_db(fields=["filename", "path", "case_id", "project_id"])
            _rebind_assets_to_final_path([asset], request=request)

        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, slug, asset_id):
        asset = FileAsset.objects.get(id=asset_id, workspace__slug=slug)
        if not _can_access_product_asset(request.user, asset, manage=True):
            return Response(
                {"error": "You do not have permission to delete this asset."},
                status=status.HTTP_403_FORBIDDEN,
            )
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        # get the entity and save the asset id for the request field
        self.entity_asset_delete(
            entity_type=asset.entity_type, asset=asset, request=request
        )
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get(self, request, slug, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id, workspace__slug=slug)
        if not _can_access_product_asset(request.user, asset):
            return Response(
                {"error": "You do not have permission to view this asset."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if the asset is uploaded
        if not asset.is_uploaded:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        signed_url = storage.generate_presigned_url(
            object_name=asset.storage_key,
            disposition="attachment",
            filename=asset.attributes.get("name"),
        )
        # Redirect to the signed URL
        return HttpResponseRedirect(signed_url)


class WorkspaceBulkAssetEndpoint(BaseAPIView):

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, entity_id):
        asset_ids = request.data.get("asset_ids", [])

        # Check if the asset ids are provided
        if not asset_ids:
            return Response(
                {"error": "No asset ids provided."}, status=status.HTTP_400_BAD_REQUEST
            )

        workspace = Workspace.objects.filter(slug=slug).first()
        product = _get_product(workspace, entity_id) if workspace else None

        # get the asset id
        assets = FileAsset.objects.filter(id__in=asset_ids, workspace__slug=slug)

        asset_types = set(assets.values_list("entity_type", flat=True))
        if (
            FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION in asset_types
            and asset_types != {FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION}
        ):
            return Response(
                {"error": "Product assets cannot be mixed with other asset types."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the first asset
        asset = assets.first()

        if not asset:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if asset.entity_type == FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION:
            if product is None:
                return Response(
                    {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
                )
            if (
                not can_manage_product(request.user, product)
                and product.created_by_id != request.user.id
            ):
                return Response(
                    {"error": "You do not have permission to edit this product."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            product_assets = assets.filter(
                entity_type=FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
                created_by=request.user,
            ).filter(Q(product__isnull=True) | Q(product=product))
            if product_assets.count() != len(set(asset_ids)):
                return Response(
                    {"error": "One or more assets cannot be bound to this product."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            product_assets.update(product=product)
            refreshed_assets = list(
                FileAsset.objects.filter(
                    id__in=asset_ids,
                    workspace__slug=slug,
                    product=product,
                )
            )
            failed_asset_ids = _rebind_assets_to_final_path(
                refreshed_assets, request=request
            )
            if failed_asset_ids:
                return Response(
                    {
                        "error": "One or more product assets could not be moved to the final path.",
                        "asset_ids": failed_asset_ids,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        if asset.entity_type == FileAsset.EntityTypeContext.CASE_ATTACHMENT:
            # For some cases, the bulk api is called after the issue is deleted creating
            # an integrity error
            try:
                assets.update(case_id=entity_id)
            except IntegrityError:
                pass

            # case 绑定后把 _temp 节点下的对象迁移到正式路径（resolver 会重新算 path）
            refreshed_assets = list(
                FileAsset.objects.filter(id__in=asset_ids, workspace__slug=slug)
            )
            _rebind_assets_to_final_path(refreshed_assets, request=request)

        return Response(status=status.HTTP_204_NO_CONTENT)


class StaticFileAssetEndpoint(BaseAPIView):
    """This endpoint is used to get the signed URL for a static asset."""

    permission_classes = [AllowAny]

    def get(self, request, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id)

        # Check if the asset is uploaded
        if not asset.is_uploaded:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if the entity type is allowed
        if asset.entity_type not in [
            FileAsset.EntityTypeContext.USER_AVATAR,
            FileAsset.EntityTypeContext.USER_COVER,
            FileAsset.EntityTypeContext.WORKSPACE_LOGO,
            FileAsset.EntityTypeContext.PROJECT_COVER,
            FileAsset.EntityTypeContext.PRODUCT_COVER,
        ]:
            return Response(
                {"error": "Invalid entity type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        signed_url = storage.generate_presigned_url(object_name=asset.storage_key)
        # Redirect to the signed URL
        return HttpResponseRedirect(signed_url)


class AssetRestoreEndpoint(BaseAPIView):
    """Endpoint to restore a deleted assets."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, asset_id):
        asset = FileAsset.all_objects.get(id=asset_id, workspace__slug=slug)
        if not _can_access_product_asset(request.user, asset, manage=True):
            return Response(
                {"error": "You do not have permission to restore this asset."},
                status=status.HTTP_403_FORBIDDEN,
            )
        asset.is_deleted = False
        asset.deleted_at = None
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectAssetEndpoint(BaseAPIView):
    """This endpoint is used to upload cover images/logos etc for workspace, projects and users."""

    def infer_entity_type(self, entity_type, entity_id, slug, project_id):
        if entity_type:
            return entity_type

        try:
            related_entity_id = uuid.UUID(str(entity_id))
        except (TypeError, ValueError, AttributeError):
            return entity_type

        if Cycle.objects.filter(
            id=related_entity_id, workspace__slug=slug, project_id=project_id
        ).exists():
            return FileAsset.EntityTypeContext.CYCLE_COMMENT_DESCRIPTION

        if Release.objects.filter(
            id=related_entity_id, workspace__slug=slug, project_id=project_id
        ).exists():
            return FileAsset.EntityTypeContext.RELEASE_COMMENT_DESCRIPTION

        if TestCase.objects.filter(
            id=related_entity_id, repository__project_id=project_id, deleted_at__isnull=True
        ).exists():
            return FileAsset.EntityTypeContext.TEST_CASE_COMMENT_DESCRIPTION

        return entity_type

    def get_entity_id_field(self, entity_type, entity_id):
        if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
            return {"workspace_id": entity_id}

        if entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            return {"project_id": entity_id}

        if entity_type in [
            FileAsset.EntityTypeContext.USER_AVATAR,
            FileAsset.EntityTypeContext.USER_COVER,
        ]:
            return {"user_id": entity_id}

        if entity_type in [
            FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
        ]:
            return {"issue_id": entity_id}

        if entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION:
            return {"page_id": entity_id}
        if entity_type == FileAsset.EntityTypeContext.CASE_ATTACHMENT:
            return {"case_id": entity_id}

        if entity_type == FileAsset.EntityTypeContext.COMMENT_DESCRIPTION:
            return {"comment_id": entity_id}

        if entity_type == FileAsset.EntityTypeContext.DRAFT_ISSUE_DESCRIPTION:
            return {"draft_issue_id": entity_id}

        # 上传阶段 ReleaseComment 尚未创建，entity_identifier 是 release_id，先以 release
        # 作为 path 父级；bulk 阶段再回填 release_comment_id（不需要再 rebind path）。
        if entity_type == FileAsset.EntityTypeContext.RELEASE_COMMENT_DESCRIPTION:
            return {"release_id": entity_id}

        # 上传阶段 CycleComment 尚未创建，entity_identifier 是 cycle_id，先以 cycle
        # 作为 path 父级；bulk 阶段再回填 cycle_comment_id（不需要再 rebind path）。
        if entity_type == FileAsset.EntityTypeContext.CYCLE_COMMENT_DESCRIPTION:
            return {"cycle_id": entity_id}

        # 上传阶段 TestCaseComment 尚未创建，entity_identifier 是 case_id，先以 case
        # 作为 path 父级；bulk 阶段再回填 test_case_comment_id。
        if entity_type == FileAsset.EntityTypeContext.TEST_CASE_COMMENT_DESCRIPTION:
            return {"case_id": entity_id}

        return {}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        name = request.data.get("name")
        type = request.data.get("type", "image/jpeg")
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        entity_type = request.data.get("entity_type", "")
        entity_identifier = request.data.get("entity_identifier")
        entity_type = self.infer_entity_type(
            entity_type=entity_type,
            entity_id=entity_identifier,
            slug=slug,
            project_id=project_id,
        )

        # Check if the entity type is allowed
        if entity_type not in FileAsset.EntityTypeContext.values:
            return Response(
                {"error": "Invalid entity type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 注：项目作用域下接受任意 MIME；头像/Logo 等图片限制走专用 endpoint。

        # Get the size limit
        size_limit = min(settings.FILE_SIZE_LIMIT, size)

        # Get the workspace
        workspace = Workspace.objects.get(slug=slug)

        entity_id_fields = self.get_entity_id_field(entity_type, entity_identifier)
        entity_id_fields["project_id"] = project_id

        # Create a File Asset（save() 钩子按 entity_type + FK 自动 resolve path 与 filename）
        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            size=size_limit,
            workspace=workspace,
            created_by=request.user,
            entity_type=entity_type,
            **entity_id_fields,
        )

        presigned_url = presigned_post_for_asset(
            request=request, asset=asset, file_type=type, file_size=size_limit
        )
        # Return the presigned URL
        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset_url": asset.asset_url,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, pk):
        # get the asset id
        asset = FileAsset.objects.get(
            id=pk, workspace__slug=slug, project_id=project_id
        )
        # get the storage metadata
        asset.is_uploaded = True
        # get the storage metadata
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(asset_id=str(pk))

        # update the attributes
        asset.attributes = request.data.get("attributes", asset.attributes)
        # save the asset
        asset.save(update_fields=["is_uploaded", "attributes"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def delete(self, request, slug, project_id, pk):
        # Get the asset
        asset = FileAsset.objects.get(
            id=pk, workspace__slug=slug, project_id=project_id
        )
        # Check deleted assets
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        # Save the asset
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, pk):
        # get the asset id
        asset = FileAsset.objects.get(
            workspace__slug=slug, project_id=project_id, pk=pk
        )

        # Check if the asset is uploaded
        if not asset.is_uploaded:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        signed_url = storage.generate_presigned_url(
            object_name=asset.storage_key,
            disposition="attachment",
            filename=asset.attributes.get("name"),
        )
        # Redirect to the signed URL
        return HttpResponseRedirect(signed_url)


class ProjectBulkAssetEndpoint(BaseAPIView):
    def save_project_cover(self, asset, project_id):
        project = Project.objects.get(id=project_id)
        project.cover_image_asset_id = asset.id
        project.save()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, entity_id):
        asset_ids = request.data.get("asset_ids", [])

        # Check if the asset ids are provided
        if not asset_ids:
            return Response(
                {"error": "No asset ids provided."}, status=status.HTTP_400_BAD_REQUEST
            )

        # get the asset id
        assets = FileAsset.objects.filter(id__in=asset_ids, workspace__slug=slug)

        # Get the first asset
        asset = assets.first()

        if not asset:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if the asset is uploaded
        needs_rebind = False
        if asset.entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            assets.update(project_id=project_id)
            [self.save_project_cover(asset, project_id) for asset in assets]

        if asset.entity_type == FileAsset.EntityTypeContext.ISSUE_DESCRIPTION:
            # For some cases, the bulk api is called after the issue is deleted creating
            # an integrity error
            try:
                assets.update(issue_id=entity_id, project_id=project_id)
            except IntegrityError:
                pass
            needs_rebind = True

        if asset.entity_type == FileAsset.EntityTypeContext.COMMENT_DESCRIPTION:
            # For some cases, the bulk api is called after the comment is deleted
            # creating an integrity error
            try:
                assets.update(comment_id=entity_id)
            except IntegrityError:
                pass
            needs_rebind = True

        if asset.entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION:
            assets.update(page_id=entity_id)
            needs_rebind = True

        if asset.entity_type == FileAsset.EntityTypeContext.DRAFT_ISSUE_DESCRIPTION:
            # For some cases, the bulk api is called after the draft issue is deleted
            # creating an integrity error
            try:
                assets.update(draft_issue_id=entity_id)
            except IntegrityError:
                pass
            needs_rebind = True

        # ReleaseComment 创建完成后回填 release_comment_id；path 在上传时已挂到 release
        # 节点下，这里不需要再 rebind（与 RELEASE_FILE 共享同一存储目录）。
        if asset.entity_type == FileAsset.EntityTypeContext.RELEASE_COMMENT_DESCRIPTION:
            try:
                assets.update(release_comment_id=entity_id)
            except IntegrityError:
                pass

        # CycleComment 创建完成后回填 cycle_comment_id；path 在上传时已挂到 cycle
        # 节点下，这里不需要再 rebind（与 CYCLE_FILE 共享同一存储目录）。
        if asset.entity_type == FileAsset.EntityTypeContext.CYCLE_COMMENT_DESCRIPTION:
            try:
                assets.update(cycle_comment_id=entity_id)
            except IntegrityError:
                pass

        # TestCaseComment 创建完成后回填 test_case_comment_id。
        if asset.entity_type == FileAsset.EntityTypeContext.TEST_CASE_COMMENT_DESCRIPTION:
            try:
                assets.update(test_case_comment_id=entity_id)
            except IntegrityError:
                pass

        if needs_rebind:
            refreshed_assets = list(
                FileAsset.objects.filter(id__in=asset_ids, workspace__slug=slug)
            )
            _rebind_assets_to_final_path(refreshed_assets, request=request)

        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetCheckEndpoint(BaseAPIView):
    """Endpoint to check if an asset exists."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, asset_id):
        asset = FileAsset.all_objects.select_related(
            "product", "product__workspace", "product__workspace__owner"
        ).filter(
            id=asset_id, workspace__slug=slug, deleted_at__isnull=True
        ).first()
        exists = bool(asset and _can_access_product_asset(request.user, asset))
        return Response({"exists": exists}, status=status.HTTP_200_OK)


class DuplicateAssetEndpoint(BaseAPIView):
    throttle_classes = [AssetRateThrottle]

    def get_entity_id_field(self, entity_type, entity_id):
        # Workspace Logo
        if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
            return {"workspace_id": entity_id}

        # Project Cover
        if entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            return {"project_id": entity_id}

        # User Avatar and Cover
        if entity_type in [
            FileAsset.EntityTypeContext.USER_AVATAR,
            FileAsset.EntityTypeContext.USER_COVER,
        ]:
            return {"user_id": entity_id}

        # Issue Attachment and Description
        if entity_type in [
            FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
        ]:
            return {"issue_id": entity_id}

        # Page Description
        if entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION:
            return {"page_id": entity_id}

        # Comment Description
        if entity_type == FileAsset.EntityTypeContext.COMMENT_DESCRIPTION:
            return {"comment_id": entity_id}

        if entity_type == FileAsset.EntityTypeContext.CYCLE_COMMENT_DESCRIPTION:
            return {"cycle_id": entity_id}

        if entity_type == FileAsset.EntityTypeContext.RELEASE_COMMENT_DESCRIPTION:
            return {"release_id": entity_id}

        if entity_type == FileAsset.EntityTypeContext.TEST_CASE_COMMENT_DESCRIPTION:
            return {"case_id": entity_id}

        # 测试用例附件/模板用例富文本贴图（entity_id 为空表示不绑 case）
        if entity_type == FileAsset.EntityTypeContext.CASE_ATTACHMENT:
            return {"case_id": entity_id or None}

        if entity_type == FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION:
            return {"product_id": entity_id}

        if entity_type == FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT:
            return {"entity_identifier": str(entity_id)}

        return {}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, asset_id):
        project_id = request.data.get("project_id", None)
        entity_id = request.data.get("entity_id", None)
        entity_type = request.data.get("entity_type", None)

        if not entity_type or entity_type not in FileAsset.EntityTypeContext.values:
            return Response(
                {"error": "Invalid entity type or entity id"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.get(slug=slug)
        if project_id:
            # check if project exists in the workspace
            if not Project.objects.filter(id=project_id, workspace=workspace).exists():
                return Response(
                    {"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND
                )

        storage = S3Storage(request=request)
        original_asset = FileAsset.objects.select_related(
            "product", "product__workspace", "product__workspace__owner"
        ).filter(
            id=asset_id,
            workspace=workspace,
            is_uploaded=True,
        ).first()

        if not original_asset:
            return Response(
                {"error": "Asset not found"}, status=status.HTTP_404_NOT_FOUND
            )
        if not _can_access_product_asset(request.user, original_asset):
            return Response(
                {"error": "You do not have permission to copy this asset."},
                status=status.HTTP_403_FORBIDDEN,
            )

        target_product = None
        if entity_type == FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION:
            target_product = _get_product(workspace, entity_id)
            if target_product is not None:
                if not can_manage_product(request.user, target_product):
                    return Response(
                        {"error": "You do not have permission to edit this product."},
                            status=status.HTTP_403_FORBIDDEN,
                        )
            elif _is_cross_workspace_product(workspace, entity_id):
                return Response(
                    {"error": "Product not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            elif not can_create_product(request.user, workspace):
                return Response(
                    {"error": "You do not have permission to create product assets."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        if entity_type == FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT:
            if not requirement_asset_owner_exists(workspace, entity_id):
                return Response(
                    {"error": "Requirement owner not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        entity_id_fields = self.get_entity_id_field(
            entity_type=entity_type, entity_id=entity_id
        )
        if (
            entity_type == FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION
            and target_product is None
        ):
            entity_id_fields.pop("product_id", None)
        if (
            project_id
            and entity_type != FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION
        ):
            entity_id_fields["project_id"] = project_id

        duplicated_asset = FileAsset.objects.create(
            attributes={
                "name": original_asset.attributes.get("name"),
                "type": original_asset.attributes.get("type"),
                "size": original_asset.attributes.get("size"),
            },
            size=original_asset.size,
            workspace=workspace,
            created_by_id=request.user.id,
            entity_type=entity_type,
            storage_metadata=original_asset.storage_metadata,
            **entity_id_fields,
        )
        from plane.utils.asset_upload import build_asset_metadata

        storage.copy_object(
            original_asset.storage_key,
            duplicated_asset.storage_key,
            metadata=build_asset_metadata(duplicated_asset),
            content_type=original_asset.attributes.get("type"),
        )
        # Update the is_uploaded field for all newly created assets
        FileAsset.objects.filter(id=duplicated_asset.id).update(is_uploaded=True)

        return Response(
            {"asset_id": str(duplicated_asset.id)}, status=status.HTTP_200_OK
        )


class WorkspaceAssetDownloadEndpoint(BaseAPIView):
    """Endpoint to generate a download link for an asset with content-disposition=attachment."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, asset_id):
        try:
            asset = FileAsset.objects.select_related(
                "product", "product__workspace", "product__workspace__owner"
            ).get(
                id=asset_id,
                workspace__slug=slug,
                is_uploaded=True,
            )
        except FileAsset.DoesNotExist:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not _can_access_product_asset(request.user, asset):
            return Response(
                {"error": "You do not have permission to view this asset."},
                status=status.HTTP_403_FORBIDDEN,
            )

        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=asset.storage_key,
            disposition="attachment",
            filename=asset.attributes.get("name", uuid.uuid4().hex),
        )

        return HttpResponseRedirect(signed_url)


class ProjectAssetDownloadEndpoint(BaseAPIView):
    """Endpoint to generate a download link for an asset with content-disposition=attachment."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, asset_id):
        try:
            asset = FileAsset.objects.get(
                id=asset_id,
                workspace__slug=slug,
                project_id=project_id,
                is_uploaded=True,
            )
        except FileAsset.DoesNotExist:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=asset.storage_key,
            disposition="attachment",
            filename=asset.attributes.get("name", uuid.uuid4().hex),
        )

        return HttpResponseRedirect(signed_url)
