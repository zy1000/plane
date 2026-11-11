"""工作区设置 → 角色：角色（数据字典 job_role 的值）的维护、持有人与引用。

权限沿用原来的口径：查看要数据字典查看 / 维护；新建、改名、删除、调整顺序要数据字典维护
（角色原来就在数据字典页维护）；在角色上添加 / 移除工作区成员要成员管理（同成员页编辑角色）。
"""

from django.db import transaction
from django.db.models import ProtectedError, RestrictedError
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.data_dictionary import DataDictionaryItemSerializer
from plane.app.views import BaseAPIView
from plane.db.models import Workspace
from plane.utils.data_dictionary import ensure_system_dictionaries
from plane.utils.job_role import job_role_dictionary
from plane.utils.job_role_settings import (
    add_workspace_members,
    get_role,
    is_role_in_use,
    label_usage,
    list_roles,
    mark_roles_colored,
    project_members,
    purge_hidden_links,
    remove_workspace_member,
    reorder_roles,
    role_detail,
    role_usage,
    workflow_references,
)

JOB_ROLE_READ_KEYS = (PermissionKey.WORKSPACE_DATA_DICTIONARY_VIEW, PermissionKey.WORKSPACE_DATA_DICTIONARY_MANAGE)
JOB_ROLE_MANAGE_KEY = PermissionKey.WORKSPACE_DATA_DICTIONARY_MANAGE
#: 新建 / 编辑只收这两个字段；排序走 reorder 接口
EDITABLE_FIELDS = ("label", "color")


def _not_found(message="Job role not found."):
    return Response({"error": message}, status=status.HTTP_404_NOT_FOUND)


def _in_use(usage=None):
    body = {"error": "This job role is still in use.", "code": "JOB_ROLE_IN_USE"}
    if usage is not None:
        body["usage"] = usage
    return Response(body, status=status.HTTP_409_CONFLICT)


def _editable(data):
    return {key: data[key] for key in EDITABLE_FIELDS if key in data}


def _resolve(slug, pk=None):
    """(workspace, 角色)；工作区不存在时两者皆 None。"""
    workspace = Workspace.objects.filter(slug=slug).first()
    if workspace is None or pk is None:
        return workspace, None
    return workspace, get_role(workspace.id, pk)


class JobRoleListAPIView(BaseAPIView):
    @allow_fine_permission(*JOB_ROLE_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug):
        workspace, _ = _resolve(slug)
        if workspace is None:
            return _not_found("Workspace not found.")
        ensure_system_dictionaries(workspace)
        return Response(list_roles(workspace.id), status=status.HTTP_200_OK)

    @allow_fine_permission(JOB_ROLE_MANAGE_KEY, level="WORKSPACE")
    def post(self, request, slug):
        workspace, _ = _resolve(slug)
        if workspace is None:
            return _not_found("Workspace not found.")
        ensure_system_dictionaries(workspace)
        dictionary = job_role_dictionary(workspace.id)
        serializer = DataDictionaryItemSerializer(data=_editable(request.data), context={"dictionary": dictionary})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            item = serializer.save(dictionary=dictionary, workspace=workspace)
            mark_roles_colored(dictionary)
        return Response(role_detail(item), status=status.HTTP_201_CREATED)


class JobRoleDetailAPIView(BaseAPIView):
    @allow_fine_permission(*JOB_ROLE_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, pk):
        _, item = _resolve(slug, pk)
        if item is None:
            return _not_found()
        return Response(role_detail(item), status=status.HTTP_200_OK)

    @allow_fine_permission(JOB_ROLE_MANAGE_KEY, level="WORKSPACE")
    def patch(self, request, slug, pk):
        _, item = _resolve(slug, pk)
        if item is None:
            return _not_found()
        serializer = DataDictionaryItemSerializer(
            item, data=_editable(request.data), partial=True, context={"dictionary": item.dictionary}
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            item = serializer.save()
            mark_roles_colored(item.dictionary)
        return Response(role_detail(item), status=status.HTTP_200_OK)

    @allow_fine_permission(JOB_ROLE_MANAGE_KEY, level="WORKSPACE")
    def delete(self, request, slug, pk):
        workspace, item = _resolve(slug, pk)
        if item is None:
            return _not_found()
        usage = role_usage(workspace.id, [item.id])[str(item.id)]
        if is_role_in_use(usage):
            return _in_use(usage)
        try:
            with transaction.atomic():
                purge_hidden_links(item)
                item.delete()
        except (ProtectedError, RestrictedError):
            return _in_use()
        return Response(status=status.HTTP_204_NO_CONTENT)


class JobRoleReorderAPIView(BaseAPIView):
    @allow_fine_permission(JOB_ROLE_MANAGE_KEY, level="WORKSPACE")
    def post(self, request, slug):
        workspace, _ = _resolve(slug)
        if workspace is None:
            return _not_found("Workspace not found.")
        field = drf_serializers.ListField(child=drf_serializers.UUIDField(), allow_empty=False)
        try:
            ordered_ids = field.run_validation(request.data.get("ids"))
        except drf_serializers.ValidationError as exc:
            return Response({"ids": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        reorder_roles(workspace.id, ordered_ids)
        return Response(list_roles(workspace.id), status=status.HTTP_200_OK)


class JobRoleProjectMembersAPIView(BaseAPIView):
    @allow_fine_permission(*JOB_ROLE_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, pk):
        workspace, item = _resolve(slug, pk)
        if item is None:
            return _not_found()
        return Response(project_members(workspace.id, item.id), status=status.HTTP_200_OK)


class JobRoleReferencesAPIView(BaseAPIView):
    @allow_fine_permission(*JOB_ROLE_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, pk):
        workspace, item = _resolve(slug, pk)
        if item is None:
            return _not_found()
        return Response(workflow_references(workspace.id, item.id), status=status.HTTP_200_OK)


class JobRoleLabelUsageAPIView(BaseAPIView):
    """改名前的提示：评审模板 / 未完成的评审是按角色名字引用的。"""

    @allow_fine_permission(*JOB_ROLE_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, pk):
        _, item = _resolve(slug, pk)
        if item is None:
            return _not_found()
        return Response(label_usage(item), status=status.HTTP_200_OK)


class JobRoleWorkspaceMembersAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_MANAGE, level="WORKSPACE")
    def post(self, request, slug, pk):
        workspace, item = _resolve(slug, pk)
        if item is None:
            return _not_found()
        field = drf_serializers.ListField(child=drf_serializers.UUIDField(), allow_empty=False)
        try:
            member_ids = field.run_validation(request.data.get("member_ids"))
        except drf_serializers.ValidationError as exc:
            return Response({"member_ids": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        added = add_workspace_members(workspace.id, item, member_ids)
        return Response({"member_ids": added}, status=status.HTTP_200_OK)


class JobRoleWorkspaceMemberDetailAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_MANAGE, level="WORKSPACE")
    def delete(self, request, slug, pk, user_id):
        workspace, item = _resolve(slug, pk)
        if item is None:
            return _not_found()
        remove_workspace_member(workspace.id, item, user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
