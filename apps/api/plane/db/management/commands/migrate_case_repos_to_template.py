# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""把指定项目下的用例库迁移成工作区级模板用例库。

迁移结构：
    项目 A                         →  模板库「项目 A」（is_template=True，名字取项目名）
      ├─ 用例库「功能测试」           →    ├─ 根模块「功能测试」
      │    ├─ 模块 X / 用例            →    │    ├─ 模块 X / 用例（整棵树原样下沉一级）
      │    └─ 库根用例                 →    │    └─ 库根用例落在「功能测试」模块下
      └─ 用例库「性能测试」           →    └─ 根模块「性能测试」…

语义：
- 复制而非搬移：源项目里的用例库、用例、评审、执行记录都保持不动，核对无误后再自行处理。
- 复制口径与模块复制 / 从模板导入接口一致（code 重新生成为 NA-n、标签按名同步、
  关联工作项照搬、不带评审 / 执行 / 版本 / 活动流），附件与富文本图片在事务提交后同步复制。
- 维护人保留源用例的维护人；created_by 用 --operator-email 指定，不传则为空。
- 可重复执行：模板库同名已存在则复用；模板库里已有同名根模块的用例库视为已迁移，跳过。
"""

# Python imports
import uuid
from contextlib import nullcontext
from typing import Any

# Third party imports
from crum import impersonate

# Django imports
from django.core.management import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

# Module imports
from plane.app.views.qa.case import copy_cases_to_module, copy_module_subtree
from plane.bgtasks.copy_case_assets_task import copy_case_assets
from plane.db.models import CaseModule, Project, TestCase, TestCaseRepository, User, Workspace

# CaseModule.name 的列宽（qa.py），用例库名超过它时根模块名会被截断
CASE_MODULE_NAME_MAX_LENGTH = CaseModule._meta.get_field("name").max_length


class DryRunRollback(Exception):
    """dry-run 跑完真实写入后用它回滚，这样打印的计数和真跑完全一致。"""


def split_csv(value: str) -> list[str]:
    """把逗号分隔的入参切成去重后的非空列表，保持原始顺序。"""
    if not value:
        return []
    return list(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))


class Command(BaseCommand):
    help = (
        "把指定项目的用例库迁移成模板用例库：每个项目生成一个以项目名命名的模板库，"
        "项目下每个用例库变成模板库的根模块，原模块树整体挂在其下。"
    )

    def add_arguments(self, parser):
        parser.add_argument("--workspace", type=str, required=True, help="工作区 slug")
        parser.add_argument(
            "--projects",
            type=str,
            required=True,
            help="要迁移的项目，逗号分隔，可传项目 ID、项目标识（identifier）或项目名称",
        )
        parser.add_argument(
            "--operator-email",
            type=str,
            default="",
            help="记入 created_by 的操作人邮箱（模板库、模块、用例、附件），不传则为空",
        )
        parser.add_argument("--dry-run", action="store_true", help="只打印将要发生的改动，不落库")

    def handle(self, *args: Any, **options: Any):
        dry_run = options["dry_run"]

        workspace = Workspace.objects.filter(slug=options["workspace"]).first()
        if not workspace:
            raise CommandError(f"工作区不存在：{options['workspace']}")

        operator = self._resolve_operator(options["operator_email"])
        projects = self._resolve_projects(workspace, options["projects"])

        self.stdout.write(
            f"工作区 {workspace.slug}：迁移 {len(projects)} 个项目的用例库到模板库"
            + ("（dry-run，结束时回滚）" if dry_run else "")
        )

        totals = {"repositories": 0, "skipped": 0, "modules": 0, "cases": 0}
        copied_pairs: list[tuple[str, str]] = []
        try:
            # BaseModel.save() 用 crum 取当前用户回填 created_by，命令行里没有请求上下文，靠 impersonate 补上
            with impersonate(operator) if operator else nullcontext(), transaction.atomic():
                for project in projects:
                    self._migrate_project(workspace, project, totals, copied_pairs)
                if dry_run:
                    raise DryRunRollback
        except DryRunRollback:
            pass

        summary = (
            f"迁移 {totals['repositories']} 个用例库（模块 {totals['modules']} 个、用例 {totals['cases']} 条），"
            f"跳过 {totals['skipped']} 个"
        )
        if dry_run:
            self.stdout.write(self.style.WARNING(f"dry-run 完成，已回滚。实际会：{summary}"))
            return

        # 事务已提交，附件与富文本图片同步跟随复制（接口侧是 Celery 异步，命令行里直接跑，失败只记日志）
        if copied_pairs:
            self.stdout.write(f"开始复制 {len(copied_pairs)} 条用例的附件与富文本图片…")
            actor_id = str(operator.id) if operator else None
            for source_id, new_id in copied_pairs:
                copy_case_assets(source_id, new_id, actor_id)

        self.stdout.write(self.style.SUCCESS(f"完成：{summary}"))

    def _resolve_operator(self, operator_email: str) -> User | None:
        if not operator_email:
            return None
        operator = User.objects.filter(email=operator_email).first()
        if not operator:
            raise CommandError(f"操作人邮箱在系统中不存在：{operator_email}")
        return operator

    def _resolve_projects(self, workspace: Workspace, projects_option: str) -> list[Project]:
        tokens = split_csv(projects_option)
        if not tokens:
            raise CommandError("--projects 不能为空")

        # 用 all_objects：Project.objects 会把 is_template=True 的模板项目过滤掉，而这类项目正是迁移对象；
        # 归档项目也允许迁移，只排除软删行
        project_qs = Project.all_objects.filter(workspace=workspace, deleted_at__isnull=True)

        projects: list[Project] = []
        seen: set = set()
        for token in tokens:
            try:
                matched = list(project_qs.filter(pk=uuid.UUID(token)))
            except ValueError:
                matched = list(project_qs.filter(Q(identifier__iexact=token) | Q(name=token)))

            if not matched:
                raise CommandError(f"项目在工作区 {workspace.slug} 中不存在：{token}")
            if len(matched) > 1:
                candidates = "、".join(f"{p.identifier}({p.id})" for p in matched)
                raise CommandError(f"「{token}」匹配到多个项目，请改用项目 ID：{candidates}")

            project = matched[0]
            if project.id not in seen:
                seen.add(project.id)
                projects.append(project)
        return projects

    def _migrate_project(
        self,
        workspace: Workspace,
        project: Project,
        totals: dict,
        copied_pairs: list,
    ) -> None:
        label = f"{project.identifier} {project.name}"
        source_repositories = list(
            TestCaseRepository.objects.filter(
                project=project, is_template=False, deleted_at__isnull=True
            ).order_by("created_at")
        )
        if not source_repositories:
            self.stdout.write(self.style.WARNING(f"[{label}] 项目下没有用例库，跳过"))
            return

        template_repository = self._get_or_create_template_repository(workspace, project)
        self.stdout.write(f"[{label}] → 模板库「{template_repository.name}」({template_repository.id})")

        existing_root_names = set(
            CaseModule.objects.filter(
                repository=template_repository, parent__isnull=True, deleted_at__isnull=True
            ).values_list("name", flat=True)
        )

        for index, repository in enumerate(source_repositories, start=1):
            root_name = repository.name.strip()[:CASE_MODULE_NAME_MAX_LENGTH]
            if root_name != repository.name.strip():
                self.stdout.write(
                    self.style.WARNING(
                        f"  用例库「{repository.name}」名称超过 {CASE_MODULE_NAME_MAX_LENGTH} 字，"
                        f"根模块名截断为「{root_name}」"
                    )
                )
            if root_name in existing_root_names:
                self.stdout.write(
                    self.style.WARNING(f"  用例库「{repository.name}」：模板库已有同名根模块，视为已迁移，跳过")
                )
                totals["skipped"] += 1
                continue
            existing_root_names.add(root_name)

            module_count = CaseModule.objects.filter(repository=repository, deleted_at__isnull=True).count()
            case_count = TestCase.objects.filter(repository=repository, deleted_at__isnull=True).count()

            # 用例库名 → 模板库根模块；sort_order 按源库创建顺序排，避免默认值下按创建时间倒序
            root_module = CaseModule.objects.create(
                name=root_name,
                sort_order=index * 1000,
                repository=template_repository,
                parent=None,
            )
            # 源库根级用例（含所属模块已软删的）直接落在这个根模块下
            root_cases = (
                TestCase.objects.filter(repository=repository, deleted_at__isnull=True)
                .filter(Q(module__isnull=True) | Q(module__deleted_at__isnull=False))
                .prefetch_related("labels", "issues")
            )
            copy_cases_to_module(root_cases, root_module, template_repository.id, copied_pairs, keep_assignee=True)
            # 源库原有模块树整体下沉一级
            source_roots = CaseModule.objects.filter(
                repository=repository, parent__isnull=True, deleted_at__isnull=True
            ).order_by("sort_order", "-created_at")
            for source_root in source_roots:
                copy_module_subtree(source_root, root_module, template_repository.id, copied_pairs, keep_assignee=True)

            totals["repositories"] += 1
            totals["modules"] += module_count
            totals["cases"] += case_count
            self.stdout.write(f"  用例库「{repository.name}」→ 根模块「{root_name}」：模块 {module_count} 个、用例 {case_count} 条")

    def _get_or_create_template_repository(self, workspace: Workspace, project: Project) -> TestCaseRepository:
        existing = list(
            TestCaseRepository.objects.filter(
                workspace=workspace, is_template=True, name=project.name, deleted_at__isnull=True
            ).order_by("created_at")
        )
        if len(existing) > 1:
            ids = "、".join(str(r.id) for r in existing)
            raise CommandError(f"工作区里有多个名为「{project.name}」的模板库，无法确定迁入哪一个：{ids}")
        if existing:
            self.stdout.write(f"  模板库「{project.name}」已存在，复用")
            return existing[0]
        return TestCaseRepository.objects.create(
            name=project.name,
            description=f"迁自项目 {project.identifier} {project.name}",
            workspace=workspace,
            project=None,
            is_template=True,
        )
