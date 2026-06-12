from django.db import migrations, transaction
from django.db.models import Min
from django.utils import timezone


# 这次只同步 active Workflow 下的规则，不整条硬删 Workflow：
# IssueTransitionRecord.transition 对 WorkflowTransition 是 SET_NULL，整条重建会让
# 历史流转记录大面积丢失原 transition 引用。这里保留 workflow 和同 from/to 的
# transition，只硬删并重建规则子表，以及删除不再属于新默认规则的 transition。
DEFECT_TYPE_NAMES = {"缺陷", "Bug", "bug", "Defect", "defect"}

QA_ROLE_SET = ["软件测试工程师", "软件测试负责人"]
RD_ROLE_SET = ["软件研发工程师", "软件研发负责人"]
BUG_REQUIRED_FIELD = ["修复版本", "技术原因及解决方案"]
APPROVER_DISPLAY_NAMES = ["欧秋洁", "何洽", "钟长会"]
MEMBER_ROLE = 15

DIMENSION_INITIATOR = "initiator"
DIMENSION_ASSIGNEE = "assignee"
DIMENSION_APPROVER = "approver"

KIND_ROLE = "role"
KIND_MEMBER = "member"
KIND_DYNAMIC = "dynamic"

TRANSITION_RULES = [
    {
        "from_state": "Backlog",
        "to_state": "Open",
        "initiator": None,
        "assignee": {"role_name": RD_ROLE_SET},
    },
    {
        "from_state": "Open",
        "to_state": "Fixed",
        "initiator": {"role_name": RD_ROLE_SET},
        "assignee": {"role_name": QA_ROLE_SET},
        "required_field": BUG_REQUIRED_FIELD,
    },
    {
        "from_state": "Open",
        "to_state": "Pending-Reject",
        "initiator": {"role_name": RD_ROLE_SET},
        "assignee": {"role_name": QA_ROLE_SET},
        "required_field": ["技术原因及解决方案"],
    },
    {
        "from_state": "Fixed",
        "to_state": "Reopen",
        "initiator": {"role_name": QA_ROLE_SET},
        "assignee": {"role_name": RD_ROLE_SET},
    },
    {
        "from_state": "Fixed",
        "to_state": "Closed",
        "initiator": {"role_name": QA_ROLE_SET},
        "assignee": {"dynamic_target": ["created_by"]},
        "required_field": BUG_REQUIRED_FIELD,
    },
    {
        "from_state": "Pending-Reject",
        "to_state": "Rejected",
        "initiator": {"role_name": QA_ROLE_SET},
        "assignee": {"dynamic_target": ["created_by"]},
        "approver": {
            "role_name": ["软件测试负责人"],
            "member_name": APPROVER_DISPLAY_NAMES,
        },
        "required_field": ["技术原因及解决方案"],
        "approval_type": "n_of_m",
        "required_count": 2,
    },
    {
        "from_state": "Pending-Reject",
        "to_state": "Suspend",
        "initiator": {"role_name": QA_ROLE_SET},
        "assignee": {"dynamic_target": ["created_by"]},
        "approver": {
            "role_name": ["软件测试负责人"],
            "member_name": APPROVER_DISPLAY_NAMES,
        },
        "required_field": ["技术原因及解决方案"],
        "approval_type": "n_of_m",
        "required_count": 2,
    },
    {
        "from_state": "Pending-Reject",
        "to_state": "Reopen",
        "initiator": {"role_name": QA_ROLE_SET},
        "assignee": {"role_name": RD_ROLE_SET},
    },
    {
        "from_state": "Suspend",
        "to_state": "Closed",
        "initiator": {"dynamic_target": ["created_by"]},
        "assignee": {"dynamic_target": ["created_by"]},
        "required_field": BUG_REQUIRED_FIELD,
    },
    {
        "from_state": "Suspend",
        "to_state": "Reopen",
        "initiator": {"dynamic_target": ["created_by"]},
        "assignee": {"role_name": RD_ROLE_SET},
    },
    {
        "from_state": "Reopen",
        "to_state": "Fixed",
        "initiator": {"role_name": RD_ROLE_SET},
        "assignee": {"role_name": QA_ROLE_SET},
        "required_field": BUG_REQUIRED_FIELD,
    },
    {
        "from_state": "Reopen",
        "to_state": "Pending-Reject",
        "initiator": {"role_name": RD_ROLE_SET},
        "assignee": {"role_name": QA_ROLE_SET},
        "required_field": ["技术原因及解决方案"],
    },
]


