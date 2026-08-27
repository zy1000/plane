# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
import uuid
from django.utils import timezone

from plane.db.models import (
    ApprovalType,
    DataDictionary,
    DataDictionaryItem,
    Project,
    ProjectMember,
    ProjectUserProperty,
    State,
    WorkspaceMember,
    Workflow,
    WorkflowTransition,
    User,
)
from plane.tests.factories import project_required_payload


class TestProjectBase:
    def get_project_url(self, workspace_slug: str, pk: uuid.UUID = None, details: bool = False) -> str:
        """
        Constructs the project endpoint URL for the given workspace as reverse() is
        unreliable due to  duplicate 'name' values in URL patterns ('api' and 'app').

        Args:
            workspace_slug (str): The slug of the workspace.
            pk (uuid.UUID, optional): The primary key of a specific project.
            details (bool, optional): If True, constructs the URL for the
            project details endpoint. Defaults to False.
        """
        # Establish the common base URL for all project-related endpoints.
        base_url = f"/api/workspaces/{workspace_slug}/projects/"

        # Specific project instance URL.
        if pk:
            return f"{base_url}{pk}/"

        # Append 'details/' to the base URL.
        if details:
            return f"{base_url}details/"

        # Return the base project list URL.
        return base_url

    def project_payload(self, workspace, lead, **fields):
        """POST /projects/ 的完整合法载荷：grade（旧必填）+ 0348 新增必填 + 随机代号。"""
        return {
            "grade": "B",
            "code": f"C-{uuid.uuid4().hex[:8]}",
            **project_required_payload(workspace, lead),
            **fields,
        }

    def dictionary_item(self, workspace, key, label=None):
        """取（或临时建）某个系统字典的一个值。"""
        from plane.utils.data_dictionary import ensure_system_dictionaries

        ensure_system_dictionaries(workspace)
        dictionary = DataDictionary.objects.get(workspace=workspace, key=key)
        if label is not None:
            return DataDictionaryItem.objects.create(dictionary=dictionary, label=label)
        return dictionary.items.first() or DataDictionaryItem.objects.create(
            dictionary=dictionary, label=f"{key} default"
        )


