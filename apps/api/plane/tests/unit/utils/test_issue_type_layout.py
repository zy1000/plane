from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.core.exceptions import ValidationError

from plane.utils.issue_type_layout import remap_field_layout, validate_field_layout


def make_field(key="a", required=False):
    return SimpleNamespace(id=key, name=key, is_active=True, is_required=required)


def make_placement(key, width=1):
    return {"field_id": key, "width": width, "contexts": ["create", "edit", "detail"]}


def make_group(*ids, key="environment"):
    return {
        "id": key, "name": "发现信息", "columns": 2,
        "collapsible": True, "default_collapsed": False,
        "fields": [make_placement(item) for item in ids],
    }


def make_layout(*ids):
    """没有分组和页面：字段直接排在描述下方。"""
    return {"version": 2, "columns": 4, "fields": [make_placement(key) for key in ids], "groups": [], "pages": []}


def make_grouped_layout(*ids):
    """字段都放在一个页面的一个分组里。"""
    return {
        "version": 2, "columns": 4, "fields": [], "groups": [],
        "pages": [{"id": "discovery", "name": "发现与复现", "columns": 4, "fields": [], "groups": [make_group(*ids)]}],
    }


@pytest.mark.parametrize("build", [make_layout, make_grouped_layout])
def test_flat_and_structured_layouts_share_the_same_field_contract(build):
    layout = build("a", "b")
    original = deepcopy(layout)
    validate_field_layout(layout, [make_field("a", True), make_field("b")])
    assert layout == original


def test_ungrouped_fields_groups_and_pages_can_be_mixed():
    layout = make_layout("a")
    layout["groups"].append(make_group("b", key="root-group"))
    layout["pages"].append({
        "id": "analysis", "name": "分析", "columns": 5,
        "fields": [make_placement("c", "full")], "groups": [make_group("d")],
    })
    validate_field_layout(layout, [make_field(key) for key in "abcd"])


def test_unconfigured_type_automatically_displays_new_fields():
    validate_field_layout({}, [make_field("new", True)])
    # 布局里没有的字段由前端补到描述下方，保存时不要求逐个放置
    validate_field_layout(make_layout("a"), [make_field("a"), make_field("new")])


@pytest.mark.parametrize("layout", [
    None, [], "tabs", {"version": True}, {"version": 1, "mode": "tabs", "pages": []},
    {"version": 2}, {"version": 2, "columns": 4, "fields": [], "groups": []},
    {"version": 2, "columns": 4, "fields": [], "groups": [], "pages": [[]]},
])
def test_malformed_layout_returns_validation_error(layout):
    with pytest.raises(ValidationError):
        validate_field_layout(layout, [])


def test_rejects_foreign_and_repeated_fields():
    repeated_across_areas = make_grouped_layout("a")
    repeated_across_areas["fields"].append(make_placement("a"))
    for layout in [make_layout("foreign"), make_layout("a", "a"), repeated_across_areas]:
        with pytest.raises(ValidationError):
            validate_field_layout(layout, [make_field()])


@pytest.mark.parametrize("contexts", [["detail"], ["create"], [], ["create", "create"], ["unknown"], [[]]])
def test_required_field_cannot_become_unreachable(contexts):
    layout = make_layout("a")
    layout["fields"][0]["contexts"] = contexts
    with pytest.raises(ValidationError):
        validate_field_layout(layout, [make_field(required=True)])


@pytest.mark.parametrize("columns", [1, 2, 3, 4, 5])
def test_each_area_accepts_one_to_five_fields_per_row(columns):
    layout = make_grouped_layout("a")
    layout["columns"] = layout["pages"][0]["columns"] = layout["pages"][0]["groups"][0]["columns"] = columns
    validate_field_layout(layout, [make_field()])


