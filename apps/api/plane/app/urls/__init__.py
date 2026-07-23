# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .analytic import urlpatterns as analytic_urls
from .api import urlpatterns as api_urls
from .asset import urlpatterns as asset_urls
from .cycle import urlpatterns as cycle_urls
from .estimate import urlpatterns as estimate_urls
from .external import urlpatterns as external_urls
from .intake import urlpatterns as intake_urls
from .issue import urlpatterns as issue_urls
from .module import urlpatterns as module_urls
from .release import urlpatterns as release_urls
from .notification import urlpatterns as notification_urls
from .page import urlpatterns as page_urls
from .project import urlpatterns as project_urls
from .product import urlpatterns as product_urls
from .requirement import urlpatterns as requirement_urls
from .search import urlpatterns as search_urls
from .state import urlpatterns as state_urls
from .user import urlpatterns as user_urls
from .views import urlpatterns as view_urls
from .webhook import urlpatterns as webhook_urls
from .workspace import urlpatterns as workspace_urls
from .timezone import urlpatterns as timezone_urls
from .exporter import urlpatterns as exporter_urls
from .custom import urlpatterns as custom_urls
from .issue_type import urlpatterns as issue_type_urls
from .qa import urlpatterns as qa_urls
from .milestone import urlpatterns as milestone_urls
from .filestore import urlpatterns as filestore_urls
from .changelog import urlpatterns as changelog_urls
from .workflow import urlpatterns as workflow_urls
from .timesheet import urlpatterns as timesheet_urls
from .no_auth import urlpatterns as no_auth_urls

urlpatterns = [
    *analytic_urls,
    *asset_urls,
    *cycle_urls,
    *estimate_urls,
    *external_urls,
    *intake_urls,
    *issue_urls,
    *module_urls,
    *release_urls,
    *notification_urls,
    *page_urls,
    *project_urls,
    *product_urls,
    *requirement_urls,
    *search_urls,
    *state_urls,
    *user_urls,
    *view_urls,
    *workspace_urls,
    *api_urls,
    *webhook_urls,
    *timezone_urls,
    *custom_urls,
    *issue_type_urls,
    *exporter_urls,
    *qa_urls,
    *milestone_urls,
    *filestore_urls,
    *changelog_urls,
    *workflow_urls,
    *timesheet_urls,
    *no_auth_urls,
]
