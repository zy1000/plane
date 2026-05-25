import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from plane.db.models import Project, ProjectMember, WorkspaceMember
from plane.db.models.project import ROLE


@pytest.mark.unit
@pytest.mark.django_db
class TestIssueImportPermissions:
    def test_bulk_import_denied_for_non_project_member(self, session_client, workspace, create_user):
        outsider = type(create_user).objects.create(
            email="outsider@example.com",
            username="outsider",
            first_name="Out",
            last_name="Sider",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=outsider, role=ROLE.MEMBER.value)

        project = Project.objects.create(
            name="Import Project",
            identifier="IMP",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(
            workspace=workspace,
            project=project,
            member=create_user,
            role=ROLE.ADMIN.value,
        )

        session_client.force_authenticate(user=outsider)
        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue/bulk-import/"
        response = session_client.post(
            url,
            data={
                "file": SimpleUploadedFile(
                    "import.xlsx",
                    b"not-a-real-xlsx",
                    content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ),
                "mapping": "{}",
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_bulk_import_allowed_for_project_member(self, session_client, workspace, create_user):
        project = Project.objects.create(
            name="Import Project",
            identifier="IMP2",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(
            workspace=workspace,
            project=project,
            member=create_user,
            role=ROLE.MEMBER.value,
        )

        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue/bulk-import/"
        response = session_client.post(
            url,
            data={
                "file": SimpleUploadedFile(
                    "import.xlsx",
                    b"not-a-real-xlsx",
                    content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ),
                "mapping": "{}",
            },
            format="multipart",
        )

        assert response.status_code != status.HTTP_403_FORBIDDEN
