"""模板中心「视图」页签：挂在研发模式上的研发模式视图（IssueView.dev_mode，project 为空）。

新建与改条件在跟随项目的页面里做（项目视图接口的 share_to_mode / 更新到研发模式），这里只管
列表、改名、排序、删除。路由 workspaces/<slug>/dev-modes/<dev_mode_id>/views/，鉴权走研发模式权限
（读要 view 或 manage，写要 manage）。
"""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers import IssueViewSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import IssueView, ProjectMember


#: 读研发模式：查看或维护任一即可
DEV_MODE_READ_KEYS = (PermissionKey.WORKSPACE_DEV_MODE_VIEW, PermissionKey.WORKSPACE_DEV_MODE_MANAGE)


def _mode_views(slug, dev_mode_id):
    return IssueView.objects.filter(workspace__slug=slug, dev_mode_id=dev_mode_id, project__isnull=True)


class DevModeViewListEndpoint(BaseAPIView):
    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, dev_mode_id):
        views = list(_mode_views(slug, dev_mode_id).select_related("source_project").order_by("sort_order", "name"))
        # 「在项目中打开」：优先回到存上来的那个项目，自己不在里面就换一个自己参与的跟随项目
        member_project_ids = list(
            ProjectMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                is_active=True,
                project__dev_mode_id=dev_mode_id,
                project__issue_scheme__project__isnull=True,
                project__archived_at__isnull=True,
            )
            .order_by("project__name")
            .values_list("project_id", flat=True)
        )
        member_project_set = set(member_project_ids)
        fallback_project_id = member_project_ids[0] if member_project_ids else None

        data = []
        for view, item in zip(views, IssueViewSerializer(views, many=True).data):
            source = view.source_project
            item["source_project_detail"] = (
                {"id": str(source.id), "name": source.name, "identifier": source.identifier} if source else None
            )
            open_project_id = view.source_project_id if view.source_project_id in member_project_set else fallback_project_id
            item["open_project_id"] = str(open_project_id) if open_project_id else None
            data.append(item)
        return Response(data, status=status.HTTP_200_OK)


class DevModeViewDetailEndpoint(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def patch(self, request, slug, dev_mode_id, pk):
        view = _mode_views(slug, dev_mode_id).filter(pk=pk).first()
        if not view:
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)
        name = str(request.data.get("name", "")).strip()
        if not name:
            return Response({"error": "视图名称不能为空"}, status=status.HTTP_400_BAD_REQUEST)
        view.name = name[:255]
        view.save(update_fields=["name", "query", "updated_at"])
        return Response(IssueViewSerializer(view).data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def delete(self, request, slug, dev_mode_id, pk):
        view = _mode_views(slug, dev_mode_id).filter(pk=pk).first()
        if not view:
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)
        view.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DevModeViewReorderEndpoint(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def post(self, request, slug, dev_mode_id):
        view_ids = [str(view_id) for view_id in request.data.get("view_ids", [])]
        views = {str(view.id): view for view in _mode_views(slug, dev_mode_id).filter(pk__in=view_ids)}
        with transaction.atomic():
            for index, view_id in enumerate(view_ids):
                view = views.get(view_id)
                if view:
                    IssueView.objects.filter(pk=view.pk).update(sort_order=(index + 1) * 10000)
        return Response(status=status.HTTP_204_NO_CONTENT)
