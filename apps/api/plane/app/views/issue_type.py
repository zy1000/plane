"""Compatibility imports for the project-scoped issue type endpoints.

The URL configuration imports from ``plane.app.views.issue.issue_type``. This
module remains to avoid reintroducing a second implementation.
"""

from plane.app.views.issue.issue_type import (  # noqa: F401
    IssuePropertyValueAPIEndpoint,
    IssueTypePropertyListCreateAPIEndpoint,
    IssueTypePropertyViewSet,
    IssueTypeViewSet,
    ProjectIssueTypeListCreateAPIEndpoint,
    WorkspaceIssueTypeApiView,
)