@pytest.mark.contract
class TestProjectAPIPost(TestProjectBase):
    """Test project POST operations"""

    @pytest.mark.django_db
    def test_create_project_empty_data(self, session_client, workspace):
        """Test creating a project with empty data"""

        url = self.get_project_url(workspace.slug)

        # Test with empty data
        response = session_client.post(url, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_create_project_valid_data(self, session_client, workspace, create_user):
        url = self.get_project_url(workspace.slug)

        user = create_user
        project_data = self.project_payload(workspace, user, name="New Project Test", identifier="NPT")

        # Make the request
        response = session_client.post(url, project_data, format="json")

        # Check response status
        assert response.status_code == status.HTTP_201_CREATED

        # Verify project was created
        assert Project.objects.count() == 1
        project = Project.objects.get(name=project_data["name"])
        assert project.workspace == workspace
        assert project.code == project_data["code"]
        assert str(project.status_id) == project_data["status"]
        assert str(project.project_type_id) == project_data["project_type"]
        assert project.product_manager_id == user.id
        assert str(project.start_date) == project_data["start_date"]
        assert str(project.end_date) == project_data["end_date"]
        assert project.business_unit_id is None

        # 研发产品经理不进 ProjectMember：只有创建者一条成员记录
        assert ProjectMember.objects.count() == 1
        project_member = ProjectMember.objects.filter(project=project, member=user).first()
        assert project_member.role == 20  # Administrator
        assert project_member.is_active is True

        # Verify ProjectUserProperty was created
        assert ProjectUserProperty.objects.filter(project=project, user=user).exists()

        # Verify default states were created
        states = State.objects.filter(project=project)
        assert states.count() == 5
        expected_states = ["Backlog", "Todo", "In Progress", "Done", "Cancelled"]
        state_names = list(states.values_list("name", flat=True))
        assert set(state_names) == set(expected_states)

    @pytest.mark.django_db
    def test_create_project_with_project_lead(self, session_client, workspace, create_user):
        """Test creating project with a different project lead"""
        # Create another user to be project lead
        project_lead = User.objects.create_user(email="lead@example.com", username="projectlead")

        # Add project lead to workspace
        WorkspaceMember.objects.create(workspace=workspace, member=project_lead, role=15)

        url = self.get_project_url(workspace.slug)
        project_data = self.project_payload(
            workspace, create_user, name="Project with Lead", identifier="PWL", project_lead=project_lead.id
        )

        response = session_client.post(url, project_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        # Verify both creator and project lead are administrators
        project = Project.objects.get(name=project_data["name"])
        assert ProjectMember.objects.filter(project=project, role=20).count() == 2

        # Verify both have ProjectUserProperty
        assert ProjectUserProperty.objects.filter(project=project).count() == 2

    @pytest.mark.django_db
    def test_create_project_creates_default_bug_workflow(self, session_client, workspace):
        url = self.get_project_url(workspace.slug)
        project_data = self.project_payload(
            workspace, workspace.owner, name="Project With Bug Workflow", identifier="PWB"
        )

        response = session_client.post(url, project_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        project = Project.objects.get(name=project_data["name"])
        workflow = Workflow.objects.get(
            project=project,
            issue_type__name="缺陷",
            is_active=True,
        )

        assert workflow.name == "缺陷默认工作流"

        transitions = WorkflowTransition.objects.filter(workflow=workflow)
        assert transitions.count() == 10
        assert transitions.filter(approval_type=ApprovalType.ALL).count() == 10

        transition_pairs = set(
            transitions.values_list("from_state__name", "to_state__name")
        )
        expected_pairs = {
            ("Open", "Fixed"),
            ("Open", "Pending-Reject"),
            ("Fixed", "Reopen"),
            ("Fixed", "Closed"),
            ("Pending-Reject", "Rejected"),
            ("Pending-Reject", "Closed"),
            ("Pending-Reject", "Suspend"),
            ("Pending-Reject", "Reopen"),
            ("Suspend", "Closed"),
            ("Suspend", "Reopen"),
        }
        assert transition_pairs == expected_pairs

    @pytest.mark.django_db
    def test_create_project_guest_forbidden(self, session_client, workspace):
        """Test that guests cannot create projects"""
        guest_user = User.objects.create_user(email="guest@example.com", username="guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest_user, role=5)

        session_client.force_authenticate(user=guest_user)

        url = self.get_project_url(workspace.slug)
        project_data = {
            "name": "Guest Project",
            "identifier": "GP",
        }

        response = session_client.post(url, project_data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Project.objects.count() == 0

    @pytest.mark.django_db
    def test_create_project_unauthenticated(self, client, workspace):
        """Test unauthenticated access"""
        url = self.get_project_url(workspace.slug)
        project_data = {
            "name": "Unauth Project",
            "identifier": "UP",
        }

        response = client.post(url, project_data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_create_project_duplicate_name(self, session_client, workspace, create_user):
        """Test creating project with duplicate name"""
        # Create first project
        Project.objects.create(name="Duplicate Name", identifier="DN1", workspace=workspace)

        url = self.get_project_url(workspace.slug)
        project_data = self.project_payload(workspace, create_user, name="Duplicate Name", identifier="DN2")

        response = session_client.post(url, project_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["name"] == ["PROJECT_NAME_ALREADY_EXIST"]

    @pytest.mark.django_db
    def test_create_project_duplicate_identifier(self, session_client, workspace, create_user):
        """Test creating project with duplicate identifier"""
        Project.objects.create(name="First Project", identifier="DUP", workspace=workspace)

        url = self.get_project_url(workspace.slug)
        project_data = self.project_payload(workspace, create_user, name="Second Project", identifier="DUP")

        response = session_client.post(url, project_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["identifier"] == ["PROJECT_IDENTIFIER_ALREADY_EXIST"]

    @pytest.mark.django_db
    def test_create_project_duplicate_code(self, session_client, workspace, create_user):
        """代号工作区内唯一；strip 之后再查重"""
        Project.objects.create(name="Coded", identifier="CD1", workspace=workspace, code="SAME")

        url = self.get_project_url(workspace.slug)
        for code in ("SAME", "  SAME  "):
            project_data = self.project_payload(workspace, create_user, name=f"Other {code!r}", identifier="CD2", code=code)
            response = session_client.post(url, project_data, format="json")
            assert response.status_code == status.HTTP_400_BAD_REQUEST
            assert response.json()["code"] == ["PROJECT_CODE_ALREADY_EXIST"]

    @pytest.mark.django_db
    def test_create_project_dictionary_item_must_match_field_and_workspace(
        self, session_client, workspace, create_user
    ):
        """字典值必须来自对应的系统字典，且属于本工作区"""
        url = self.get_project_url(workspace.slug)

        # 把「项目状态」的值塞进 project_type
        status_item = self.dictionary_item(workspace, "project_status")
        project_data = self.project_payload(
            workspace, create_user, name="Wrong Dict", identifier="WD", project_type=str(status_item.id)
        )
        response = session_client.post(url, project_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["project_type"] == ["PROJECT_DICTIONARY_ITEM_INVALID"]

        # 另一个工作区的「项目状态」值
        from plane.db.models import Workspace

        other_workspace = Workspace.objects.create(name="Other", slug="other-ws", owner=create_user)
        foreign_item = self.dictionary_item(other_workspace, "project_status")
        project_data = self.project_payload(
            workspace, create_user, name="Foreign Dict", identifier="FD", status=str(foreign_item.id)
        )
        response = session_client.post(url, project_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["status"] == ["PROJECT_DICTIONARY_ITEM_INVALID"]

    @pytest.mark.django_db
    def test_create_project_product_manager_must_be_workspace_member(
        self, session_client, workspace, create_user
    ):
        outsider = User.objects.create_user(email="outsider@example.com", username="outsider")

        url = self.get_project_url(workspace.slug)
        project_data = self.project_payload(
            workspace, create_user, name="PM Outsider", identifier="PMO", product_manager=str(outsider.id)
        )
        response = session_client.post(url, project_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["product_manager"] == ["PROJECT_PRODUCT_MANAGER_NOT_WORKSPACE_MEMBER"]

    @pytest.mark.django_db
    def test_create_project_missing_required_fields(self, session_client, workspace, create_user):
        """Test validation with missing required fields"""
        url = self.get_project_url(workspace.slug)
        full = self.project_payload(workspace, create_user, name="Required", identifier="RQ")

        # 逐个抠掉必填字段，错误必须落在对应的 key 上
        for field in (
            "name",
            "identifier",
            "code",
            "status",
            "project_type",
            "product_manager",
            "start_date",
            "end_date",
        ):
            payload = {k: v for k, v in full.items() if k != field}
            response = session_client.post(url, payload, format="json")
            assert response.status_code == status.HTTP_400_BAD_REQUEST, field
            assert field in response.json(), field

        # 必填字典字段显式 null 也拒绝
        response = session_client.post(url, {**full, "status": None}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "status" in response.json()

        # business_unit 选填：缺省 / 显式 null 都能建
        response = session_client.post(url, {**full, "business_unit": None}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["business_unit"] is None
        assert Project.objects.count() == 1

    @pytest.mark.django_db
    def test_create_project_with_all_optional_fields(self, session_client, workspace, create_user):
        """Test creating project with all optional fields"""
        url = self.get_project_url(workspace.slug)
        business_unit = self.dictionary_item(workspace, "project_business_unit", label="BU-A")
        project_data = self.project_payload(
            workspace,
            create_user,
            name="Full Project",
            identifier="FP",
            description="A comprehensive test project",
            network=2,
            cycle_view=True,
            issue_views_view=False,
            module_view=True,
            page_view=False,
            inbox_view=True,
            guest_view_all_features=True,
            logo_props={
                "in_use": "emoji",
                "emoji": {"value": "🚀", "unicode": "1f680"},
            },
            business_unit=str(business_unit.id),
        )

        response = session_client.post(url, project_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        response_data = response.json()
        assert response_data["description"] == project_data["description"]
        assert response_data["network"] == project_data["network"]
        # 0348 扩展字段：裸 id + *_detail
        assert response_data["code"] == project_data["code"]
        assert response_data["business_unit"] == str(business_unit.id)
        assert response_data["business_unit_detail"]["label"] == "BU-A"
        assert response_data["status_detail"]["id"] == project_data["status"]
        assert response_data["project_type_detail"]["id"] == project_data["project_type"]
        assert response_data["product_manager_detail"]["id"] == str(create_user.id)
        assert response_data["start_date"] == project_data["start_date"]
        assert response_data["end_date"] == project_data["end_date"]


@pytest.mark.contract
class TestProjectAPIGet(TestProjectBase):
    """Test project GET operations"""

    @pytest.mark.django_db
    def test_list_projects_authenticated_admin(self, session_client, workspace, create_user):
        """Test listing projects as workspace admin"""
        # Create a project
        project = Project.objects.create(name="Test Project", identifier="TP", workspace=workspace)

        # Add user as project member
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        url = self.get_project_url(workspace.slug)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test Project"
        assert data[0]["identifier"] == "TP"
        # ORM 直建没给 code：save() 回落 name；list() 的 values() 白名单要带上新字段
        assert data[0]["code"] == "Test Project"
        assert data[0]["status"] is None
        assert data[0]["start_date"] is None

    @pytest.mark.django_db
    def test_list_projects_authenticated_guest(self, session_client, workspace):
        """Test listing projects as workspace guest"""
        # Create a guest user
        guest_user = User.objects.create_user(email="guest@example.com", username="guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest_user, role=5, is_active=True)

        # Create projects
        project1 = Project.objects.create(name="Project 1", identifier="P1", workspace=workspace)

        Project.objects.create(name="Project 2", identifier="P2", workspace=workspace)

        # Add guest to only one project
        ProjectMember.objects.create(project=project1, member=guest_user, role=10, is_active=True)

        session_client.force_authenticate(user=guest_user)

        url = self.get_project_url(workspace.slug)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # Guest should only see projects they're members of
        assert len(data) == 1
        assert data[0]["name"] == "Project 1"

    @pytest.mark.django_db
    def test_list_projects_unauthenticated(self, client, workspace):
        """Test listing projects without authentication"""
        url = self.get_project_url(workspace.slug)
        response = client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_list_detail_projects(self, session_client, workspace, create_user):
        """Test listing projects with detailed information"""
        # Create a project
        project = Project.objects.create(
            name="Detailed Project",
            identifier="DP",
            workspace=workspace,
            description="A detailed test project",
        )

        # Add user as project member
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        url = self.get_project_url(workspace.slug, details=True)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Detailed Project"
        assert data[0]["description"] == "A detailed test project"
        assert data[0]["code"] == "Detailed Project"
        assert data[0]["status_detail"] is None

    @pytest.mark.django_db
    def test_retrieve_project_success(self, session_client, workspace, create_user):
        """Test retrieving a specific project"""
        # Create a project
        project = Project.objects.create(
            name="Retrieve Test Project",
            identifier="RTP",
            workspace=workspace,
            description="Test project for retrieval",
        )

        # Add user as project member
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        url = self.get_project_url(workspace.slug, pk=project.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Retrieve Test Project"
        assert data["identifier"] == "RTP"
        assert data["description"] == "Test project for retrieval"
        assert data["code"] == "Retrieve Test Project"
        assert data["product_manager_detail"] is None

    @pytest.mark.django_db
    def test_retrieve_project_not_found(self, session_client, workspace, create_user):
        """Test retrieving a non-existent project"""
        fake_uuid = uuid.uuid4()
        url = self.get_project_url(workspace.slug, pk=fake_uuid)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_retrieve_archived_project(self, session_client, workspace, create_user):
        """Test retrieving an archived project"""
        # Create an archived project
        project = Project.objects.create(
            name="Archived Project",
            identifier="AP",
            workspace=workspace,
            archived_at=timezone.now(),
        )

        # Add user as project member
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        url = self.get_project_url(workspace.slug, pk=project.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
class TestProjectAPIPatchDelete(TestProjectBase):
    """Test project PATCH, and DELETE operations"""

    @pytest.mark.django_db
    def test_partial_update_project_success(self, session_client, workspace, create_user):
        """Test successful partial update of project"""
        # 走接口创建：ORM 直建的项目没有 create_default_role 的细粒度权限行，PATCH 会 403
        create_response = session_client.post(
            self.get_project_url(workspace.slug),
            self.project_payload(
                workspace, create_user, name="Original Project", identifier="OP", description="Original description"
            ),
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        project = Project.objects.get(id=create_response.json()["id"])

        url = self.get_project_url(workspace.slug, pk=project.id)
        status_item = self.dictionary_item(workspace, "project_status")
        # PATCH 可以只带一部分字段：其它必填字段（code / project_type / …）省略不报错
        update_data = {
            "name": "Updated Project",
            "description": "Updated description",
            "cycle_view": True,
            "module_view": False,
            "status": str(status_item.id),
        }

        response = session_client.patch(url, update_data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status_detail"]["label"] == status_item.label

        # Verify project was updated
        project.refresh_from_db()
        assert project.name == "Updated Project"
        assert project.description == "Updated description"
        assert project.cycle_view is True
        assert project.module_view is False
        assert project.status_id == status_item.id

    @pytest.mark.django_db
    def test_partial_update_code_conflict_and_null_rejected(self, session_client, workspace, create_user):
        """代号重复 400；必填字段显式 null / 空串 400"""
        Project.objects.create(name="Project One", identifier="P1", workspace=workspace)
        # 走接口创建（同 test_partial_update_project_success）
        create_response = session_client.post(
            self.get_project_url(workspace.slug),
            self.project_payload(workspace, create_user, name="Project Two", identifier="P2", code="Project Two"),
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        project2 = Project.objects.get(id=create_response.json()["id"])

        url = self.get_project_url(workspace.slug, pk=project2.id)

        response = session_client.patch(url, {"code": "Project One"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == ["PROJECT_CODE_ALREADY_EXIST"]

        response = session_client.patch(url, {"code": ""}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "code" in response.json()

        response = session_client.patch(url, {"status": None}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "status" in response.json()

        project2.refresh_from_db()
        assert project2.code == "Project Two"

    @pytest.mark.django_db
    def test_partial_update_project_forbidden_non_admin(self, session_client, workspace):
        """Test that non-admin project members cannot update project"""
        # Create a project
        project = Project.objects.create(name="Protected Project", identifier="PP", workspace=workspace)

        # Create a member user (not admin)
        member_user = User.objects.create_user(email="member@example.com", username="member")
        WorkspaceMember.objects.create(workspace=workspace, member=member_user, role=15, is_active=True)
        ProjectMember.objects.create(project=project, member=member_user, role=15, is_active=True)

        session_client.force_authenticate(user=member_user)

        url = self.get_project_url(workspace.slug, pk=project.id)
        update_data = {"name": "Hacked Project"}

        response = session_client.patch(url, update_data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_partial_update_duplicate_name_conflict(self, session_client, workspace, create_user):
        """Test updating project with duplicate name returns conflict"""
        # Create two projects
        Project.objects.create(name="Project One", identifier="P1", workspace=workspace)
        project2 = Project.objects.create(name="Project Two", identifier="P2", workspace=workspace)

        ProjectMember.objects.create(project=project2, member=create_user, role=20, is_active=True)

        url = self.get_project_url(workspace.slug, pk=project2.id)
        update_data = {"name": "Project One"}  # Duplicate name

        response = session_client.patch(url, update_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_partial_update_duplicate_identifier_conflict(self, session_client, workspace, create_user):
        """Test updating project with duplicate identifier returns conflict"""
        # Create two projects
        Project.objects.create(name="Project One", identifier="P1", workspace=workspace)
        project2 = Project.objects.create(name="Project Two", identifier="P2", workspace=workspace)

        ProjectMember.objects.create(project=project2, member=create_user, role=20, is_active=True)

        url = self.get_project_url(workspace.slug, pk=project2.id)
        update_data = {"identifier": "P1"}  # Duplicate identifier

        response = session_client.patch(url, update_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_partial_update_invalid_data(self, session_client, workspace, create_user):
        """Test partial update with invalid data"""
        project = Project.objects.create(name="Valid Project", identifier="VP", workspace=workspace)

        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        url = self.get_project_url(workspace.slug, pk=project.id)
        update_data = {"name": ""}

        response = session_client.patch(url, update_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_delete_project_success_project_admin(self, session_client, workspace, create_user):
        """Test successful project deletion by project admin"""
        project = Project.objects.create(name="Delete Me", identifier="DM", workspace=workspace)

        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        url = self.get_project_url(workspace.slug, pk=project.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Project.objects.filter(id=project.id).exists()

    @pytest.mark.django_db
    def test_delete_project_success_workspace_admin(self, session_client, workspace):
        """Test successful project deletion by workspace admin"""
        # Create workspace admin user
        workspace_admin = User.objects.create_user(email="admin@example.com", username="admin")
        WorkspaceMember.objects.create(workspace=workspace, member=workspace_admin, role=20, is_active=True)

        project = Project.objects.create(name="Delete Me", identifier="DM", workspace=workspace)

        session_client.force_authenticate(user=workspace_admin)

        url = self.get_project_url(workspace.slug, pk=project.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Project.objects.filter(id=project.id).exists()

    @pytest.mark.django_db
    def test_delete_project_forbidden_non_admin(self, session_client, workspace):
        """Test that non-admin users cannot delete projects"""
        # Create a member user (not admin)
        member_user = User.objects.create_user(email="member@example.com", username="member")
        WorkspaceMember.objects.create(workspace=workspace, member=member_user, role=15, is_active=True)

        project = Project.objects.create(name="Protected Project", identifier="PP", workspace=workspace)

        ProjectMember.objects.create(project=project, member=member_user, role=15, is_active=True)

        session_client.force_authenticate(user=member_user)

        url = self.get_project_url(workspace.slug, pk=project.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Project.objects.filter(id=project.id).exists()

    @pytest.mark.django_db
    def test_delete_project_unauthenticated(self, client, workspace):
        """Test unauthenticated project deletion"""
        project = Project.objects.create(name="Protected Project", identifier="PP", workspace=workspace)

        url = self.get_project_url(workspace.slug, pk=project.id)
        response = client.delete(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert Project.objects.filter(id=project.id).exists()
