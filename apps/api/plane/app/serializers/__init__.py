# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .base import BaseSerializer
from .user import (
    UserSerializer,
    UserLiteSerializer,
    ChangePasswordSerializer,
    ResetPasswordSerializer,
    UserAdminLiteSerializer,
    UserMeSerializer,
    UserMeSettingsSerializer,
    ProfileSerializer,
    AccountSerializer,
)
from .workspace import (
    WorkSpaceSerializer,
    WorkSpaceMemberSerializer,
    WorkSpaceMemberInviteSerializer,
    WorkspaceLiteSerializer,
    WorkspaceThemeSerializer,
    PermissionSerializer,
    WorkspaceRoleSerializer,
    WorkspaceRolePermissionBindingSerializer,
    WorkspaceGroupSerializer,
    WorkspaceGroupMemberSerializer,
    WorkspaceGroupRoleSerializer,
    WorkspaceMemberAdminSerializer,
    WorkspaceMemberMeSerializer,
    WorkspaceUserPropertiesSerializer,
    WorkspaceUserLinkSerializer,
    WorkspaceRecentVisitSerializer,
    WorkspaceHomePreferenceSerializer,
    StickySerializer,
)
from .project import (
    ProjectSerializer,
    ProjectListSerializer,
    ProjectDetailSerializer,
    ProjectMemberSerializer,
    ProjectMemberInviteSerializer,
    ProjectIdentifierSerializer,
    ProjectLiteSerializer,
    ProjectMemberLiteSerializer,
    DeployBoardSerializer,
    ProjectMemberAdminSerializer,
    ProjectPublicMemberSerializer,
    ProjectMemberRoleSerializer,
    ProjectMemberPreferenceSerializer,
    ProjectRoleSerializer,
    ProjectRolePermissionBindingSerializer,
    ProjectPmsInfo,
    ImportProjectRoleSerializer,
)
from .state import StateSerializer, StateLiteSerializer
from .view import IssueViewSerializer, ViewIssueListSerializer
from .cycle import (
    CycleActivitySerializer,
    CycleCommentSerializer,
    CycleSerializer,
    CycleIssueSerializer,
    CycleOverdueRecordSerializer,
    CycleWriteSerializer,
    CycleUserPropertiesSerializer,
)
from .asset import FileAssetSerializer
from .issue import (
    IssueCreateSerializer,
    IssueActivitySerializer,
    IssueCommentSerializer,
    ProjectUserPropertySerializer,
    IssueAssigneeSerializer,
    LabelSerializer,
    IssueSerializer,
    IssueFlatSerializer,
    IssueStateSerializer,
    IssueLinkSerializer,
    IssueIntakeSerializer,
    IssueLiteSerializer,
    IssueAttachmentSerializer,
    IssueSubscriberSerializer,
    IssueReactionSerializer,
    CommentReactionSerializer,
    IssueVoteSerializer,
    IssueRelationSerializer,
    RelatedIssueSerializer,
    IssuePublicSerializer,
    IssueDetailSerializer,
    IssueReactionLiteSerializer,
    IssueAttachmentLiteSerializer,
    IssueLinkLiteSerializer,
    IssueVersionDetailSerializer,
    IssueDescriptionVersionDetailSerializer,
    IssueListDetailSerializer,
)

from .module import (
    ModuleDetailSerializer,
    ModuleWriteSerializer,
    ModuleSerializer,
    ModuleIssueSerializer,
    ModuleLinkSerializer,
    ModuleUserPropertiesSerializer,
)

from .release import (
    ReleaseDetailSerializer,
    ReleaseWriteSerializer,
    ReleaseSerializer,
    ReleaseIssueSerializer,
    ReleaseLinkSerializer,
    ReleaseUserPropertiesSerializer,
    ReleaseOverdueRecordSerializer,
    ReleaseCommentSerializer,
    ReleaseActivitySerializer,
)

from .api import APITokenSerializer, APITokenReadSerializer

from .importer import ImporterSerializer

from .page import (
    PageSerializer,
    PageDetailSerializer,
    PageVersionSerializer,
    PageBinaryUpdateSerializer,
    PageVersionDetailSerializer,
)

from .estimate import (
    EstimateSerializer,
    EstimatePointSerializer,
    EstimateReadSerializer,
    WorkspaceEstimateSerializer,
)

from .intake import (
    IntakeSerializer,
    IntakeIssueSerializer,
    IssueStateIntakeSerializer,
    IntakeIssueLiteSerializer,
    IntakeIssueDetailSerializer,
)

from .analytic import AnalyticViewSerializer

from .notification import NotificationSerializer, UserNotificationPreferenceSerializer

from .exporter import ExporterHistorySerializer

from .webhook import WebhookSerializer, WebhookLogSerializer

from .favorite import UserFavoriteSerializer
from .product import ProductSerializer
from .requirement import (
    RequirementCommentSerializer,
    RequirementModuleSerializer,
    UserRequirementDetailSerializer,
    UserRequirementListSerializer,
    UserRequirementWriteSerializer,
)
from .requirement_structure import (
    RequirementFieldTemplateSerializer,
    RequirementStructuredRevisionSerializer,
    RequirementStructuredRowCreateSerializer,
    RequirementStructuredRowReorderSerializer,
    RequirementStructuredRowSerializer,
    RequirementStructuredRowUpdateSerializer,
    RequirementStructuredSchemaSerializer,
    RequirementTemplateStatusSerializer,
    RequirementTemplateSchemaSerializer,
    RequirementTemplateWriteSerializer,
)

from .draft import (
    DraftIssueCreateSerializer,
    DraftIssueSerializer,
    DraftIssueDetailSerializer,
)

from .qa import (
    TestPlanCreateUpdateSerializer,
    TestCaseRepositorySerializer,
    TestCaseRepositoryDetailSerializer,
    TestCaseCommentSerializer,
    TestCaseActivitySerializer,
)
from .changelog import ChangeLogSerializer, ChangeLogReadRequestSerializer
from .profile_metric import WorkspaceUserMetricItemSerializer, WorkspaceUserMetricQuerySerializer
