import pytest

from plane.db.models import IssueType, Project, TypeExtraField, Workspace
from plane.utils.extra_field_value import validate_extra_field_values


@pytest.fixture
def extra_field_context(create_user):
    workspace = Workspace.objects.create(
        name="Extra Field Workspace",
        slug="extra-field-workspace",
        owner=create_user,
    )
    project = Project.objects.create(
        name="Extra Field Project",
        identifier="EFP",
        workspace=workspace,
        created_by=create_user,
    )
    issue_type = IssueType.objects.create(project=project, name="任务")
    return {"project": project, "issue_type": issue_type}


@pytest.mark.unit
@pytest.mark.django_db
def test_create_mode_requires_all_required_extra_fields(extra_field_context):
    project = extra_field_context["project"]
    issue_type = extra_field_context["issue_type"]
    field_a = TypeExtraField.objects.create(
        project=project,
        issue_type=issue_type,
        name="字段 A",
        is_required=True,
    )
    field_b = TypeExtraField.objects.create(
        project=project,
        issue_type=issue_type,
        name="字段 B",
        is_required=True,
    )

    _, errors = validate_extra_field_values(
        raw_values=[{"extra_field_id": str(field_a.id), "value": "已填写"}],
        project_id=str(project.id),
        issue_type_id=str(issue_type.id),
        require_all=True,
    )

    assert str(field_b.id) in errors
    assert "字段 B 为必填字段" in errors[str(field_b.id)]


@pytest.mark.unit
@pytest.mark.django_db
def test_patch_mode_does_not_require_unsubmitted_required_fields(extra_field_context):
    project = extra_field_context["project"]
    issue_type = extra_field_context["issue_type"]
    field_a = TypeExtraField.objects.create(
        project=project,
        issue_type=issue_type,
        name="字段 A",
        is_required=True,
    )
    TypeExtraField.objects.create(
        project=project,
        issue_type=issue_type,
        name="字段 B",
        is_required=True,
    )

    items, errors = validate_extra_field_values(
        raw_values=[{"extra_field_id": str(field_a.id), "value": "已填写"}],
        project_id=str(project.id),
        issue_type_id=str(issue_type.id),
        require_all=False,
    )

    assert errors == {}
    assert [(field.id, value) for field, value in items] == [(field_a.id, "已填写")]


@pytest.mark.unit
@pytest.mark.django_db
def test_patch_mode_rejects_empty_required_field_when_submitted(extra_field_context):
    project = extra_field_context["project"]
    issue_type = extra_field_context["issue_type"]
    field = TypeExtraField.objects.create(
        project=project,
        issue_type=issue_type,
        name="字段 A",
        is_required=True,
    )

    _, errors = validate_extra_field_values(
        raw_values=[{"extra_field_id": str(field.id), "value": ""}],
        project_id=str(project.id),
        issue_type_id=str(issue_type.id),
        require_all=False,
    )

    assert str(field.id) in errors
    assert "字段 A 为必填字段" in errors[str(field.id)]


@pytest.mark.unit
@pytest.mark.django_db
def test_required_boolean_false_is_not_empty(extra_field_context):
    project = extra_field_context["project"]
    issue_type = extra_field_context["issue_type"]
    field = TypeExtraField.objects.create(
        project=project,
        issue_type=issue_type,
        name="是否复现",
        field_type="boolean",
        is_required=True,
    )

    items, errors = validate_extra_field_values(
        raw_values=[{"extra_field_id": str(field.id), "value": False}],
        project_id=str(project.id),
        issue_type_id=str(issue_type.id),
        require_all=True,
    )

    assert errors == {}
    assert [(field.id, value) for field, value in items] == [(field.id, False)]
