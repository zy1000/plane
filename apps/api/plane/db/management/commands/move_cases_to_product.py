# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""把挂在项目上的用例库、用例评审、评审模块迁到产品下（2026-11 用例归产品）。

两步走：
    1. --export 清单.csv   每个还有未迁用例库 / 评审的项目一行；只关联了 1 个产品的项目预填目标产品。
    2. --apply 清单.csv    按「目标产品开发编号」列迁移；默认只预演（真实写入后回滚），加 --commit 才落库。

迁移口径：
- 一个项目整体迁到一个产品：该项目的用例库、评审模块、评审写上 product，同时清空 project ——
  旧的 project 外键是级联删除，不清空的话删掉原项目会把迁到产品下的用例一并软删。
- 用例编号不动（存量编号保留项目前缀，新建用例才用产品前缀）。
- 同一产品下同模块已有同名评审时，迁入的评审名后追加「（原项目名）」。
- 项目还没关联目标产品就顺带关联（ProductProject），保证项目里的计划还能从该产品选用例。
- 可重复执行：已写过 product 的行不会再被选中；清单里目标列为空的项目跳过。
"""

# Python imports
import csv
import uuid
from types import SimpleNamespace

# Django imports
from django.core.management import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count

# Module imports
from plane.db.models import (
    CaseReview,
    CaseReviewModule,
    Product,
    ProductProject,
    Project,
    TestCase,
    TestCaseRepository,
    User,
)
from plane.utils.requirement_project import link_products_to_project

COL_WORKSPACE = "工作区"
COL_PROJECT_ID = "项目ID"
COL_PROJECT_IDENTIFIER = "项目标识"
COL_PROJECT_NAME = "项目名称"
COL_REPOSITORIES = "用例库数"
COL_CASES = "用例数"
COL_REVIEWS = "评审数"
COL_LINKED_PRODUCTS = "已关联产品"
COL_TARGET = "目标产品开发编号"
EXPORT_COLUMNS = [
    COL_WORKSPACE,
    COL_PROJECT_ID,
    COL_PROJECT_IDENTIFIER,
    COL_PROJECT_NAME,
    COL_REPOSITORIES,
    COL_CASES,
    COL_REVIEWS,
    COL_LINKED_PRODUCTS,
    COL_TARGET,
]

REVIEW_NAME_MAX_LENGTH = CaseReview._meta.get_field("name").max_length


class DryRunRollback(Exception):
    """预演跑完真实写入后用它回滚，这样打印的计数和真跑完全一致。"""


def pending_repositories():
    return TestCaseRepository.objects.filter(
        is_template=False, product__isnull=True, project__isnull=False
    )


def pending_project_ids():
    """还有未迁用例库 / 评审模块 / 评审的项目。"""
    ids = set(pending_repositories().values_list("project_id", flat=True))
    ids |= set(
        CaseReviewModule.objects.filter(product__isnull=True, project__isnull=False).values_list(
            "project_id", flat=True
        )
    )
    ids |= set(
        CaseReview.objects.filter(product__isnull=True, project__isnull=False).values_list(
            "project_id", flat=True
        )
    )
    return ids


def unique_review_name(*, product, review, project_name):
    """同产品同模块下撞名时追加「（原项目名）」，仍撞就再加序号。"""
    siblings = CaseReview.objects.filter(product=product, module_id=review.module_id)
    if not siblings.filter(name=review.name).exists():
        return review.name
    base = f"{review.name}（{project_name}）"
    candidate = base[:REVIEW_NAME_MAX_LENGTH]
    index = 2
    while siblings.filter(name=candidate).exists():
        suffix = f"-{index}"
        candidate = f"{base[: REVIEW_NAME_MAX_LENGTH - len(suffix)]}{suffix}"
        index += 1
    return candidate


class Command(BaseCommand):
    help = "把项目下的用例库、用例评审迁到产品下：先 --export 出清单，填好目标产品后 --apply。"

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--export", metavar="CSV", help="导出待迁移项目清单")
        group.add_argument("--apply", metavar="CSV", help="按清单迁移（默认预演）")
        parser.add_argument("--workspace", help="只处理该工作区（slug）")
        parser.add_argument("--commit", action="store_true", help="真正写库；不加只预演")
        parser.add_argument("--operator-email", help="新建项目↔产品关联时记为创建人")

    def handle(self, *args, **options):
        if options["export"]:
            self.export(options["export"], options.get("workspace"))
        else:
            self.apply(
                options["apply"],
                workspace_slug=options.get("workspace"),
                commit=options["commit"],
                operator_email=options.get("operator_email"),
            )

    # ------------------------------------------------------------------ export
    def export(self, path, workspace_slug):
        projects = Project.objects.filter(id__in=pending_project_ids()).select_related("workspace")
        if workspace_slug:
            projects = projects.filter(workspace__slug=workspace_slug)
        projects = projects.order_by("workspace__slug", "identifier")

        project_ids = [project.id for project in projects]
        repo_counts = dict(
            pending_repositories()
            .filter(project_id__in=project_ids)
            .values("project_id")
            .annotate(n=Count("id"))
            .values_list("project_id", "n")
        )
        case_counts = dict(
            TestCase.objects.filter(
                repository__in=pending_repositories().filter(project_id__in=project_ids)
            )
            .values("repository__project_id")
            .annotate(n=Count("id"))
            .values_list("repository__project_id", "n")
        )
        review_counts = dict(
            CaseReview.objects.filter(product__isnull=True, project_id__in=project_ids)
            .values("project_id")
            .annotate(n=Count("id"))
            .values_list("project_id", "n")
        )
        linked = {}
        for row in ProductProject.objects.filter(project_id__in=project_ids).select_related("product"):
            linked.setdefault(row.project_id, []).append(row.product)

        with open(path, "w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=EXPORT_COLUMNS)
            writer.writeheader()
            prefilled = 0
            for project in projects:
                products = linked.get(project.id, [])
                target = products[0].identifier if len(products) == 1 else ""
                prefilled += bool(target)
                writer.writerow(
                    {
                        COL_WORKSPACE: project.workspace.slug,
                        COL_PROJECT_ID: str(project.id),
                        COL_PROJECT_IDENTIFIER: project.identifier,
                        COL_PROJECT_NAME: project.name,
                        COL_REPOSITORIES: repo_counts.get(project.id, 0),
                        COL_CASES: case_counts.get(project.id, 0),
                        COL_REVIEWS: review_counts.get(project.id, 0),
                        COL_LINKED_PRODUCTS: "; ".join(f"{p.identifier} {p.name}" for p in products),
                        COL_TARGET: target,
                    }
                )
        self.stdout.write(
            f"已导出 {len(project_ids)} 个项目到 {path}，其中 {prefilled} 个已预填目标产品，"
            f"其余请在「{COL_TARGET}」列填产品的开发编号。"
        )

    # ------------------------------------------------------------------- apply
    def apply(self, path, *, workspace_slug, commit, operator_email):
        actor = SimpleNamespace(id=None)
        if operator_email:
            actor = User.objects.filter(email=operator_email).first()
            if actor is None:
                raise CommandError(f"找不到用户 {operator_email}")

        try:
            with open(path, encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
        except FileNotFoundError as exc:
            raise CommandError(f"找不到清单 {path}") from exc
        if rows and (COL_PROJECT_ID not in rows[0] or COL_TARGET not in rows[0]):
            raise CommandError(f"清单缺少「{COL_PROJECT_ID}」或「{COL_TARGET}」列")

        stats = {"projects": 0, "repositories": 0, "review_modules": 0, "reviews": 0, "renamed": 0, "linked": 0}
        errors = []
        try:
            with transaction.atomic():
                for line_no, row in enumerate(rows, start=2):
                    target = (row.get(COL_TARGET) or "").strip()
                    if not target:
                        continue
                    error = self.apply_row(row, target, workspace_slug, actor, stats)
                    if error:
                        errors.append(f"第 {line_no} 行：{error}")
                if not commit:
                    raise DryRunRollback()
        except DryRunRollback:
            pass

        mode = "已写库" if commit else "预演（未写库，加 --commit 落库）"
        self.stdout.write(
            f"{mode}：迁移项目 {stats['projects']} 个，用例库 {stats['repositories']} 个，"
            f"评审模块 {stats['review_modules']} 个，评审 {stats['reviews']} 个"
            f"（改名 {stats['renamed']} 个），新关联项目↔产品 {stats['linked']} 条。"
        )
        for error in errors:
            self.stderr.write(error)

        remaining = Project.objects.filter(id__in=pending_project_ids())
        if workspace_slug:
            remaining = remaining.filter(workspace__slug=workspace_slug)
        if commit:
            self.stdout.write(f"仍有 {remaining.count()} 个项目的用例库 / 评审未迁。")

    def apply_row(self, row, target, workspace_slug, actor, stats):
        project_id = (row.get(COL_PROJECT_ID) or "").strip()
        try:
            uuid.UUID(project_id)
        except ValueError:
            return f"项目ID「{project_id}」格式不对"
        project = Project.objects.filter(id=project_id).select_related("workspace").first()
        if project is None:
            return f"项目 {project_id} 不存在"
        if workspace_slug and project.workspace.slug != workspace_slug:
            return None
        product = Product.objects.filter(workspace_id=project.workspace_id, identifier=target).first()
        if product is None:
            return f"项目 {project.identifier} 的目标产品「{target}」在工作区 {project.workspace.slug} 不存在"

        with transaction.atomic():
            repositories = pending_repositories().filter(project_id=project.id)
            modules = CaseReviewModule.objects.filter(project_id=project.id, product__isnull=True)
            reviews = list(CaseReview.objects.filter(project_id=project.id, product__isnull=True))

            # 清空 project：断开原项目的级联删除，迁过去就只归产品
            stats["repositories"] += repositories.update(product_id=product.id, project_id=None)
            stats["review_modules"] += modules.update(product_id=product.id, project_id=None)
            for review in reviews:
                name = unique_review_name(product=product, review=review, project_name=project.name)
                stats["renamed"] += name != review.name
                CaseReview.objects.filter(id=review.id).update(
                    product_id=product.id, project_id=None, name=name
                )
            stats["reviews"] += len(reviews)
            stats["linked"] += len(
                link_products_to_project(project=project, product_ids=[product.id], actor=actor)
            )
            stats["projects"] += 1
        return None
