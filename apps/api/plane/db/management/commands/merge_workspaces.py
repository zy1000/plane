# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import re
import uuid
from collections import defaultdict
from pathlib import Path

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import models, transaction
from django.db.models import Q

from plane.db.models import (
    Project,
    ProjectBaseModel,
    ProjectIdentifier,
    Workspace,
    WorkspaceBaseModel,
    WorkspaceMember,
    WorkspaceMemberInvite,
)


class Command(BaseCommand):
    help = "Merge multiple source workspaces into one target workspace while keeping projects separate."

    handled_workspace_models = {
        "db.Project",
        "db.ProjectIdentifier",
        "db.WorkspaceMember",
        "db.WorkspaceMemberInvite",
    }

    def add_arguments(self, parser):
        parser.add_argument(
            "--target-workspace",
            required=True,
            help="Target workspace slug or id.",
        )
        parser.add_argument(
            "--source-workspaces",
            required=True,
            help="Comma separated source workspace slugs or ids.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply the migration. Without this flag the command runs as a dry-run.",
        )
        parser.add_argument(
            "--output-report",
            help="Optional path to write the JSON migration report.",
        )
        parser.add_argument(
            "--project-conflict-strategy",
            choices=("prefix-source-slug", "suffix-source-slug"),
            default="prefix-source-slug",
            help="How to rename conflicting project identifiers and names.",
        )
        parser.add_argument(
            "--deactivate-migrated-webhooks",
            action="store_true",
            help="Set migrated workspace webhooks to inactive to avoid accidental external calls.",
        )

    def handle(self, *args, **options):
        target_workspace = self.get_workspace(options["target_workspace"])
        source_workspaces = self.get_source_workspaces(options["source_workspaces"], target_workspace)
        apply_changes = options["apply"]

        report = self.build_report(
            target_workspace=target_workspace,
            source_workspaces=source_workspaces,
            conflict_strategy=options["project_conflict_strategy"],
            deactivate_migrated_webhooks=options["deactivate_migrated_webhooks"],
        )
        report["mode"] = "apply" if apply_changes else "dry-run"

        if apply_changes:
            self.stdout.write(self.style.WARNING("Applying workspace merge inside a database transaction."))
            with transaction.atomic():
                self.apply_merge(report)
                report["validation"] = self.validate_merge(report)
        else:
            report["validation"] = self.validate_merge(report, dry_run=True)

        self.write_report(report, options.get("output_report"))

        if apply_changes:
            self.stdout.write(self.style.SUCCESS("Workspace merge completed. Review the JSON report for skipped items."))
        else:
            self.stdout.write(self.style.WARNING("Dry-run completed. Re-run with --apply to execute the migration."))

    def get_workspace(self, value):
        queryset = Workspace.all_objects if hasattr(Workspace, "all_objects") else Workspace.objects
        filters = Q(slug=value)
        try:
            filters |= Q(id=uuid.UUID(value))
        except ValueError:
            pass

        workspace = queryset.filter(filters, deleted_at__isnull=True).first()
        if workspace is None:
            raise CommandError(f"Workspace '{value}' was not found.")
        return workspace

    def get_source_workspaces(self, values, target_workspace):
        identifiers = [value.strip() for value in values.split(",") if value.strip()]
        if not identifiers:
            raise CommandError("At least one source workspace is required.")

        source_workspaces = []
        seen_ids = set()
        for identifier in identifiers:
            workspace = self.get_workspace(identifier)
            if workspace.id == target_workspace.id:
                raise CommandError("The target workspace cannot also be a source workspace.")
            if workspace.id in seen_ids:
                continue
            seen_ids.add(workspace.id)
            source_workspaces.append(workspace)

        return source_workspaces

    def build_report(self, target_workspace, source_workspaces, conflict_strategy, deactivate_migrated_webhooks):
        source_ids = [workspace.id for workspace in source_workspaces]
        source_projects = list(Project.objects.filter(workspace_id__in=source_ids).order_by("workspace_id", "created_at"))
        project_plan = self.plan_project_moves(target_workspace, source_projects, conflict_strategy)
        project_ids = [project["id"] for project in project_plan]

        report = {
            "mode": "apply-ready",
            "target_workspace": self.serialize_workspace(target_workspace),
            "source_workspaces": [self.serialize_workspace(workspace) for workspace in source_workspaces],
            "options": {
                "project_conflict_strategy": conflict_strategy,
                "deactivate_migrated_webhooks": deactivate_migrated_webhooks,
            },
            "baseline": self.build_baseline(source_ids, project_ids),
            "precheck": {
                "project_moves": project_plan,
                "member_moves": self.plan_workspace_members(target_workspace, source_ids),
                "invite_moves": self.plan_workspace_invites(target_workspace, source_ids),
                "workspace_model_moves": self.plan_workspace_model_moves(target_workspace, source_ids, project_ids),
                "project_scoped_models": self.plan_project_scoped_models(project_ids),
                "json_fields": self.find_json_fields(source_ids, project_ids),
                "rollout": self.rollout_checklist(),
                "rollback": self.rollback_checklist(),
            },
            "operations": [],
            "skipped": [],
            "warnings": [],
        }

        if report["precheck"]["workspace_model_moves"]["skipped"]:
            report["warnings"].append(
                "Some workspace-level records have uniqueness conflicts and will be skipped for manual review."
            )

        if report["precheck"]["json_fields"]:
            report["warnings"].append(
                "JSON fields may contain workspace/project/entity references. The command reports them but does not rewrite JSON."
            )

        return report

    def build_baseline(self, source_ids, project_ids):
        return {
            "source_workspace_count": len(source_ids),
            "project_count": len(project_ids),
            "project_scoped_counts": self.model_counts_for_project_ids(project_ids),
            "workspace_scoped_counts": self.model_counts_for_workspace_ids(source_ids),
        }

    def plan_project_moves(self, target_workspace, source_projects, conflict_strategy):
        taken_identifiers = set(
            Project.objects.filter(workspace=target_workspace, deleted_at__isnull=True).values_list("identifier", flat=True)
        )
        taken_names = set(
            Project.objects.filter(workspace=target_workspace, deleted_at__isnull=True).values_list("name", flat=True)
        )

        project_plan = []
        for project in source_projects:
            source_workspace = project.workspace
            new_identifier = self.unique_project_identifier(
                project.identifier,
                source_workspace.slug,
                taken_identifiers,
                conflict_strategy,
            )
            new_name = self.unique_project_name(project.name, source_workspace.slug, taken_names, conflict_strategy)
            taken_identifiers.add(new_identifier)
            taken_names.add(new_name)

            project_plan.append(
                {
                    "id": str(project.id),
                    "source_workspace_id": str(source_workspace.id),
                    "source_workspace_slug": source_workspace.slug,
                    "old_identifier": project.identifier,
                    "new_identifier": new_identifier,
                    "identifier_changed": project.identifier != new_identifier,
                    "old_name": project.name,
                    "new_name": new_name,
                    "name_changed": project.name != new_name,
                }
            )

        return project_plan

    def plan_workspace_members(self, target_workspace, source_ids):
        source_members = (
            WorkspaceMember.objects.filter(workspace_id__in=source_ids)
            .select_related("member", "workspace")
            .order_by("workspace_id", "created_at", "id")
        )
        plan = {"move": [], "merge": []}
        member_targets = {}

        for source_member in source_members:
            target = (
                member_targets.get(source_member.member_id)
                if source_member.deleted_at is None
                else None
            )
            if target is None:
                target_member = WorkspaceMember.objects.filter(
                    workspace=target_workspace,
                    member=source_member.member,
                    deleted_at__isnull=True,
                ).first()
                if target_member:
                    target = {"id": str(target_member.id), "role": target_member.role}
                    member_targets[source_member.member_id] = target

            item = {
                "source_id": str(source_member.id),
                "source_workspace_id": str(source_member.workspace_id),
                "member_id": str(source_member.member_id),
                "member_email": getattr(source_member.member, "email", None),
                "source_role": source_member.role,
            }
            if target:
                merged_role = max(source_member.role, target["role"])
                item.update(
                    {
                        "target_id": target["id"],
                        "target_role": target["role"],
                        "merged_role": merged_role,
                    }
                )
                plan["merge"].append(item)
                target["role"] = merged_role
            else:
                plan["move"].append(item)
                if source_member.deleted_at is None:
                    member_targets[source_member.member_id] = {
                        "id": str(source_member.id),
                        "role": source_member.role,
                    }

        return plan

    def plan_workspace_invites(self, target_workspace, source_ids):
        source_invites = (
            WorkspaceMemberInvite.objects.filter(workspace_id__in=source_ids)
            .select_related("workspace")
            .order_by("workspace_id", "created_at", "id")
        )
        plan = {"move": [], "skip_duplicate_email": []}
        invite_targets = {}

        for source_invite in source_invites:
            email_key = source_invite.email.casefold()
            target_id = invite_targets.get(email_key) if source_invite.deleted_at is None else None
            if target_id is None:
                target_invite = WorkspaceMemberInvite.objects.filter(
                    workspace=target_workspace,
                    email__iexact=source_invite.email,
                    deleted_at__isnull=True,
                ).first()
                if target_invite:
                    target_id = str(target_invite.id)
                    invite_targets[email_key] = target_id

            item = {
                "source_id": str(source_invite.id),
                "source_workspace_id": str(source_invite.workspace_id),
                "email": source_invite.email,
                "role": source_invite.role,
                "accepted": source_invite.accepted,
            }
            if target_id:
                item["target_id"] = target_id
                plan["skip_duplicate_email"].append(item)
            else:
                plan["move"].append(item)
                if source_invite.deleted_at is None:
                    invite_targets[email_key] = str(source_invite.id)

        return plan

    def plan_workspace_model_moves(self, target_workspace, source_ids, project_ids):
        plan = {"bulk_update": [], "row_update": [], "skipped": []}
        for model in self.workspace_models():
            label = self.model_label(model)
            if label in self.handled_workspace_models:
                continue

            direct_queryset = self.direct_workspace_queryset(model, source_ids, project_ids)
            direct_count = direct_queryset.count()
            if direct_count == 0:
                continue

            unique_constraints = self.workspace_unique_fields(model)
            if not unique_constraints:
                plan["bulk_update"].append({"model": label, "count": direct_count})
                continue

            planned_unique_values = defaultdict(set)
            for obj in direct_queryset:
                conflict = self.workspace_unique_conflict(model, obj, target_workspace, unique_constraints)
                item = {
                    "model": label,
                    "id": str(obj.pk),
                    "source_workspace_id": str(obj.workspace_id),
                }
                planned_conflict = self.planned_workspace_unique_conflict(
                    model,
                    obj,
                    unique_constraints,
                    planned_unique_values,
                )
                if conflict or planned_conflict:
                    item["conflict"] = conflict or planned_conflict
                    plan["skipped"].append(item)
                else:
                    self.remember_workspace_unique_values(
                        model,
                        obj,
                        unique_constraints,
                        planned_unique_values,
                    )
                    plan["row_update"].append(item)

        return plan

    def planned_workspace_unique_conflict(self, model, obj, unique_constraints, planned_unique_values):
        if self.has_field(model, "deleted_at") and obj.deleted_at is not None:
            return None

        for fields in unique_constraints:
            signature = self.workspace_unique_signature(model, obj, fields)
            if signature in planned_unique_values[fields]:
                return {
                    "fields": fields,
                    "values": self.workspace_unique_values(model, obj, fields),
                    "source": "planned_row_update",
                }

        return None

    def remember_workspace_unique_values(self, model, obj, unique_constraints, planned_unique_values):
        if self.has_field(model, "deleted_at") and obj.deleted_at is not None:
            return

        for fields in unique_constraints:
            planned_unique_values[fields].add(self.workspace_unique_signature(model, obj, fields))

    def workspace_unique_signature(self, model, obj, fields):
        return tuple(
            (field_name, self.workspace_unique_field_value(model, obj, field_name))
            for field_name in fields
            if field_name not in ("workspace", "deleted_at")
        )

    def workspace_unique_values(self, model, obj, fields):
        return {
            field_name: str(self.workspace_unique_field_value(model, obj, field_name))
            for field_name in fields
            if field_name not in ("workspace", "deleted_at")
        }

    def workspace_unique_field_value(self, model, obj, field_name):
        field = model._meta.get_field(field_name)
        if field.is_relation and field.many_to_one:
            return getattr(obj, field.attname)
        return getattr(obj, field_name)

    def plan_project_scoped_models(self, project_ids):
        return [
            {"model": self.model_label(model), "count": self.project_queryset(model, project_ids).count()}
            for model in self.project_scoped_models()
            if self.project_queryset(model, project_ids).exists()
        ]

    def apply_merge(self, report):
        target_id = report["target_workspace"]["id"]
        source_ids = [workspace["id"] for workspace in report["source_workspaces"]]
        project_ids = [project["id"] for project in report["precheck"]["project_moves"]]

        self.apply_member_moves(report, target_id)
        self.apply_invite_moves(report, target_id)
        self.apply_project_moves(report, target_id)
        self.apply_project_identifier_moves(report, target_id, project_ids)
        self.apply_project_scoped_model_moves(report, target_id, project_ids)
        self.apply_workspace_base_model_moves(report, target_id, source_ids, project_ids)
        self.apply_direct_workspace_model_moves(report, target_id, source_ids, project_ids)
        self.apply_workspace_member_references(report, target_id)

        if report["options"]["deactivate_migrated_webhooks"]:
            self.deactivate_migrated_webhooks(report, target_id)

    def apply_member_moves(self, report, target_id):
        member_plan = report["precheck"]["member_moves"]
        for item in member_plan["move"]:
            count = WorkspaceMember.objects.filter(id=item["source_id"]).update(workspace_id=target_id)
            self.record_operation(report, "move_workspace_member", "db.WorkspaceMember", count, item)

        for item in member_plan["merge"]:
            count = WorkspaceMember.objects.filter(id=item["target_id"]).update(role=item["merged_role"], is_active=True)
            self.record_operation(report, "merge_workspace_member", "db.WorkspaceMember", count, item)

    def apply_invite_moves(self, report, target_id):
        invite_plan = report["precheck"]["invite_moves"]
        for item in invite_plan["move"]:
            count = WorkspaceMemberInvite.objects.filter(id=item["source_id"]).update(workspace_id=target_id)
            self.record_operation(report, "move_workspace_invite", "db.WorkspaceMemberInvite", count, item)

        for item in invite_plan["skip_duplicate_email"]:
            report["skipped"].append({"operation": "workspace_invite_duplicate_email", **item})

    def apply_project_moves(self, report, target_id):
        for item in report["precheck"]["project_moves"]:
            count = Project.objects.filter(id=item["id"]).update(
                workspace_id=target_id,
                identifier=item["new_identifier"],
                name=item["new_name"],
            )
            self.record_operation(report, "move_project", "db.Project", count, item)

    def apply_project_identifier_moves(self, report, target_id, project_ids):
        identifier_by_project = {
            item["id"]: item["new_identifier"]
            for item in report["precheck"]["project_moves"]
        }
        identifiers = ProjectIdentifier.objects.filter(project_id__in=project_ids)
        for identifier in identifiers:
            new_name = identifier_by_project.get(str(identifier.project_id), identifier.name)
            count = ProjectIdentifier.objects.filter(id=identifier.id).update(workspace_id=target_id, name=new_name)
            self.record_operation(
                report,
                "move_project_identifier",
                "db.ProjectIdentifier",
                count,
                {"id": str(identifier.id), "project_id": str(identifier.project_id), "name": new_name},
            )

    def apply_project_scoped_model_moves(self, report, target_id, project_ids):
        for model in self.project_scoped_models():
            queryset = self.project_queryset(model, project_ids)
            count = queryset.update(workspace_id=target_id)
            if count:
                self.record_operation(report, "sync_project_scoped_model", self.model_label(model), count)

        for model in self.project_field_workspace_models():
            if issubclass(model, ProjectBaseModel) or issubclass(model, WorkspaceBaseModel):
                continue
            queryset = self.project_queryset(model, project_ids)
            count = queryset.update(workspace_id=target_id)
            if count:
                self.record_operation(report, "sync_direct_project_workspace_model", self.model_label(model), count)

    def apply_workspace_base_model_moves(self, report, target_id, source_ids, project_ids):
        for model in self.workspace_base_models():
            project_queryset = model.objects.filter(project_id__in=project_ids)
            project_count = project_queryset.update(workspace_id=target_id)
            if project_count:
                self.record_operation(report, "sync_workspace_base_project_model", self.model_label(model), project_count)

            direct_queryset = model.objects.filter(workspace_id__in=source_ids, project_id__isnull=True)
            direct_count = direct_queryset.update(workspace_id=target_id)
            if direct_count:
                self.record_operation(report, "move_workspace_base_direct_model", self.model_label(model), direct_count)

    def apply_direct_workspace_model_moves(self, report, target_id, source_ids, project_ids):
        skipped_ids = defaultdict(set)
        for item in report["precheck"]["workspace_model_moves"]["skipped"]:
            skipped_ids[item["model"]].add(item["id"])
            report["skipped"].append({"operation": "workspace_unique_conflict", **item})

        row_ids = defaultdict(list)
        for item in report["precheck"]["workspace_model_moves"]["row_update"]:
            row_ids[item["model"]].append(item["id"])

        for model in self.workspace_models():
            label = self.model_label(model)
            if label in self.handled_workspace_models:
                continue

            if row_ids.get(label):
                count = model.objects.filter(id__in=row_ids[label]).update(workspace_id=target_id)
                self.record_operation(report, "move_workspace_model_rows", label, count)
                continue

            if skipped_ids.get(label):
                continue

            direct_queryset = self.direct_workspace_queryset(model, source_ids, project_ids)
            count = direct_queryset.update(workspace_id=target_id)
            if count:
                self.record_operation(report, "move_workspace_model_bulk", label, count)

    def apply_workspace_member_references(self, report, target_id):
        member_plan = report["precheck"]["member_moves"]
        member_map = {
            item["source_id"]: item["target_id"]
            for item in member_plan["merge"]
        }
        if not member_map:
            return

        WorkspaceGroupMember = apps.get_model("db", "WorkspaceGroupMember")
        for source_member_id, target_member_id in member_map.items():
            queryset = WorkspaceGroupMember.objects.filter(
                member_id=source_member_id,
                group__workspace_id=target_id,
                deleted_at__isnull=True,
            )
            for relation in queryset:
                duplicate_exists = WorkspaceGroupMember.objects.filter(
                    group_id=relation.group_id,
                    member_id=target_member_id,
                    deleted_at__isnull=True,
                ).exists()
                if duplicate_exists:
                    report["skipped"].append(
                        {
                            "operation": "workspace_group_member_duplicate",
                            "id": str(relation.id),
                            "group_id": str(relation.group_id),
                            "source_member_id": source_member_id,
                            "target_member_id": target_member_id,
                        }
                    )
                    continue

                count = WorkspaceGroupMember.objects.filter(id=relation.id).update(member_id=target_member_id)
                self.record_operation(
                    report,
                    "remap_workspace_group_member",
                    self.model_label(WorkspaceGroupMember),
                    count,
                    {"id": str(relation.id), "target_member_id": target_member_id},
                )

    def deactivate_migrated_webhooks(self, report, target_id):
        Webhook = apps.get_model("db", "Webhook")
        moved_webhook_ids = [
            item["id"]
            for item in report["precheck"]["workspace_model_moves"]["row_update"]
            if item["model"] == self.model_label(Webhook)
        ]
        moved_count = Webhook.objects.filter(
            id__in=moved_webhook_ids,
            workspace_id=target_id,
            is_active=True,
        ).update(is_active=False)
        self.record_operation(
            report,
            "deactivate_migrated_webhooks",
            self.model_label(Webhook),
            moved_count,
            {"webhook_ids": moved_webhook_ids},
        )

    def validate_merge(self, report, dry_run=False):
        target_id = report["target_workspace"]["id"]
        source_ids = [workspace["id"] for workspace in report["source_workspaces"]]
        project_ids = [project["id"] for project in report["precheck"]["project_moves"]]

        if dry_run:
            return {
                "dry_run": True,
                "checks": self.validation_checklist(),
            }

        project_residual = Project.objects.filter(workspace_id__in=source_ids, id__in=project_ids).count()
        inconsistent_models = []

        for model in self.models_with_project_and_workspace():
            queryset = self.project_queryset(model, project_ids).exclude(workspace_id=target_id)
            count = queryset.count()
            if count:
                inconsistent_models.append({"model": self.model_label(model), "count": count})

        post_project_counts = self.model_counts_for_project_ids(project_ids)
        post_workspace_counts = self.model_counts_for_workspace_ids(source_ids)

        return {
            "dry_run": False,
            "source_project_residual_count": project_residual,
            "inconsistent_project_workspace_models": inconsistent_models,
            "post_project_scoped_counts": post_project_counts,
            "source_workspace_residual_counts": post_workspace_counts,
            "baseline_project_scoped_counts_match": post_project_counts == report["baseline"]["project_scoped_counts"],
            "checks": self.validation_checklist(),
        }

    def model_counts_for_project_ids(self, project_ids):
        counts = {}
        for model in self.models_with_project_field():
            count = self.project_queryset(model, project_ids).count()
            if count:
                counts[self.model_label(model)] = count
        return counts

    def model_counts_for_workspace_ids(self, source_ids):
        counts = {}
        for model in self.workspace_models():
            count = model.objects.filter(workspace_id__in=source_ids).count()
            if count:
                counts[self.model_label(model)] = count
        return counts

    def find_json_fields(self, source_ids, project_ids):
        fields = []
        for model in apps.get_models():
            json_field_names = [
                field.name
                for field in model._meta.fields
                if isinstance(field, models.JSONField)
            ]
            if not json_field_names:
                continue

            queryset = None
            if self.has_relation_field(model, "project", Project):
                queryset = self.project_queryset(model, project_ids)
            elif self.has_relation_field(model, "workspace", Workspace):
                queryset = model.objects.filter(workspace_id__in=source_ids)

            if queryset is None:
                continue

            count = queryset.count()
            if count:
                fields.append({"model": self.model_label(model), "fields": json_field_names, "count": count})

        return fields

    def project_scoped_models(self):
        return [
            model
            for model in apps.get_models()
            if issubclass(model, ProjectBaseModel)
            and not model._meta.abstract
            and self.has_relation_field(model, "workspace", Workspace)
        ]

    def workspace_base_models(self):
        return [
            model
            for model in apps.get_models()
            if issubclass(model, WorkspaceBaseModel)
            and not model._meta.abstract
            and self.has_relation_field(model, "workspace", Workspace)
        ]

    def workspace_models(self):
        return [
            model
            for model in apps.get_models()
            if self.has_relation_field(model, "workspace", Workspace) and not model._meta.abstract
        ]

    def project_field_workspace_models(self):
        return [
            model
            for model in apps.get_models()
            if self.has_relation_field(model, "project", Project)
            and self.has_relation_field(model, "workspace", Workspace)
            and not model._meta.abstract
        ]

    def models_with_project_and_workspace(self):
        return self.project_field_workspace_models()

    def models_with_project_field(self):
        return [
            model
            for model in apps.get_models()
            if self.has_relation_field(model, "project", Project) and not model._meta.abstract
        ]

    def direct_workspace_queryset(self, model, source_ids, project_ids):
        queryset = model.objects.filter(workspace_id__in=source_ids)
        if self.has_relation_field(model, "project", Project):
            queryset = queryset.filter(Q(project_id__isnull=True) | Q(project_id__in=project_ids))
        return queryset

    def project_queryset(self, model, project_ids):
        return model.objects.filter(project_id__in=project_ids)

    def workspace_unique_fields(self, model):
        unique_fields = []

        for constraint in model._meta.constraints:
            if isinstance(constraint, models.UniqueConstraint) and "workspace" in constraint.fields:
                unique_fields.append(tuple(constraint.fields))

        unique_together = model._meta.unique_together or []
        if unique_together:
            if isinstance(unique_together[0], str):
                unique_together = [unique_together]
            for fields in unique_together:
                if "workspace" in fields:
                    unique_fields.append(tuple(fields))

        return list(dict.fromkeys(unique_fields))

    def workspace_unique_conflict(self, model, obj, target_workspace, unique_constraints):
        for fields in unique_constraints:
            filters = {"workspace": target_workspace}
            for field_name in fields:
                if field_name in ("workspace", "deleted_at"):
                    continue
                filters[field_name] = getattr(obj, field_name)

            queryset = model.objects.filter(**filters)
            if self.has_field(model, "deleted_at"):
                queryset = queryset.filter(deleted_at__isnull=True)
            if queryset.exclude(pk=obj.pk).exists():
                return {
                    "fields": fields,
                    "values": {field: str(filters[field]) for field in filters},
                }

        return None

    def unique_project_identifier(self, identifier, source_slug, taken, strategy):
        identifier = (identifier or "PRJ").strip().upper()
        if identifier not in taken:
            return identifier

        slug = self.identifier_fragment(source_slug)
        if strategy == "suffix-source-slug":
            base = f"{identifier[: max(1, 11 - len(slug))]}-{slug}"
        else:
            base = f"{slug}-{identifier[: max(1, 11 - len(slug))]}"
        base = base[:12]
        candidate = base
        index = 1
        while candidate in taken:
            suffix = str(index)
            candidate = f"{base[: 12 - len(suffix)]}{suffix}"
            index += 1
        return candidate

    def unique_project_name(self, name, source_slug, taken, strategy):
        name = name or "Untitled Project"
        if name not in taken:
            return name

        if strategy == "suffix-source-slug":
            base = f"{name} ({source_slug})"
        else:
            base = f"{source_slug} - {name}"
        candidate = base
        index = 1
        while candidate in taken:
            candidate = f"{base} {index}"
            index += 1
        return candidate

    def identifier_fragment(self, value):
        fragment = re.sub(r"[^A-Z0-9]", "", value.upper())
        return (fragment or "WS")[:4]

    def serialize_workspace(self, workspace):
        return {
            "id": str(workspace.id),
            "slug": workspace.slug,
            "name": workspace.name,
        }

    def model_label(self, model):
        return f"{model._meta.app_label}.{model.__name__}"

    def has_field(self, model, field_name):
        return any(field.name == field_name for field in model._meta.fields)

    def has_relation_field(self, model, field_name, related_model):
        field = next((field for field in model._meta.fields if field.name == field_name), None)
        if field is None or not field.is_relation:
            return False
        return field.remote_field and field.remote_field.model == related_model

    def record_operation(self, report, operation, model, count, detail=None):
        report["operations"].append(
            {
                "operation": operation,
                "model": model,
                "count": count,
                "detail": detail or {},
            }
        )

    def write_report(self, report, output_report):
        payload = json.dumps(report, indent=2, ensure_ascii=False, default=str)
        if output_report:
            report_path = Path(output_report)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(payload, encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Report written to {report_path}"))
            return

        self.stdout.write(payload)

    def rollout_checklist(self):
        return [
            "Take a database backup before --apply.",
            "Run this command in dry-run mode against production-like data first.",
            "Freeze writes to source workspaces during the apply window.",
            "Review skipped workspace-level conflicts before deleting or archiving source workspaces.",
            "Keep source workspaces for an observation period; do not hard-delete immediately.",
        ]

    def rollback_checklist(self):
        return [
            "Prefer restoring the pre-migration database backup if the apply step fails or validation finds broad issues.",
            "For a targeted rollback, use project_moves to restore each Project.workspace_id, identifier, and name.",
            "Use operations entries to identify which workspace-scoped rows were moved to the target workspace.",
            "Review skipped entries before deciding whether source workspaces can be archived.",
        ]

    def validation_checklist(self):
        return [
            "Open the target workspace project list and confirm migrated projects are visible.",
            "Open migrated project detail, work item list, work item detail, comments, and activity.",
            "Check cycles, modules, pages, views, approvals, and notifications for migrated projects.",
            "Confirm member permissions and group membership in the target workspace.",
            "Verify attachments and images still resolve with the target workspace slug.",
            "Review Webhook and integration settings before re-enabling external side effects.",
        ]