@pytest.mark.parametrize("patch", [{"columns": True}, {"columns": 0}, {"columns": 6}, {"collapsible": False, "default_collapsed": True}, {"name": "  "}, {"id": "__reserved"}])
def test_group_settings_are_validated(patch):
    layout = make_grouped_layout("a")
    layout["pages"][0]["groups"][0].update(patch)
    with pytest.raises(ValidationError):
        validate_field_layout(layout, [make_field()])


@pytest.mark.parametrize("columns", [True, 0, 6, "4", None])
def test_root_and_page_columns_are_validated(columns):
    for target in ("root", "page"):
        layout = make_grouped_layout("a")
        (layout if target == "root" else layout["pages"][0])["columns"] = columns
        with pytest.raises(ValidationError, match="每行字段数"):
            validate_field_layout(layout, [make_field()])


def test_duplicate_group_identifiers_and_invalid_width():
    layout = make_grouped_layout("a")
    layout["groups"].append(make_group(key="environment"))
    with pytest.raises(ValidationError, match="标识不能重复"):
        validate_field_layout(layout, [make_field()])
    for width in [{}, "auto", "half", 0, 5, True]:
        layout = make_layout("a")
        layout["fields"][0]["width"] = width
        with pytest.raises(ValidationError, match="宽度"):
            validate_field_layout(layout, [make_field()])
    for width in [1, 4, "full"]:
        layout = make_layout("a")
        layout["fields"][0]["width"] = width
        validate_field_layout(layout, [make_field()])


def test_copy_remaps_bindings_without_mutating_shared_library_layout():
    original = make_grouped_layout("a", "deleted")
    original["fields"] = [make_placement("b"), make_placement("deleted-too")]
    copied = remap_field_layout(original, {"a": "new-a", "b": "new-b"})
    assert copied["fields"] == [make_placement("new-b")]
    assert copied["pages"][0]["groups"][0]["fields"] == [make_placement("new-a")]
    assert original["pages"][0]["groups"][0]["fields"][0]["field_id"] == "a"
    assert len(original["pages"][0]["groups"][0]["fields"]) == 2
    assert len(original["fields"]) == 2


def test_copy_remaps_layouts_saved_before_groups_became_optional():
    legacy = {"version": 1, "mode": "tabs", "pages": [{"id": "p", "name": "基本信息", "groups": [{
        "id": "g", "name": "自定义字段", "columns": 2, "collapsible": True, "default_collapsed": False,
        "fields": [{"field_id": "a", "width": "auto", "contexts": ["create", "edit", "detail"]}],
    }]}]}
    copied = remap_field_layout(legacy, {"a": "new-a"})
    assert copied["pages"][0]["groups"][0]["fields"][0]["field_id"] == "new-a"
    assert legacy["pages"][0]["groups"][0]["fields"][0]["field_id"] == "a"


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
    assert serializer.data["field_layout"]["version"] == 2

    foreign_type = IssueType.objects.create(scheme=project.issue_scheme, name="Other")
    foreign = TypeExtraField.objects.create(issue_type=foreign_type, name="Foreign")
    serializer = IssueTypeSerializer(issue_type, data={"field_layout": make_layout(str(foreign.id))}, partial=True)
    assert not serializer.is_valid()
    assert "field_layout" in serializer.errors

    target = Project.objects.create(workspace=workspace, name="Copy", identifier="CPY")
    target_scheme = IssueScheme.objects.create(workspace=workspace, project=target, name="Copy layout")
    ids = copy_scheme(project.issue_scheme, target_scheme, type_ids=[issue_type.id])
    copied = IssueType.objects.get(pk=ids[issue_type.id])
    assert copied.field_layout["fields"][0]["field_id"] == str(ids[field.id])
    issue_type.refresh_from_db()
    assert issue_type.field_layout["fields"][0]["field_id"] == str(field.id)

    # Deleting a field does not block unrelated edits on a type whose layout still contains its old placement.
    field.delete(soft=False)
    issue_type.name = "Renamed"
    issue_type.save()
    issue_type.refresh_from_db()
    assert issue_type.name == "Renamed"
