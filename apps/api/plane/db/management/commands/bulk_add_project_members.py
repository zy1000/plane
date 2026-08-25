# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid
from typing import Any

# Django imports
from django.core.management import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Min, Q

# Module imports
from plane.db.models import (
    Project,
    ProjectMember,
    ProjectMemberRole,
    ProjectRole,
    ProjectUserProperty,
    User,
    Workspace,
    WorkspaceMember,
)
from plane.db.models.project import ROLE

LEGACY_ROLE_BY_NAME = {
    "admin": ROLE.ADMIN.value,
    "member": ROLE.MEMBER.value,
    "guest": ROLE.GUEST.value,
}


class DryRunRollback(Exception):
    """dry-run 跑完真实写入后用它回滚，这样打印的计数和真跑完全一致。"""


def split_csv(value: str) -> list[str]:
    """把逗号分隔的入参切成去重后的非空列表，保持原始顺序。"""
    if not value:
        return []
    return list(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))


class Command(BaseCommand):
    help = (
        "批量把若干成员加入工作区内的多个项目。"
        "会补齐 ProjectMember、ProjectUserProperty 和 ProjectMemberRole，不发送邀请邮件。"
    )

    def add_arguments(self, parser):
        parser.add_argument("--workspace", type=str, required=True, help="工作区 slug")
        parser.add_argument("--emails", type=str, required=True, help="成员邮箱，逗号分隔")
        parser.add_argument(
            "--projects",
            type=str,
            default="all",
            help="项目范围：all 表示工作区全部项目，或传逗号分隔的项目 ID / 项目 identifier",
        )
        parser.add_argument(
            "--role",
            type=str,
            default="member",
            help=f"内置角色，可选 {'/'.join(LEGACY_ROLE_BY_NAME)}，默认 member",
        )
        parser.add_argument(
            "--role-names",
            type=str,
            default="",
            help="要绑定的项目角色名称，逗号分隔。每个项目各自匹配同名 ProjectRole，只增不删",
        )
        parser.add_argument("--include-archived", action="store_true", help="同时处理已归档项目")
        parser.add_argument(
            "--update-existing",
            action="store_true",
            help="连同已在项目中的活跃成员一起改内置角色，默认跳过他们",
        )
        parser.add_argument("--dry-run", action="store_true", help="只打印将要发生的改动，不落库")

    def handle(self, *args: Any, **options: Any):
        dry_run = options["dry_run"]
        legacy_role = self._resolve_legacy_role(options["role"])
        role_names = split_csv(options["role_names"])

        workspace = Workspace.objects.filter(slug=options["workspace"]).first()
        if not workspace:
            raise CommandError(f"工作区不存在：{options['workspace']}")

        users = self._resolve_users(workspace, split_csv(options["emails"]))
        projects = self._resolve_projects(
            workspace, options["projects"], options["include_archived"]
        )

        self.stdout.write(
            f"工作区 {workspace.slug}：{len(users)} 名成员 × {len(projects)} 个项目，"
            f"内置角色 {options['role']}"
            + (f"，绑定项目角色 {'、'.join(role_names)}" if role_names else "")
            + ("（dry-run，结束时回滚）" if dry_run else "")
        )

        # 复刻单项目入口的 sort_order 规则：每加入一个项目，取该用户在本工作区的最小值再减 10000
        sort_order_by_user_id = {
            str(row["user_id"]): row["min_sort_order"]
            for row in ProjectUserProperty.objects.filter(workspace=workspace, user__in=users)
            .values("user_id")
            .annotate(min_sort_order=Min("sort_order"))
        }

        totals = {"created": 0, "reactivated": 0, "updated": 0, "skipped": 0, "roles": 0}
        projects_missing_roles = {}

        try:
            with transaction.atomic():
                for project in projects:
                    counts, missing_roles = self._sync_project(
                        project=project,
                        users=users,
                        legacy_role=legacy_role,
                        role_names=role_names,
                        update_existing=options["update_existing"],
                        sort_order_by_user_id=sort_order_by_user_id,
                    )
                    for key, value in counts.items():
                        totals[key] += value
                    if missing_roles:
                        projects_missing_roles[project.identifier or str(project.id)] = (
                            missing_roles
                        )

                    self.stdout.write(
                        f"  {project.identifier or project.id} {project.name}："
                        f"新增 {counts['created']}、复活 {counts['reactivated']}、"
                        f"改角色 {counts['updated']}、跳过 {counts['skipped']}、"
                        f"绑定角色 {counts['roles']}"
                    )

                if dry_run:
                    raise DryRunRollback
        except DryRunRollback:
            pass

        self._report(totals, projects_missing_roles, dry_run)

    def _resolve_legacy_role(self, value: str) -> int:
        legacy_role = LEGACY_ROLE_BY_NAME.get(value.strip().lower())
        if legacy_role is None:
            raise CommandError(f"--role 只能是 {'/'.join(LEGACY_ROLE_BY_NAME)}，收到：{value}")
        return legacy_role

    def _resolve_users(self, workspace: Workspace, emails: list[str]) -> list[User]:
        if not emails:
            raise CommandError("--emails 不能为空")

        users = list(User.objects.filter(email__in=emails))
        found_emails = {user.email.lower() for user in users}
        missing_emails = [email for email in emails if email.lower() not in found_emails]
        if missing_emails:
            raise CommandError(f"以下邮箱在系统中不存在：{'、'.join(missing_emails)}")

        active_member_ids = set(
            WorkspaceMember.objects.filter(
                workspace=workspace, member__in=users, is_active=True
            ).values_list("member_id", flat=True)
        )
        outsiders = [user.email for user in users if user.id not in active_member_ids]
        if outsiders:
            raise CommandError(
                f"以下用户不是工作区 {workspace.slug} 的活跃成员，请先加入工作区："
                f"{'、'.join(outsiders)}"
            )
        return users

    def _resolve_projects(
        self, workspace: Workspace, projects_option: str, include_archived: bool
    ) -> list[Project]:
        project_qs = Project.objects.filter(workspace=workspace)
        if not include_archived:
            project_qs = project_qs.filter(archived_at__isnull=True)

        tokens = []
        if projects_option.strip().lower() != "all":
            tokens = split_csv(projects_option)
            if not tokens:
                raise CommandError("--projects 不能为空，用 all 表示全部项目")

            project_ids, identifiers = [], []
            for token in tokens:
                try:
                    project_ids.append(uuid.UUID(token))
                except ValueError:
                    identifiers.append(token)
            project_qs = project_qs.filter(Q(pk__in=project_ids) | Q(identifier__in=identifiers))

        projects = list(project_qs.order_by("identifier", "name"))
        if not projects:
            raise CommandError("没有匹配到任何项目")

        if tokens:
            matched = {str(project.id) for project in projects} | {
                project.identifier for project in projects if project.identifier
            }
            unmatched = [token for token in tokens if token not in matched]
            if unmatched:
                raise CommandError(
                    f"以下项目在工作区 {workspace.slug} 中不存在或已归档：{'、'.join(unmatched)}"
                )
        return projects

    def _sync_project(
        self,
        project: Project,
        users: list[User],
        legacy_role: int,
        role_names: list[str],
        update_existing: bool,
        sort_order_by_user_id: dict,
    ) -> tuple[dict, list[str]]:
        counts = {"created": 0, "reactivated": 0, "updated": 0, "skipped": 0, "roles": 0}

        existing_members = {
            str(project_member.member_id): project_member
            for project_member in ProjectMember.objects.filter(project=project, member__in=users)
        }
        users_with_property = {
            str(user_id)
            for user_id in ProjectUserProperty.objects.filter(
                project=project, user__in=users
            ).values_list("user_id", flat=True)
        }

        bulk_members, bulk_properties, members_to_update = [], [], []
        for user in users:
            user_id = str(user.id)
            project_member = existing_members.get(user_id)

            if project_member is None:
                bulk_members.append(
                    ProjectMember(
                        member=user,
                        role=legacy_role,
                        project=project,
                        workspace_id=project.workspace_id,
                    )
                )
                counts["created"] += 1
            elif not project_member.is_active:
                # 被移除过的成员按本次入参重新激活，停用状态下的 role 已经过期，一并覆盖
                project_member.is_active = True
                project_member.role = legacy_role
                members_to_update.append(project_member)
                counts["reactivated"] += 1
            elif update_existing and project_member.role != legacy_role:
                project_member.role = legacy_role
                members_to_update.append(project_member)
                counts["updated"] += 1
            else:
                counts["skipped"] += 1

            if user_id not in users_with_property:
                min_sort_order = sort_order_by_user_id.get(user_id)
                sort_order = min_sort_order - 10000 if min_sort_order is not None else 65535
                sort_order_by_user_id[user_id] = sort_order
                bulk_properties.append(
                    ProjectUserProperty(
                        user=user,
                        project=project,
                        workspace_id=project.workspace_id,
                        sort_order=sort_order,
                    )
                )

        if members_to_update:
            ProjectMember.objects.bulk_update(
                members_to_update, ["is_active", "role"], batch_size=100
            )
        if bulk_members:
            # bulk_create 绕过 ProjectMember.save()，所以 ProjectUserProperty 必须自己补
            ProjectMember.objects.bulk_create(bulk_members, batch_size=100, ignore_conflicts=True)
        if bulk_properties:
            ProjectUserProperty.objects.bulk_create(
                bulk_properties, batch_size=100, ignore_conflicts=True
            )

        roles_by_name, missing_roles = self._resolve_project_roles(project, role_names)
        counts["roles"] = self._bind_project_roles(project, users, roles_by_name)
        return counts, missing_roles

    def _resolve_project_roles(
        self, project: Project, role_names: list[str]
    ) -> tuple[dict, list[str]]:
        if not role_names:
            return {}, []
        roles_by_name = {
            role.name: role
            for role in ProjectRole.objects.filter(project=project, name__in=role_names)
        }
        missing_roles = [name for name in role_names if name not in roles_by_name]
        return roles_by_name, missing_roles

    def _bind_project_roles(self, project: Project, users: list[User], roles_by_name: dict) -> int:
        """把本次涉及的成员绑定到目标角色上，只增不删，已绑定的跳过。"""
        if not roles_by_name:
            return 0

        project_members = list(
            ProjectMember.objects.filter(project=project, member__in=users, is_active=True)
        )
        bound_pairs = set(
            ProjectMemberRole.objects.filter(
                member__in=project_members, role__in=roles_by_name.values()
            ).values_list("member_id", "role_id")
        )
        pending = [
            ProjectMemberRole(
                member=project_member,
                role=role,
                project=project,
                workspace_id=project.workspace_id,
            )
            for project_member in project_members
            for role in roles_by_name.values()
            if (project_member.id, role.id) not in bound_pairs
        ]
        if not pending:
            return 0

        ProjectMemberRole.objects.bulk_create(pending, batch_size=100, ignore_conflicts=True)
        return len(pending)

    def _report(self, totals: dict, projects_missing_roles: dict, dry_run: bool) -> None:
        if projects_missing_roles:
            self.stdout.write(
                self.style.WARNING("以下项目缺少同名角色，这些项目的角色绑定被跳过：")
            )
            for identifier, missing_roles in projects_missing_roles.items():
                self.stdout.write(
                    self.style.WARNING(f"  {identifier}：{'、'.join(missing_roles)}")
                )

        summary = (
            f"新增成员 {totals['created']}、复活成员 {totals['reactivated']}、"
            f"改内置角色 {totals['updated']}、跳过 {totals['skipped']}、绑定角色 {totals['roles']}"
        )
        if dry_run:
            self.stdout.write(self.style.WARNING(f"dry-run 完成，已回滚。实际会：{summary}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"完成：{summary}"))
