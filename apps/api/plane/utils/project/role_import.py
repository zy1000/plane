# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""把 WorkspaceRole(type=project_template) 的权限映射成某个项目可用的 ProjectRole 权限。

工作项类型的权限 key 里嵌了 IssueType 的 UUID，每个项目各不相同，所以模板里存的是
描述符（名字 + 动作），落到具体项目时要按 IssueType 名字重新解析。直接复制模板的
permissions JSON 会留下一批指向别的项目的死 key。
"""

from uuid import UUID

from plane.db.models import IssueType, Permission
from plane.db.models.issue_type import (
    ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY,
    build_issue_type_permission_key,
    build_issue_type_template_permission_descriptors,
    parse_issue_type_permission_key,
    parse_issue_type_template_permission_key,
)


def get_workspace_issue_type_template_descriptors(workspace_role):
    issue_type_names = (
        IssueType.objects.filter(
            project__workspace=workspace_role.workspace,
            deleted_at__isnull=True,
            is_active=True,
        )
        .order_by("name")
        .values_list("name", flat=True)
        .distinct()
    )
    descriptors = build_issue_type_template_permission_descriptors(issue_type_names)

    template_permissions = (
        workspace_role.permissions if isinstance(workspace_role.permissions, dict) else {}
    )
    saved_descriptors = template_permissions.get(
        ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY, {}
    )
    if not isinstance(saved_descriptors, dict):
        return descriptors

    for key, descriptor in saved_descriptors.items():
        parsed_key = parse_issue_type_template_permission_key(key)
        if not parsed_key or not isinstance(descriptor, dict):
            continue

        _, action = parsed_key
        name = descriptor.get("name")
        if not isinstance(name, str) or descriptor.get("action") != action:
            continue

        descriptors[key] = {"name": name, "action": action}

    return descriptors


def get_project_issue_type_key_descriptors(permission_keys):
    issue_type_keys = {}
    for key in permission_keys:
        parsed_key = parse_issue_type_permission_key(key)
        if not parsed_key:
            continue

        issue_type_id_hex, action = parsed_key
        try:
            issue_type_id = UUID(hex=issue_type_id_hex)
        except ValueError:
            continue
        issue_type_keys[key] = (issue_type_id, action)

    if not issue_type_keys:
        return {}

    issue_types = IssueType.objects.filter(
        id__in=[issue_type_id for issue_type_id, _ in issue_type_keys.values()]
    ).only("id", "name")
    issue_types_by_id = {issue_type.id: issue_type for issue_type in issue_types}

    descriptors = {}
    for key, (issue_type_id, action) in issue_type_keys.items():
        issue_type = issue_types_by_id.get(issue_type_id)
        if not issue_type:
            continue
        descriptors[key] = {"name": issue_type.name, "action": action}

    return descriptors


def map_template_permission_keys_to_project(project, workspace_role, permission_keys):
    target_issue_types = IssueType.objects.filter(
        project=project,
        deleted_at__isnull=True,
        is_active=True,
    ).only("id", "name")
    target_issue_type_id_by_name = {
        issue_type.name: issue_type.id for issue_type in target_issue_types
    }
    template_descriptors = get_workspace_issue_type_template_descriptors(workspace_role)
    project_key_descriptors = get_project_issue_type_key_descriptors(permission_keys)

    mapped_keys = []
    for key in permission_keys:
        descriptor = None
        if parse_issue_type_template_permission_key(key):
            descriptor = template_descriptors.get(key)
        elif parse_issue_type_permission_key(key):
            descriptor = project_key_descriptors.get(key)

        if descriptor:
            target_issue_type_id = target_issue_type_id_by_name.get(descriptor["name"])
            if target_issue_type_id:
                mapped_keys.append(
                    build_issue_type_permission_key(
                        target_issue_type_id, descriptor["action"]
                    )
                )
            continue

        mapped_keys.append(key)

    return list(dict.fromkeys(mapped_keys))


def build_project_role_permissions(project, workspace_role):
    """返回 (可直接存进 ProjectRole.permissions 的字典, 非项目 scope 的坏 key 列表)。"""
    template_permissions = (
        workspace_role.permissions if isinstance(workspace_role.permissions, dict) else {}
    )
    template_keys = template_permissions.get("permission_keys", [])
    template_keys = template_keys if isinstance(template_keys, list) else []
    permission_keys = map_template_permission_keys_to_project(
        project, workspace_role, template_keys
    )

    bad_keys = []
    if permission_keys:
        bad_keys = list(
            Permission.objects.filter(key__in=permission_keys)
            .exclude(scope="project")
            .values_list("key", flat=True)
        )

    project_permissions = dict(template_permissions)
    project_permissions["permission_keys"] = permission_keys
    project_permissions.pop(ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY, None)
    return project_permissions, bad_keys
