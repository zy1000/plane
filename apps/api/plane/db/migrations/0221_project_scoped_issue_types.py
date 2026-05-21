from collections import defaultdict

from django.db import migrations, models
import django.db.models.deletion


TYPE_FILTER_KEYS = {
    "type",
    "type_id",
    "type_id__in",
    "type_id__exact",
    "issue_type_id",
    "issue_type_id__in",
}


def _as_str(value):
    return str(value) if value is not None else None


def _remap_scalar(value, mapping):
    key = _as_str(value)
    return mapping.get(key, value)


def _remap_filter_value(value, mapping):
    if isinstance(value, list):
        return [_remap_filter_value(item, mapping) for item in value]
    if isinstance(value, tuple):
        return [_remap_filter_value(item, mapping) for item in value]
    if isinstance(value, str) and "," in value:
        return ",".join(
            str(_remap_scalar(item.strip(), mapping)) for item in value.split(",")
        )
    return _remap_scalar(value, mapping)


def _rewrite_filter_json(value, mapping, parent_key=None):
    if not value or not mapping:
        return value

    if isinstance(value, dict):
        rewritten = {}
        for key, child in value.items():
            if key in TYPE_FILTER_KEYS:
                rewritten[key] = _remap_filter_value(child, mapping)
            else:
                rewritten[key] = _rewrite_filter_json(child, mapping, key)
        return rewritten

    if isinstance(value, list):
        return [_rewrite_filter_json(item, mapping, parent_key) for item in value]

    if parent_key in TYPE_FILTER_KEYS:
        return _remap_filter_value(value, mapping)

    return value


def _update_json_fields(model, mapping_by_project, global_mapping):
    fields = [
        field
        for field in ("filters", "display_filters", "rich_filters")
        if hasattr(model, field)
    ]
    if not fields:
        return

    for obj in model._base_manager.all():
        project_id = _as_str(getattr(obj, "project_id", None))
        mapping = (
            mapping_by_project.get(project_id, {}) if project_id else global_mapping
        )
        if not mapping:
            continue

        changed = False
        update_fields = []
        for field in fields:
            current = getattr(obj, field, None)
            rewritten = _rewrite_filter_json(current, mapping)
            if rewritten != current:
                setattr(obj, field, rewritten)
                update_fields.append(field)
                changed = True

        if changed:
            obj.save(update_fields=update_fields)


def _merge_duplicate_state(models_by_name, duplicate_state, keeper_state):
    models_by_name["Issue"]._base_manager.filter(state_id=duplicate_state.id).update(
        state_id=keeper_state.id
    )
    models_by_name["DraftIssue"]._base_manager.filter(
        state_id=duplicate_state.id
    ).update(state_id=keeper_state.id)
    models_by_name["WorkflowTransition"]._base_manager.filter(
        from_state_id=duplicate_state.id
    ).update(from_state_id=keeper_state.id)
    models_by_name["WorkflowTransition"]._base_manager.filter(
        to_state_id=duplicate_state.id
    ).update(to_state_id=keeper_state.id)
    models_by_name["IssueTransitionRecord"]._base_manager.filter(
        from_state_id=duplicate_state.id
    ).update(from_state_id=keeper_state.id)
    models_by_name["IssueTransitionRecord"]._base_manager.filter(
        to_state_id=duplicate_state.id
    ).update(to_state_id=keeper_state.id)
    models_by_name["State"]._base_manager.filter(id=duplicate_state.id).delete()


def _merge_duplicate_property(models_by_name, duplicate_property, keeper_property):
    IssuePropertyValue = models_by_name["IssuePropertyValue"]
    for value in IssuePropertyValue._base_manager.filter(
        property_id=duplicate_property.id
    ):
        existing_value = IssuePropertyValue._base_manager.filter(
            issue_id=value.issue_id,
            property_id=keeper_property.id,
            deleted_at__isnull=True,
        ).first()
        if existing_value:
            IssuePropertyValue._base_manager.filter(id=value.id).delete()
        else:
            IssuePropertyValue._base_manager.filter(id=value.id).update(
                property_id=keeper_property.id
            )
    models_by_name["IssueTypeProperty"]._base_manager.filter(
        id=duplicate_property.id
    ).delete()