def _is_defect_issue_type(issue_type):
    category = getattr(issue_type, "category", None)
    if category is not None and getattr(category, "name", None) == "缺陷":
        return True
    return issue_type.name in DEFECT_TYPE_NAMES


def _hard_delete(queryset):
    try:
        queryset.delete(soft=False)
    except TypeError:
        # 历史迁移模型通常使用 Django 普通 queryset delete，本身就是硬删除。
        queryset.delete()


def _add_users_to_project(ProjectMember, ProjectUserProperty, users, project):
    user_ids = [user.id for user in users]
    if not user_ids:
        return

    member_sort_orders = (
        ProjectUserProperty.objects.filter(
            workspace_id=project.workspace_id,
            user_id__in=user_ids,
            deleted_at__isnull=True,
        )
        .values("user_id")
        .annotate(min_sort_order=Min("sort_order"))
    )
    sort_order_map = {
        str(item["user_id"]): item["min_sort_order"] for item in member_sort_orders
    }

    project_members = []
    user_properties = []
    for user in users:
        min_sort_order = sort_order_map.get(str(user.id))
        project_members.append(
            ProjectMember(
                member_id=user.id,
                role=MEMBER_ROLE,
                project_id=project.id,
                workspace_id=project.workspace_id,
            )
        )
        user_properties.append(
            ProjectUserProperty(
                user_id=user.id,
                project_id=project.id,
                workspace_id=project.workspace_id,
                sort_order=(
                    min_sort_order - 10000 if min_sort_order is not None else 65535
                ),
            )
        )

    ProjectMember.objects.bulk_create(
        project_members, batch_size=100, ignore_conflicts=True
    )
    ProjectUserProperty.objects.bulk_create(
        user_properties, batch_size=100, ignore_conflicts=True
    )


def _get_or_create_workflow(Workflow, project, defect_issue_type):
    workflow = (
        Workflow.objects.filter(
            project_id=project.id,
            issue_type_id=defect_issue_type.id,
            is_active=True,
            deleted_at__isnull=True,
        )
        .order_by("created_at", "id")
        .first()
    )
    if workflow is not None:
        return workflow

    return Workflow.objects.create(
        project_id=project.id,
        workspace_id=project.workspace_id,
        issue_type_id=defect_issue_type.id,
        name="缺陷默认工作流",
        is_active=True,
    )


def _get_state_map(State, project, defect_issue_type):
    return {
        state.name: state
        for state in State.objects.filter(
            project_id=project.id,
            issue_type_id=defect_issue_type.id,
            deleted_at__isnull=True,
        )
    }


def _get_active_transition_map(WorkflowTransition, workflow):
    transition_map = {}
    duplicate_ids = []

    transitions = WorkflowTransition.objects.filter(
        workflow_id=workflow.id,
        deleted_at__isnull=True,
    ).select_related("from_state", "to_state")

    for transition in transitions:
        from_name = transition.from_state.name if transition.from_state_id else None
        to_name = transition.to_state.name if transition.to_state_id else None
        pair = (from_name, to_name)

        if pair in transition_map:
            duplicate_ids.append(transition.id)
            continue

        transition_map[pair] = transition

    if duplicate_ids:
        _hard_delete(WorkflowTransition.objects.filter(id__in=duplicate_ids))

    return transition_map


def _delete_stale_transitions(WorkflowTransition, transition_map):
    target_pairs = {
        (rule["from_state"], rule["to_state"]) for rule in TRANSITION_RULES
    }
    stale_ids = [
        transition.id
        for pair, transition in transition_map.items()
        if pair not in target_pairs
    ]
    if stale_ids:
        _hard_delete(WorkflowTransition.objects.filter(id__in=stale_ids))

    return {
        pair: transition
        for pair, transition in transition_map.items()
        if pair in target_pairs
    }


