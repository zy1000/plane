# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid
from typing import Any

# Django imports
from django.core.management import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

# Module imports
from plane.db.models import Project, ProjectRole, User, Workspace, WorkspaceRole
from plane.utils.project.role_import import build_project_role_permissions


class DryRunRollback(Exception):
    """dry-run 跑完真实写入后用它回滚，这样打印的计数和真跑完全一致。"""


def split_csv(value: str) -> list[str]:
    """把逗号分隔的入参切成去重后的非空列表，保持原始顺序。"""
    if not value:
        return []
    return list(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))


class Command(BaseCommand):
    help = (
        "把工作区的项目角色模板（WorkspaceRole，type=project_template）批量下发成各项目的 ProjectRole。"
        "复用项目级导入接口的权限映射逻辑，工作项类型权限会按名字重新解析到目标项目。"
    )

    def add_arguments(self, parser):
        parser.add_argument("--workspace", type=str, required=True, help="工作区 slug")
        parser.add_argument("--role-name", type=str, required=True, help="项目角色模板的名称")
        parser.add_argument(
            "--projects",
            type=str,
            default="all",
            help="项目范围：all 表示工作区全部项目，或传逗号分隔的项目 ID / 项目 identifier",
        )
        parser.add_argument("--include-archived", action="store_true", help="同时处理已归档项目")
        parser.add_argument(
            "--update-existing",
            action="store_true",
            help="项目里已存在同名角色时覆盖其权限和描述，默认跳过",
        )
        parser.add_argument(
            "--operator-email",
            type=str,
            default="",
            help="记入 created_by / updated_by 的操作人邮箱，便于审计",
        )
        parser.add_argument("--dry-run", action="store_true", help="只打印将要发生的改动，不落库")

    def handle(self, *args: Any, **options: Any):
        dry_run = options["dry_run"]

        workspace = Workspace.objects.filter(slug=options["workspace"]).first()
        if not workspace:
            raise CommandError(f"工作区不存在：{options['workspace']}")

        workspace_role = WorkspaceRole.objects.filter(
            workspace=workspace,
            name=options["role_name"],
            type=WorkspaceRole.RoleType.PROJECT_TEMPLATE,
        ).first()
        if not workspace_role:
            raise CommandError(
                f"工作区 {workspace.slug} 下没有名为「{options['role_name']}」的项目角色模板，"
                "请确认名称正确且类型为「项目角色模板」"
            )

        operator = self._resolve_operator(options["operator_email"])
        projects = self._resolve_projects(
            workspace, options["projects"], options["include_archived"]
        )

        self.stdout.write(
            f"工作区 {workspace.slug}：把角色模板「{workspace_role.name}」下发到 "
            f"{len(projects)} 个项目" + ("（dry-run，结束时回滚）" if dry_run else "")
        )

        totals = {"created": 0, "updated": 0, "skipped": 0}
        try:
            with transaction.atomic():
                for project in projects:
                    outcome = self._sync_project(
                        project=project,
                        workspace_role=workspace_role,
                        update_existing=options["update_existing"],
                        operator=operator,
                    )
                    totals[outcome] += 1
                    if outcome != "skipped":
                        self.stdout.write(
                            f"  {project.identifier or project.id} {project.name}："
                            + ("新建角色" if outcome == "created" else "覆盖已有同名角色")
                        )

                if dry_run:
                    raise DryRunRollback
        except DryRunRollback:
            pass

        summary = (
            f"新建 {totals['created']} 个、覆盖 {totals['updated']} 个、"
            f"跳过 {totals['skipped']} 个（已存在同名角色）"
        )
        if dry_run:
            self.stdout.write(self.style.WARNING(f"dry-run 完成，已回滚。实际会：{summary}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"完成：{summary}"))
            self.stdout.write(
                f"现在可以在 bulk_add_project_members 里用 --role-names {workspace_role.name}"
            )

    def _resolve_operator(self, operator_email: str) -> User | None:
        if not operator_email:
            return None
        operator = User.objects.filter(email=operator_email).first()
        if not operator:
            raise CommandError(f"操作人邮箱在系统中不存在：{operator_email}")
        return operator

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
        workspace_role: WorkspaceRole,
        update_existing: bool,
        operator: User | None,
    ) -> str:
        existing_role = ProjectRole.objects.filter(
            project=project, name=workspace_role.name
        ).first()
        if existing_role and not update_existing:
            return "skipped"

        # 工作项类型权限的 key 内嵌 IssueType UUID，必须按目标项目重新解析，不能直接抄模板 JSON
        project_permissions, bad_keys = build_project_role_permissions(project, workspace_role)
        if bad_keys:
            raise CommandError(
                f"角色模板「{workspace_role.name}」包含非项目权限，无法下发："
                f"{'、'.join(bad_keys)}"
            )

        # BaseModel.save() 默认用 crum 取当前请求用户，命令行里取不到会把 created_by/updated_by
        # 置空，所以这里显式关掉自动赋值，保住 --operator-email
        if existing_role:
            existing_role.permissions = project_permissions
            existing_role.description = workspace_role.description or ""
            existing_role.updated_by = operator
            existing_role.save(
                update_fields=["permissions", "description", "updated_by", "updated_at"],
                disable_auto_set_user=True,
            )
            return "updated"

        project_role = ProjectRole(
            project=project,
            name=workspace_role.name,
            description=workspace_role.description or "",
            permissions=project_permissions,
            source_template=None,
            created_by=operator,
            updated_by=operator,
        )
        project_role.save(disable_auto_set_user=True)
        return "created"