def _merge_issue_type_into(models_by_name, ProjectIssueType, duplicate, keeper):
    project_id = duplicate.project_id

    models_by_name["Issue"]._base_manager.filter(
        project_id=project_id, type_id=duplicate.id
    ).update(type_id=keeper.id)
    models_by_name["DraftIssue"]._base_manager.filter(
        project_id=project_id, type_id=duplicate.id
    ).update(type_id=keeper.id)

    State = models_by_name["State"]
    for state in State._base_manager.filter(
        project_id=project_id, issue_type_id=duplicate.id
    ):
        keeper_state = State._base_manager.filter(
            project_id=project_id,
            issue_type_id=keeper.id,
            name=state.name,
            deleted_at__isnull=True,
        ).first()
        if keeper_state:
            _merge_duplicate_state(models_by_name, state, keeper_state)
        else:
            State._base_manager.filter(id=state.id).update(issue_type_id=keeper.id)

    IssueTypeProperty = models_by_name["IssueTypeProperty"]
    for prop in IssueTypeProperty._base_manager.filter(
        project_id=project_id, issue_type_id=duplicate.id
    ):
        keeper_prop = IssueTypeProperty._base_manager.filter(
            project_id=project_id,
            issue_type_id=keeper.id,
            display_name=prop.display_name,
            deleted_at__isnull=True,
        ).first()
        if keeper_prop:
            _merge_duplicate_property(models_by_name, prop, keeper_prop)
        else:
            IssueTypeProperty._base_manager.filter(id=prop.id).update(
                issue_type_id=keeper.id
            )

    Workflow = models_by_name["Workflow"]
    keeper_active_workflow = Workflow._base_manager.filter(
        project_id=project_id,
        issue_type_id=keeper.id,
        is_active=True,
        deleted_at__isnull=True,
    ).first()
    for workflow in Workflow._base_manager.filter(
        project_id=project_id, issue_type_id=duplicate.id
    ):
        if (
            workflow.is_active
            and workflow.deleted_at is None
            and keeper_active_workflow
        ):
            Workflow._base_manager.filter(id=workflow.id).delete()
        else:
            Workflow._base_manager.filter(id=workflow.id).update(
                issue_type_id=keeper.id
            )

    ProjectIssueType._base_manager.filter(
        project_id=project_id, issue_type_id=duplicate.id
    ).delete()
    ProjectIssueType._base_manager.filter(
        project_id=project_id, issue_type_id=keeper.id
    ).update(
        is_default=keeper.is_default,
        level=keeper.level,
    )

    type_model = type(duplicate)
    type_model._base_manager.filter(id=duplicate.id).delete()


def _merge_duplicate_issue_type_names(IssueType, ProjectIssueType, models_by_name):
    names_by_project = defaultdict(list)
    for issue_type in IssueType._base_manager.filter(
        project_id__isnull=False, deleted_at__isnull=True
    ).order_by(
        "project_id",
        "name",
        "-is_default",
        "created_at",
        "id",
    ):
        names_by_project[(_as_str(issue_type.project_id), issue_type.name)].append(
            issue_type
        )

    for _, issue_types in names_by_project.items():
        if len(issue_types) <= 1:
            continue

        keeper = issue_types[0]
        if any(issue_type.is_default for issue_type in issue_types):
            keeper.is_default = True
            keeper.save(update_fields=["is_default"])

        for duplicate in issue_types[1:]:
            _merge_issue_type_into(models_by_name, ProjectIssueType, duplicate, keeper)


def _infer_projects_for_issue_type(issue_type_id, models_by_name):
    project_ids = set()
    reference_specs = (
        ("Issue", "type_id"),
        ("DraftIssue", "type_id"),
        ("State", "issue_type_id"),
        ("Workflow", "issue_type_id"),
        ("IssueTypeProperty", "issue_type_id"),
    )

    for model_name, field_name in reference_specs:
        model = models_by_name[model_name]
        project_ids.update(
            _as_str(project_id)
            for project_id in model._base_manager.filter(**{field_name: issue_type_id})
            .exclude(project_id__isnull=True)
            .values_list("project_id", flat=True)
        )

    return [project_id for project_id in project_ids if project_id]


def _fallback_project_for_issue_type(Project, issue_type):
    active_project = (
        Project._base_manager.filter(
            workspace_id=issue_type.workspace_id, deleted_at__isnull=True
        )
        .order_by("created_at", "id")
        .first()
    )
    if active_project is not None:
        return active_project

    return (
        Project._base_manager.filter(workspace_id=issue_type.workspace_id)
        .order_by("created_at", "id")
        .first()
    )


def _copy_issue_type(IssueType, source, project, is_default, level):
    return IssueType._base_manager.create(
        workspace_id=project.workspace_id,
        project_id=project.id,
        name=source.name,
        description=source.description,
        logo_props=source.logo_props,
        is_epic=source.is_epic,
        is_default=is_default,
        is_active=source.is_active,
        level=level,
        external_source=source.external_source,
        external_id=source.external_id,
        created_by_id=source.created_by_id,
        updated_by_id=source.updated_by_id,
    )


def _rewire_project_references(models_by_name, old_type_id, new_type_id, project_id):
    if _as_str(old_type_id) == _as_str(new_type_id):
        return

    update_specs = (
        ("Issue", "type_id"),
        ("DraftIssue", "type_id"),
        ("State", "issue_type_id"),
        ("Workflow", "issue_type_id"),
        ("IssueTypeProperty", "issue_type_id"),
    )

    for model_name, field_name in update_specs:
        model = models_by_name[model_name]
        model._base_manager.filter(
            project_id=project_id, **{field_name: old_type_id}
        ).update(**{field_name: new_type_id})