def _add_principal_objects(
    WorkflowTransitionPrincipal,
    ProjectRole,
    User,
    project,
    transition,
    rule_info,
):
    principal_objects = []

    def add(data, dimension):
        for key, values in data.items():
            if key == "role_name":
                role_ids = list(
                    ProjectRole.objects.filter(
                        project_id=project.id,
                        name__in=values,
                        deleted_at__isnull=True,
                    ).values_list("id", flat=True)
                )
                principal_objects.extend(
                    WorkflowTransitionPrincipal(
                        transition_id=transition.id,
                        role_id=role_id,
                        dimension=dimension,
                        kind=KIND_ROLE,
                    )
                    for role_id in role_ids
                )
            elif key == "member_name":
                member_ids = list(
                    User.objects.filter(display_name__in=values).values_list(
                        "id", flat=True
                    )
                )
                principal_objects.extend(
                    WorkflowTransitionPrincipal(
                        transition_id=transition.id,
                        member_id=member_id,
                        dimension=dimension,
                        kind=KIND_MEMBER,
                    )
                    for member_id in member_ids
                )
            elif key == "dynamic_target":
                principal_objects.extend(
                    WorkflowTransitionPrincipal(
                        transition_id=transition.id,
                        dynamic_target=dynamic_target,
                        dimension=dimension,
                        kind=KIND_DYNAMIC,
                    )
                    for dynamic_target in values
                )

    if rule_info.get("initiator"):
        add(rule_info["initiator"], DIMENSION_INITIATOR)
    if rule_info.get("assignee"):
        add(rule_info["assignee"], DIMENSION_ASSIGNEE)
    if rule_info.get("approver"):
        add(rule_info["approver"], DIMENSION_APPROVER)

    if principal_objects:
        WorkflowTransitionPrincipal.objects.bulk_create(
            principal_objects, batch_size=100, ignore_conflicts=True
        )


def _replace_transition_principals(
    WorkflowTransitionPrincipal,
    ProjectRole,
    User,
    project,
    transition,
    rule_info,
):
    _hard_delete(
        WorkflowTransitionPrincipal.objects.filter(transition_id=transition.id)
    )
    _add_principal_objects(
        WorkflowTransitionPrincipal,
        ProjectRole,
        User,
        project,
        transition,
        rule_info,
    )


def _replace_required_fields(
    WorkflowTransitionRequiredField,
    TypeExtraField,
    defect_issue_type,
    transition,
    rule_info,
):
    _hard_delete(
        WorkflowTransitionRequiredField.objects.filter(workflow_id=transition.id)
    )

    required_field_names = rule_info.get("required_field")
    if not required_field_names:
        return

    extra_fields = TypeExtraField.objects.filter(
        project_id=defect_issue_type.project_id,
        issue_type_id=defect_issue_type.id,
        name__in=required_field_names,
        deleted_at__isnull=True,
    )
    required_field_objects = [
        WorkflowTransitionRequiredField(
            workflow_id=transition.id,
            extra_field_id=extra_field.id,
        )
        for extra_field in extra_fields
    ]
    if required_field_objects:
        WorkflowTransitionRequiredField.objects.bulk_create(
            required_field_objects, batch_size=100, ignore_conflicts=True
        )


def _upsert_transition(
    WorkflowTransition,
    workflow,
    project,
    rule_info,
    from_state,
    to_state,
    existing_transition,
):
    approval_type = rule_info.get("approval_type", "any")
    required_count = rule_info.get("required_count")

    if existing_transition is None:
        return WorkflowTransition.objects.create(
            workflow_id=workflow.id,
            project_id=project.id,
            workspace_id=project.workspace_id,
            from_state_id=from_state.id,
            to_state_id=to_state.id,
            approval_type=approval_type,
            required_count=required_count,
        )

    update_fields = {}
    if existing_transition.approval_type != approval_type:
        update_fields["approval_type"] = approval_type
    if existing_transition.required_count != required_count:
        update_fields["required_count"] = required_count
    if existing_transition.project_id != project.id:
        update_fields["project_id"] = project.id
    if existing_transition.workspace_id != project.workspace_id:
        update_fields["workspace_id"] = project.workspace_id

    if update_fields:
        update_fields["updated_at"] = timezone.now()
        WorkflowTransition.objects.filter(id=existing_transition.id).update(
            **update_fields
        )
        for field, value in update_fields.items():
            setattr(existing_transition, field, value)

    return existing_transition


