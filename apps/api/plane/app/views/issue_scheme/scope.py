"""工作项配置视图在两种作用域下共用（docs/issue-scheme/ 4.2）：

    项目级路由  workspaces/<slug>/projects/<project_id>/...        项目所用的方案
    方案级路由  workspaces/<slug>/issue-schemes/<issue_scheme_id>/...  模板中心维护的模式方案

视图用 ``IssueSchemeScopeMixin.get_scheme_id()`` 拿方案 id，按 ``scheme_id`` 过滤；鉴权见
``plane.app.permissions.base.check_issue_scheme_route_permission``（方案级路由走研发模式权限）。
"""

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS

from plane.app.permissions.base import ISSUE_SCHEME_ROUTE_KWARG, is_issue_scheme_route
from plane.utils.issue_scheme import (
    ISSUE_SCHEME_FOLLOWS_DEV_MODE,
    is_project_following,
    project_scheme_id,
)


class IssueSchemeScopeMixin:
    """放在视图基类前面：``class StateViewSet(IssueSchemeScopeMixin, BaseViewSet)``。"""

    @property
    def is_scheme_route(self) -> bool:
        return is_issue_scheme_route(self.kwargs)

    def get_scheme_id(self):
        if not hasattr(self, "_issue_scheme_id_cache"):
            if self.is_scheme_route:
                self._issue_scheme_id_cache = self.kwargs[ISSUE_SCHEME_ROUTE_KWARG]
            else:
                self._issue_scheme_id_cache = project_scheme_id(self.kwargs.get("project_id"))
        return self._issue_scheme_id_cache

    def serializer_scope_context(self):
        """给 serializer 校验「类型 / 状态 / 工作流属于当前方案」用。"""
        return {"project_id": self.kwargs.get("project_id"), "scheme_id": self.get_scheme_id()}

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # 只读守卫（需求 5.2）：跟随研发模式的项目，项目级路由上的配置写操作一律拒绝，去模板中心改
        if (
            request.method not in SAFE_METHODS
            and not self.is_scheme_route
            and self.kwargs.get("project_id")
            and is_project_following(self.kwargs["project_id"])
        ):
            raise PermissionDenied(
                detail={
                    "error": "此项目的工作项配置跟随研发模式，请到模板中心修改，或先切换为项目自定义",
                    "code": ISSUE_SCHEME_FOLLOWS_DEV_MODE,
                }
            )
