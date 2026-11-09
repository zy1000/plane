from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.core.exceptions import ValidationError

from plane.utils.issue_type_layout import remap_field_layout, validate_field_layout


def make_field(key="a", required=False):
    return SimpleNamespace(id=key, name=key, is_active=True, is_required=required)


def make_layout(*ids, mode="tabs"):
    return {
        "version": 1,
        "mode": mode,
        "pages": [{"id": "discovery", "name": "发现与复现", "groups": [{
            "id": "environment", "name": "发现信息", "columns": 2,
            "collapsible": True, "default_collapsed": False,
            "fields": [{"field_id": key, "width": "auto", "contexts": ["create", "edit", "detail"]} for key in ids],
        }]}],
    }


@pytest.mark.parametrize("mode", ["sections", "tabs", "sidebar"])
def test_all_modes_preserve_the_same_field_contract(mode):
    layout = make_layout("a", "b", mode=mode)
    layout["pages"][0]["groups"][0]["fields"][1]["width"] = "full"
    original = deepcopy(layout)
    validate_field_layout(layout, [make_field("a", True), make_field("b")])
    assert layout == original


def test_unconfigured_type_automatically_displays_new_fields():
    validate_field_layout({}, [make_field("new", True)])


@pytest.mark.parametrize("layout", [None, [], "tabs", {"version": True}, {"version": 1, "mode": []}, {"version": 1, "mode": "tabs", "pages": []}])
def test_malformed_layout_returns_validation_error(layout):
    with pytest.raises(ValidationError):
        validate_field_layout(layout, [])


def test_rejects_foreign_and_repeated_fields_and_missing_placements():
    for layout in [make_layout("foreign"), make_layout("a", "a"), make_layout()]:
        with pytest.raises(ValidationError):
            validate_field_layout(layout, [make_field()])


@pytest.mark.parametrize("contexts", [["detail"], ["create"], [], ["create", "create"], ["unknown"], [[]]])
def test_required_field_cannot_become_unreachable(contexts):
    layout = make_layout("a")
    layout["pages"][0]["groups"][0]["fields"][0]["contexts"] = contexts
    with pytest.raises(ValidationError):
        validate_field_layout(layout, [make_field(required=True)])


@pytest.mark.parametrize("patch", [{"columns": True}, {"columns": 4}, {"collapsible": False, "default_collapsed": True}, {"name": "  "}, {"id": "__reserved"}])
def test_group_settings_are_validated(patch):
    layout = make_layout("a")
    layout["pages"][0]["groups"][0].update(patch)
    with pytest.raises(ValidationError):
        validate_field_layout(layout, [make_field()])


def test_duplicate_group_identifiers_and_invalid_width():
    layout = make_layout("a")
    layout["pages"][0]["groups"].append(deepcopy(layout["pages"][0]["groups"][0]))
    with pytest.raises(ValidationError, match="标识不能重复"):
        validate_field_layout(layout, [make_field()])
    layout = make_layout("a")
    layout["pages"][0]["groups"][0]["fields"][0]["width"] = {}
    with pytest.raises(ValidationError, match="宽度"):
        validate_field_layout(layout, [make_field()])


def test_copy_remaps_bindings_without_mutating_shared_library_layout():
    original = make_layout("a", "deleted")
    copied = remap_field_layout(original, {"a": "new-a"})
    assert copied["pages"][0]["groups"][0]["fields"] == [{"field_id": "new-a", "width": "auto", "contexts": ["create", "edit", "detail"]}]
    assert original["pages"][0]["groups"][0]["fields"][0]["field_id"] == "a"
    assert len(original["pages"][0]["groups"][0]["fields"]) == 2


@pytest.mark.django_db
def test_serializer_and_scheme_copy_use_type_scoped_bindings(create_user):
    from plane.app.serializers.issue_type import IssueTypeSerializer
    from plane.db.models import IssueScheme, IssueType, Project, TypeExtraField, Workspace
    from plane.utils.issue_scheme import copy_scheme

    workspace = Workspace.objects.create(name="Layout", slug=f"layout-{uuid4().hex}", owner=create_user)
    project = Project.objects.create(workspace=workspace, name="Source", identifier="SRC")
    issue_type = IssueType.objects.create(scheme=project.issue_scheme, name="Layout Bug")
    field = TypeExtraField.objects.create(issue_type=issue_type, name="Environment", is_required=True)
    serializer = IssueTypeSerializer(issue_type, data={"field_layout": make_layout(str(field.id))}, partial=True)
    assert serializer.is_valid(), serializer.errors
    serializer.save()
    assert serializer.data["field_layout"]["mode"] == "tabs"

    foreign_type = IssueType.objects.create(scheme=project.issue_scheme, name="Other")
    foreign = TypeExtraField.objects.create(issue_type=foreign_type, name="Foreign")
    serializer = IssueTypeSerializer(issue_type, data={"field_layout": make_layout(str(foreign.id))}, partial=True)
    assert not serializer.is_valid()
    assert "field_layout" in serializer.errors

    target = Project.objects.create(workspace=workspace, name="Copy", identifier="CPY")
    target_scheme = IssueScheme.objects.create(workspace=workspace, project=target, name="Copy layout")
    ids = copy_scheme(project.issue_scheme, target_scheme, type_ids=[issue_type.id])
    copied = IssueType.objects.get(pk=ids[issue_type.id])
    assert copied.field_layout["pages"][0]["groups"][0]["fields"][0]["field_id"] == str(ids[field.id])
    issue_type.refresh_from_db()
    assert issue_type.field_layout["pages"][0]["groups"][0]["fields"][0]["field_id"] == str(field.id)

    # Deleting a field does not block unrelated edits on a type whose layout still contains its old placement.
    field.delete(soft=False)
    issue_type.name = "Renamed"
    issue_type.save()
    issue_type.refresh_from_db()
    assert issue_type.name == "Renamed"