def project_scope_issue_types(apps, schema_editor):
    IssueType = apps.get_model("db", "IssueType")
    ProjectIssueType = apps.get_model("db", "ProjectIssueType")
    Project = apps.get_model("db", "Project")

    models_by_name = {
        "Issue": apps.get_model("db", "Issue"),
        "DraftIssue": apps.get_model("db", "DraftIssue"),
        "State": apps.get_model("db", "State"),
        "Workflow": apps.get_model("db", "Workflow"),
        "WorkflowTransition": apps.get_model("db", "WorkflowTransition"),
        "IssueTransitionRecord": apps.get_model("db", "IssueTransitionRecord"),
        "IssueTypeProperty": apps.get_model("db", "IssueTypeProperty"),
        "IssuePropertyValue": apps.get_model("db", "IssuePropertyValue"),
    }

    mapping_by_project = defaultdict(dict)
    new_ids_by_old = defaultdict(set)

    issue_type_ids = set(IssueType._base_manager.values_list("id", flat=True))

    for issue_type_id in issue_type_ids:
        issue_type = IssueType._base_manager.get(id=issue_type_id)
        links = list(
            ProjectIssueType._base_manager.filter(
                issue_type_id=issue_type_id,
                deleted_at__isnull=True,
            )
            .select_related("project")
            .order_by("created_at", "id")
        )

        if not links:
            inferred_project_ids = _infer_projects_for_issue_type(
                issue_type_id, models_by_name
            )
            if not inferred_project_ids:
                fallback_project = _fallback_project_for_issue_type(Project, issue_type)
                if fallback_project is None:
                    # No project-scoped references and no project remains in the workspace,
                    # so this legacy workspace-scoped type cannot be made project-scoped.
                    IssueType._base_manager.filter(id=issue_type.id).delete()
                    continue
                inferred_project_ids = [_as_str(fallback_project.id)]

            for index, project_id in enumerate(inferred_project_ids):
                project = Project._base_manager.get(id=project_id)
                if index == 0:
                    issue_type.project_id = project.id
                    issue_type.workspace_id = project.workspace_id
                    issue_type.save(update_fields=["project", "workspace"])
                    new_issue_type = issue_type
                else:
                    new_issue_type = _copy_issue_type(
                        IssueType,
                        issue_type,
                        project,
                        issue_type.is_default,
                        issue_type.level,
                    )
                mapping_by_project[_as_str(project.id)][_as_str(issue_type_id)] = (
                    _as_str(new_issue_type.id)
                )
                new_ids_by_old[_as_str(issue_type_id)].add(_as_str(new_issue_type.id))
                _rewire_project_references(
                    models_by_name, issue_type_id, new_issue_type.id, project.id
                )
            continue

        for index, link in enumerate(links):
            project = link.project
            if index == 0:
                issue_type.project_id = project.id
                issue_type.workspace_id = project.workspace_id
                issue_type.is_default = link.is_default
                issue_type.level = link.level
                issue_type.save(
                    update_fields=["project", "workspace", "is_default", "level"]
                )
                new_issue_type = issue_type
            else:
                new_issue_type = _copy_issue_type(
                    IssueType,
                    issue_type,
                    project,
                    link.is_default,
                    link.level,
                )
                link.issue_type_id = new_issue_type.id
                link.save(update_fields=["issue_type"])

            mapping_by_project[_as_str(project.id)][_as_str(issue_type_id)] = _as_str(
                new_issue_type.id
            )
            new_ids_by_old[_as_str(issue_type_id)].add(_as_str(new_issue_type.id))
            _rewire_project_references(
                models_by_name, issue_type_id, new_issue_type.id, project.id
            )

    global_mapping = {
        old_id: next(iter(new_ids))
        for old_id, new_ids in new_ids_by_old.items()
        if len(new_ids) == 1
    }

    json_models = (
        "ProjectUserProperties",
        "CycleUserProperties",
        "ModuleUserProperties",
        "ReleaseUserProperties",
        "WorkspaceUserProperties",
        "IssueView",
        "ExporterHistory",
    )
    for model_name in json_models:
        try:
            model = apps.get_model("db", model_name)
        except LookupError:
            continue
        _update_json_fields(model, mapping_by_project, global_mapping)

    _merge_duplicate_issue_type_names(IssueType, ProjectIssueType, models_by_name)


def reverse_project_scope_issue_types(apps, schema_editor):
    # Keep migrated project ownership in place on rollback; the compatibility
    # ProjectIssueType table is preserved and can still identify old links.
    pass


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("db", "0220_userextrainfo"),
    ]

    operations = [
        migrations.AddField(
            model_name="issuetype",
            name="project",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="project_%(class)s",
                to="db.project",
            ),
        ),
        migrations.AlterField(
            model_name="issuetype",
            name="workspace",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="workspace_%(class)s",
                to="db.workspace",
            ),
        ),
        migrations.RunPython(
            project_scope_issue_types, reverse_project_scope_issue_types
        ),
        migrations.AlterField(
            model_name="issuetype",
            name="project",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="project_%(class)s",
                to="db.project",
            ),
        ),
        migrations.AlterUniqueTogether(
            name="issuetype",
            unique_together={("project", "name", "deleted_at")},
        ),
        migrations.AddConstraint(
            model_name="issuetype",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("project", "name"),
                name="issue_type_unique_project_name_when_deleted_at_null",
            ),
        ),
    ]