def _sync_workflow_rules(
    WorkflowTransition,
    WorkflowTransitionPrincipal,
    WorkflowTransitionRequiredField,
    ProjectRole,
    User,
    TypeExtraField,
    State,
    project,
    defect_issue_type,
    workflow,
):
    state_map = _get_state_map(State, project, defect_issue_type)
    transition_map = _delete_stale_transitions(
        WorkflowTransition,
        _get_active_transition_map(WorkflowTransition, workflow),
    )

    for rule_info in TRANSITION_RULES:
        from_state = state_map.get(rule_info["from_state"])
        to_state = state_map.get(rule_info["to_state"])
        if from_state is None or to_state is None:
            continue

        pair = (rule_info["from_state"], rule_info["to_state"])
        transition = _upsert_transition(
            WorkflowTransition,
            workflow,
            project,
            rule_info,
            from_state,
            to_state,
            transition_map.get(pair),
        )
        transition_map[pair] = transition

        _replace_transition_principals(
            WorkflowTransitionPrincipal,
            ProjectRole,
            User,
            project,
            transition,
            rule_info,
        )
        _replace_required_fields(
            WorkflowTransitionRequiredField,
            TypeExtraField,
            defect_issue_type,
            transition,
            rule_info,
        )


def sync_default_bug_workflow_rules(apps, schema_editor):
    IssueType = apps.get_model("db", "IssueType")
    ProjectMember = apps.get_model("db", "ProjectMember")
    ProjectUserProperty = apps.get_model("db", "ProjectUserProperty")
    ProjectRole = apps.get_model("db", "ProjectRole")
    State = apps.get_model("db", "State")
    TypeExtraField = apps.get_model("db", "TypeExtraField")
    User = apps.get_model("db", "User")
    Workflow = apps.get_model("db", "Workflow")
    WorkflowTransition = apps.get_model("db", "WorkflowTransition")
    WorkflowTransitionPrincipal = apps.get_model("db", "WorkflowTransitionPrincipal")
    WorkflowTransitionRequiredField = apps.get_model(
        "db", "WorkflowTransitionRequiredField"
    )

    approver_users = list(
        User.objects.filter(display_name__in=APPROVER_DISPLAY_NAMES)
    )
    defect_issue_types = (
        IssueType.objects.filter(
            deleted_at__isnull=True,
            project__deleted_at__isnull=True,
            project__is_template=False,
        )
        .select_related("category", "project")
        .order_by("project_id", "id")
    )

    for defect_issue_type in defect_issue_types.iterator():
        if not _is_defect_issue_type(defect_issue_type):
            continue

        project = defect_issue_type.project
        try:
            with transaction.atomic():
                _add_users_to_project(
                    ProjectMember,
                    ProjectUserProperty,
                    approver_users,
                    project,
                )
                workflow = _get_or_create_workflow(
                    Workflow,
                    project,
                    defect_issue_type,
                )
                _sync_workflow_rules(
                    WorkflowTransition,
                    WorkflowTransitionPrincipal,
                    WorkflowTransitionRequiredField,
                    ProjectRole,
                    User,
                    TypeExtraField,
                    State,
                    project,
                    defect_issue_type,
                    workflow,
                )
        except Exception as exc:
            print(
                "[0270] skip default bug workflow sync "
                f"issue_type={defect_issue_type.id} "
                f"project={defect_issue_type.project_id}: {exc}"
            )
            continue


def backward(apps, schema_editor):
    # 该迁移会覆盖旧默认规则及可能存在的人工调整，无法可靠区分并还原。
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0269_normalize_project_role_names"),
    ]

    operations = [
        migrations.RunPython(sync_default_bug_workflow_rules, backward),
    ]
