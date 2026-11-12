from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.core.exceptions import ValidationError

from plane.utils.field_linkage import evaluate_linkage, validate_graph, remap_linkage, bind_library_dependencies


def field(key, *, linkage=None, required=False, active=True, choices=None):
    return SimpleNamespace(id=key, name=key, field_type="select", is_active=active, is_required=required,
                           options={"choices": choices or ["1", "2", "7", "8", "9"]}, linkage=linkage or {})


def vis(source, values):
    return {"visibility": {"rules": [{"conditions": [{"field_id": source, "values": values}]}]}}


def opts(source, mappings):
    return {"options": {"rules": [
        {"conditions": [{"field_id": source, "values": [key]}], "options": targets} for key, targets in mappings.items()
    ]}}


def source_of(linkage, kind="visibility"):
    return linkage[kind]["rules"][0]["conditions"][0]["field_id"]


def test_visibility_cascade_and_multilevel_cleanup():
    fields = [field("c", linkage=vis("b", ["7"])),
              field("b", linkage=opts("a", {"1": ["7", "8"], "2": ["9"]})), field("a")]
    normalized, visible, allowed = evaluate_linkage(fields, {"a": "2", "b": "7", "c": "8"})
    assert normalized == {"a": "2", "b": None, "c": None}
    assert visible == {"a", "b"}
    assert allowed["b"] == {"9"}


def test_multiselect_union_and_unmatched_source():
    fields = [field("a"), field("b", linkage=opts("a", {"1": ["7"], "2": ["8"]}))]
    result, _, _ = evaluate_linkage(fields, {"a": ["1", "2"], "b": ["7", "8", "9"]})
    assert result["b"] == ["7", "8"]
    result, _, allowed = evaluate_linkage(fields, {"b": "7"})
    assert result["b"] is None and allowed["b"] == set()


@pytest.mark.parametrize("rules", [None, [], {"unknown": {}}, vis("missing", ["1"]), vis("a", []),
    opts("a", {"1": ["bad"]}), {"visibility": {"field_id": "a", "values": ["1"]}}, {"visibility": {"rules": []}}])
def test_invalid_rules(rules):
    target = field("b")
    target.linkage = rules
    with pytest.raises(ValidationError):
        validate_graph([field("a"), target])


def test_cycles_and_source_deactivation():
    a = field("a", linkage=vis("b", ["1"]))
    b = field("b", linkage=vis("a", ["1"]))
    with pytest.raises(ValidationError, match="循环"):
        validate_graph([a, b])
    a.linkage = {}
    a.is_active = False
    with pytest.raises(ValidationError, match="启用"):
        validate_graph([a, b])


def test_copy_does_not_mutate_original():
    original = vis("a", ["1"])
    assert source_of(remap_linkage(original, {"a": "copy"})) == "copy"
    assert source_of(original) == "a"


@pytest.fixture
def context(create_user):
    from plane.db.models import Workspace, Project, IssueType
    workspace = Workspace.objects.create(name="Linkage", slug=f"linkage-{uuid4().hex}", owner=create_user)
    project = Project.objects.create(name="Linkage", identifier="LNK", workspace=workspace)
    issue_type = IssueType.objects.create(name="Task", scheme_id=project.issue_scheme_id)
    return workspace, project, issue_type


@pytest.mark.django_db
def test_library_binding_sync_and_conflict_rollback(context):
    from plane.db.models import IssueFieldDefinition, TypeExtraField
    workspace, _, issue_type = context
    a = IssueFieldDefinition.objects.create(workspace=workspace, name="A", field_type="select", options={"choices": ["1", "2"]})
    b = IssueFieldDefinition.objects.create(workspace=workspace, name="B", linkage=vis(str(a.id), ["1"]))
    created = bind_library_dependencies(issue_type, [b.id])
    assert len(created) == 2
    bound_a = TypeExtraField.objects.get(issue_type=issue_type, library_field=a)
    bound_b = TypeExtraField.objects.get(issue_type=issue_type, library_field=b)
    assert source_of(bound_b.linkage) == str(bound_a.id)
    assert bind_library_dependencies(issue_type, [b.id]) == []
    c = IssueFieldDefinition.objects.create(workspace=workspace, name="C", field_type="select", options={"choices": ["1"]})
    TypeExtraField.objects.create(issue_type=issue_type, name="C")
    b.linkage = vis(str(c.id), ["1"])
    with pytest.raises(ValidationError, match="同名"):
        b.save()
    b.refresh_from_db()
    assert source_of(b.linkage) == str(a.id)


@pytest.mark.django_db
def test_patch_and_hidden_required(context):
    from plane.db.models import TypeExtraField
    from plane.utils.extra_field_value import validate_extra_field_values
    _, project, issue_type = context
    a = TypeExtraField.objects.create(issue_type=issue_type, name="A", field_type="select", options={"choices": ["1", "2"]})
    b = TypeExtraField.objects.create(issue_type=issue_type, name="B", is_required=True,
        linkage=vis(str(a.id), ["1"]))
    common = {"project_id": str(project.id), "issue_type_id": str(issue_type.id)}
    _, errors = validate_extra_field_values([{"extra_field_id": str(a.id), "value": "2"}], **common)
    assert not errors
    _, errors = validate_extra_field_values([{"extra_field_id": str(a.id), "value": "1"}], **common)
    assert str(b.id) in errors
    items, errors = validate_extra_field_values([{"extra_field_id": str(a.id), "value": "2"}], require_all=False,
        existing_values={str(a.id): "1", str(b.id): "filled"}, **common)
    assert not errors
    assert dict((str(f.id), v) for f, v in items)[str(b.id)] is None
    _, errors = validate_extra_field_values([{"extra_field_id": str(b.id), "value": ""}], require_all=False,
        existing_values={str(a.id): "1", str(b.id): "filled"}, **common)
    assert str(b.id) in errors
    b.field_type = "user"
    b.save()
    _, errors = validate_extra_field_values([
        {"extra_field_id": str(a.id), "value": "2"},
        {"extra_field_id": str(b.id), "value": "not-a-user-id"},
    ], **common)
    assert not errors


