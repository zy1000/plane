"""用例批量改属性：模板库与项目用例各一个入口，共用同一套更新逻辑。

属性（维护人 / 优先级 / 用例类型 / 测试类型）一条 UPDATE 写完；标签按加减语义
直接操作 M2M 中间表。活动轨迹逐条用例记，但整批只派一个后台任务。
"""

import json
from collections import defaultdict

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.qa import CaseBulkUpdateSerializer
from plane.app.views import BaseAPIView
from plane.bgtasks.test_case_activities_task import test_case_bulk_update_activity
from plane.db.models import CaseLabel, TestCase

_SCALAR_FIELDS = ("priority", "type", "test_type")


def bulk_update_cases(cases_queryset, validated, actor_id):
    """在已按作用域收窄的 queryset 上批量改属性，返回实际更新的用例数。"""
    case_ids = [str(i) for i in validated["cases_id"]]
    cases = list(
        cases_queryset.filter(id__in=case_ids).only(
            "id", "repository", "assignee", *_SCALAR_FIELDS
        )
    )
    if not cases:
        return 0
    found_ids = [c.id for c in cases]

    through = TestCase.labels.through
    labels_by_case = defaultdict(set)
    for case_id, label_id in through.objects.filter(testcase_id__in=found_ids).values_list(
        "testcase_id", "caselabel_id"
    ):
        labels_by_case[case_id].add(str(label_id))

    # 标签只能落在用例所在库：别的库的标签对这条用例静默忽略
    label_ids = [*(validated.get("add_labels") or []), *(validated.get("remove_labels") or [])]
    label_repository = {
        str(label_id): repository_id
        for label_id, repository_id in CaseLabel.objects.filter(id__in=label_ids).values_list(
            "id", "repository_id"
        )
    }
    add_labels = [str(i) for i in validated.get("add_labels") or [] if str(i) in label_repository]
    remove_labels = [str(i) for i in validated.get("remove_labels") or [] if str(i) in label_repository]

    fields = {name: validated[name] for name in _SCALAR_FIELDS if name in validated}
    if "assignee" in validated:
        fields["assignee_id"] = validated["assignee"]

    activity_items = []
    new_links = []
    removed_links = defaultdict(list)
    for case in cases:
        old_labels = labels_by_case[case.id]
        new_labels = set(old_labels)
        for label_id in add_labels:
            if label_repository[label_id] == case.repository_id and label_id not in old_labels:
                new_labels.add(label_id)
                new_links.append(through(testcase_id=case.id, caselabel_id=label_id))
        for label_id in remove_labels:
            if label_id in old_labels:
                new_labels.discard(label_id)
                removed_links[label_id].append(case.id)

        requested = {name: fields[name] for name in _SCALAR_FIELDS if name in fields}
        if "assignee_id" in fields:
            requested["assignee_id"] = str(fields["assignee_id"]) if fields["assignee_id"] else None
        if new_labels != old_labels:
            requested["labels"] = sorted(new_labels)
        activity_items.append(
            {
                "case_id": str(case.id),
                "requested_data": json.dumps(requested),
                # 快照只需覆盖本次可能改到的字段，活动 diff 只看 requested 里出现的键
                "current_instance": json.dumps(
                    {
                        "priority": case.priority,
                        "type": case.type,
                        "test_type": case.test_type,
                        "assignee_id": str(case.assignee_id) if case.assignee_id else None,
                        "labels": sorted(old_labels),
                    }
                ),
            }
        )

    with transaction.atomic():
        TestCase.objects.filter(id__in=found_ids).update(
            **fields, updated_at=timezone.now(), updated_by_id=actor_id
        )
        if new_links:
            through.objects.bulk_create(new_links, batch_size=500, ignore_conflicts=True)
        for label_id, ids in removed_links.items():
            through.objects.filter(caselabel_id=label_id, testcase_id__in=ids).delete()

        epoch = int(timezone.now().timestamp())
        transaction.on_commit(
            lambda: test_case_bulk_update_activity.delay(
                items=activity_items, actor_id=str(actor_id), epoch=epoch
            )
        )
    return len(cases)


def _bulk_update_response(request, slug, queryset):
    serializer = CaseBulkUpdateSerializer(data=request.data, context={"slug": slug})
    serializer.is_valid(raise_exception=True)
    updated = bulk_update_cases(queryset, serializer.validated_data, request.user.id)
    return Response({"updated": updated}, status=status.HTTP_200_OK)


class TemplateCaseBulkUpdateAPIView(BaseAPIView):
    """模板库用例批量改属性。"""

    @allow_fine_permission(PermissionKey.WORKSPACE_CASE_TEMPLATE_MANAGE, level="WORKSPACE")
    def post(self, request, slug):
        queryset = TestCase.objects.filter(
            repository__workspace__slug=slug, repository__is_template=True
        )
        return _bulk_update_response(request, slug, queryset)


class CaseBulkUpdateAPIView(BaseAPIView):
    """项目用例批量改属性。"""

    @allow_fine_permission(PermissionKey.QA_CASE_EDIT)
    def post(self, request, slug, project_id):
        queryset = TestCase.objects.filter(
            repository__workspace__slug=slug, repository__project_id=project_id
        )
        return _bulk_update_response(request, slug, queryset)
