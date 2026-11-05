# 权限组拆成三类（docs/permission-refactor/split-plan.md §2）。
#
# 顺序：加 kind → 唯一约束改成「同类型内唯一」（拆分会产生同名的模板 / 工作区组 / 数据权限）→ RunPython 一拆三。
# 删 is_template 放在 0444：同一事务里改完数据再 ALTER TABLE 会撞 Postgres 的 pending trigger events。

from django.db import migrations, models

DEFAULT_SCOPE = {"projects": {"mode": "all"}, "products": {"mode": "all"}}


def _entry_grants(entry):
    """白名单的一段是否会让人看到东西：全部 / 按条件算会，「指定·空」不会。"""
    if not isinstance(entry, dict):
        return True
    mode = entry.get("mode", "all")
    if mode == "selected":
        return bool(entry.get("ids"))
    return True


def _split_permissions(perms):
    perms = perms if isinstance(perms, dict) else {}
    keys = [key for key in (perms.get("permission_keys") or []) if isinstance(key, str)]
    limits = perms.get("type_limits") if isinstance(perms.get("type_limits"), dict) else {}
    project_keys = [key for key in keys if key.startswith("project.")]
    project_limits = {key: ids for key, ids in limits.items() if key in project_keys and ids}
    full = {"permission_keys": keys}
    if limits:
        full["type_limits"] = limits
    project_only = {"permission_keys": project_keys}
    if project_limits:
        project_only["type_limits"] = project_limits
    return full, project_only


def forward(apps, schema_editor):
    """对每个未删除的组 G：
    - G 是模板：原地改成 project_template（id 不变，引用行 / 排除表不动），只留 project.* key；
      有成员时另建同名工作区组，拷贝全部 key，并把成员 / 团队绑定挪过去。
    - G 不是模板：保持 workspace。
    - 两种情况下，有成员且白名单不是「指定·空」：另建同名数据权限，白名单照抄，成员 / 团队绑定复制一份。
    迁移前后每个人的可见项目集合不变，项目里的 key 只增不减。"""
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    WorkspaceMemberRole = apps.get_model("db", "WorkspaceMemberRole")
    WorkspaceGroupRole = apps.get_model("db", "WorkspaceGroupRole")

    created_ws = created_data = converted = 0
    for role in WorkspaceRole.objects.filter(deleted_at__isnull=True).order_by("created_at"):
        direct = list(WorkspaceMemberRole.objects.filter(role=role, deleted_at__isnull=True))
        teams = list(WorkspaceGroupRole.objects.filter(role=role, deleted_at__isnull=True))
        has_members = bool(direct or teams)
        scope = role.data_scope if isinstance(role.data_scope, dict) else {}
        scope_grants = _entry_grants(scope.get("projects")) or _entry_grants(scope.get("products"))
        full_perms, project_perms = _split_permissions(role.permissions)
        common = {
            "workspace_id": role.workspace_id,
            "description": role.description,
            "created_by_id": role.created_by_id,
            "updated_by_id": role.updated_by_id,
        }

        if role.is_template:
            # 先把自己改成模板再建同名工作区组，否则撞 (workspace, kind, name) 唯一约束
            role.kind = "project_template"
            role.permissions = project_perms
            role.data_scope = DEFAULT_SCOPE
            role.save(update_fields=["kind", "permissions", "data_scope"])
            converted += 1
            if has_members:
                ws_group = WorkspaceRole.objects.create(
                    name=role.name, kind="workspace", permissions=full_perms, data_scope=DEFAULT_SCOPE, **common
                )
                WorkspaceMemberRole.objects.filter(id__in=[row.id for row in direct]).update(role=ws_group)
                WorkspaceGroupRole.objects.filter(id__in=[row.id for row in teams]).update(role=ws_group)
                created_ws += 1
        else:
            role.kind = "workspace"
            role.permissions = full_perms
            role.data_scope = DEFAULT_SCOPE
            role.save(update_fields=["kind", "permissions", "data_scope"])

        if has_members and scope_grants:
            data_group = WorkspaceRole.objects.create(
                name=role.name, kind="data", permissions={}, data_scope=scope or DEFAULT_SCOPE, **common
            )
            WorkspaceMemberRole.objects.bulk_create(
                [
                    WorkspaceMemberRole(
                        workspace_id=row.workspace_id,
                        member_id=row.member_id,
                        role=data_group,
                        created_by_id=row.created_by_id,
                        updated_by_id=row.updated_by_id,
                    )
                    for row in direct
                ]
            )
            WorkspaceGroupRole.objects.bulk_create(
                [
                    WorkspaceGroupRole(
                        group_id=row.group_id,
                        role=data_group,
                        created_by_id=row.created_by_id,
                        updated_by_id=row.updated_by_id,
                    )
                    for row in teams
                ]
            )
            created_data += 1

    print(
        f"\n  权限组拆分：{converted} 个模板改 kind；另建工作区组 {created_ws} 个、数据权限 {created_data} 个"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0442_test_plan_product_issue_test_plan"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacerole",
            name="kind",
            field=models.CharField(
                choices=[("workspace", "工作区权限组"), ("project_template", "项目权限模板"), ("data", "数据权限")],
                default="workspace",
                max_length=20,
                verbose_name="类型",
            ),
        ),
        migrations.RemoveConstraint(
            model_name="workspacerole",
            name="workspace_role_unique_workspace_name_when_deleted_at_null",
        ),
        migrations.AlterUniqueTogether(
            name="workspacerole",
            unique_together={("workspace", "kind", "name", "deleted_at")},
        ),
        migrations.AddConstraint(
            model_name="workspacerole",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "kind", "name"),
                name="workspace_role_unique_workspace_kind_name_when_deleted_at_null",
            ),
        ),
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]