@pytest.mark.django_db
def test_copy_and_library_new_dependency_sync(context):
    from plane.db.models import IssueFieldDefinition, IssueScheme, TypeExtraField
    from plane.utils.issue_scheme import copy_scheme
    workspace, project, issue_type = context
    a = IssueFieldDefinition.objects.create(workspace=workspace, name="Source", field_type="select", options={"choices": ["yes"]})
    b = IssueFieldDefinition.objects.create(workspace=workspace, name="Target")
    bind_library_dependencies(issue_type, [b.id])
    b.linkage = vis(str(a.id), ["yes"])
    b.save()
    bound_a = TypeExtraField.objects.get(issue_type=issue_type, library_field=a)
    bound_b = TypeExtraField.objects.get(issue_type=issue_type, library_field=b)
    assert source_of(bound_b.linkage) == str(bound_a.id)
    from plane.db.models import Project
    target_project = Project.objects.create(workspace=workspace, name="Copy", identifier="CPY")
    target = IssueScheme.objects.create(workspace=workspace, project=target_project, name="Copy")
    ids = copy_scheme(project.issue_scheme, target, type_ids=[issue_type.id])
    copied = TypeExtraField.objects.get(pk=ids[bound_b.id])
    assert source_of(copied.linkage) == str(ids[bound_a.id])


@pytest.mark.django_db
def test_scope_and_incoming_option_validation(context):
    from plane.db.models import IssueFieldDefinition, TypeExtraField
    from plane.app.serializers.issue_type import TypeExtraFieldSerializer
    workspace, project, issue_type = context
    library_a = IssueFieldDefinition.objects.create(workspace=workspace, name="Source", field_type="select", options={"choices": ["yes"]})
    serializer = TypeExtraFieldSerializer(data={"issue_type_id": str(issue_type.id), "name": "Bad",
        "linkage": vis(str(library_a.id), ["yes"])},
        context={"project_id": str(project.id)})
    assert not serializer.is_valid()
    assert "linkage" in serializer.errors
    a = TypeExtraField.objects.create(issue_type=issue_type, name="A", field_type="select", options={"choices": ["yes"]})
    TypeExtraField.objects.create(issue_type=issue_type, name="B", linkage=vis(str(a.id), ["yes"]))
    a.options = {"choices": ["no"]}
    with pytest.raises(ValidationError, match="无效选项"):
        a.save()


@pytest.mark.django_db
def test_workflow_required_uses_effective_visibility(context):
    from plane.db.models import Issue, TypeExtraField, TypeExtraFieldValue
    from plane.utils.extra_field_value import get_missing_required_extra_fields
    workspace, project, issue_type = context
    a = TypeExtraField.objects.create(issue_type=issue_type, name="A", field_type="select", options={"choices": ["yes", "no"]})
    b = TypeExtraField.objects.create(issue_type=issue_type, name="B", is_required=True,
        linkage=vis(str(a.id), ["yes"]))
    issue = Issue.objects.create(project=project, workspace=workspace, type=issue_type, name="Test linkage")
    TypeExtraFieldValue.objects.create(issue=issue, project=project, workspace=workspace, extra_field=a, value="no")
    assert get_missing_required_extra_fields(issue) == []
    assert [f.id for f in get_missing_required_extra_fields(issue, {str(a.id): "yes"})] == [b.id]
    from plane.db.models import State, Workflow, WorkflowTransition, WorkflowTransitionRequiredField
    from plane.utils.workflow.transition import _evaluate_required_fields
    b.is_required = False
    b.save()
    state = State.objects.create(scheme_id=issue_type.scheme_id, issue_type=issue_type, name="Done", color="#60646C")
    workflow = Workflow.objects.create(issue_type=issue_type, name="Linkage workflow")
    start = State.objects.create(scheme_id=issue_type.scheme_id, issue_type=issue_type, name="Start", color="#60646C")
    transition = WorkflowTransition.objects.create(workflow=workflow, from_state=start, to_state=state)
    WorkflowTransitionRequiredField.objects.create(workflow=transition, extra_field=b)
    assert _evaluate_required_fields(transition, issue) == (True, None)
    assert _evaluate_required_fields(transition, issue, {str(a.id): "yes"})[0] is False
    assert _evaluate_required_fields(transition, issue, {str(a.id): "yes", str(b.id): "filled"}) == (True, None)



@pytest.mark.django_db
def test_library_edit_does_not_restore_removed_bindings(context):
    from plane.db.models import IssueFieldDefinition, TypeExtraField
    workspace, _, issue_type = context
    definition = IssueFieldDefinition.objects.create(workspace=workspace, name="Removed")
    row = bind_library_dependencies(issue_type, [definition.id])[0]
    row.delete()
    definition.description = "updated"
    definition.save()
    assert not TypeExtraField.objects.filter(issue_type=issue_type, library_field=definition).exists()
