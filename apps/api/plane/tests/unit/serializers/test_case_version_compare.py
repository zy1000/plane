import pytest
from rest_framework import status

from plane.db.models import Project, TestCase, TestCaseRepository, TestCaseVersion


@pytest.mark.unit
class TestCaseVersionCompareCurrent:
    @pytest.mark.django_db
    def test_compare_current_case_with_history_version(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Test Project", identifier="TST", workspace=workspace)
        repo = TestCaseRepository.objects.create(name="Repo", description="", workspace=workspace, project=project)
        case = TestCase.objects.create(name="Case A", repository=repo)

        TestCaseVersion.create_from_case(case)

        case.name = "Case A (edited)"
        case.save()

        url = f"/api/workspaces/{workspace.slug}/test/case/version/compare/"
        resp = session_client.get(url, {"case_id": str(case.id), "from_version": 0, "to_version": -1})

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["from_version"] == 0
        assert resp.data["to_version"] == -1

        changed_fields = resp.data.get("changed_fields") or []
        assert any(str(it.get("field")) == "name" for it in changed_fields)

