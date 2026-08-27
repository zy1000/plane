from collections import defaultdict
from decimal import Decimal


from django.db.models import Count
from django.db.models.expressions import result
from django.utils import timezone
from rest_framework import serializers
from rest_framework.serializers import ModelSerializer

from plane.app.serializers import (
    UserLiteSerializer,
    BaseSerializer,
    IssueAssigneeSerializer,
    ProjectDetailSerializer,
)
from plane.db.models import (
    TestPlan,
    TestCaseRepository,
    User,
    TestCase,
    CaseLabel,
    CaseModule,
    FileAsset,
    Issue,
    CaseReviewModule,
    CaseReview,
    CaseReviewThrough,
    TestCaseComment,
    TestCaseActivity,
    CaseReviewRecord,
    PlanModule,
    PlanCase,
    TestCaseVersion,
    TestReport,
)
from plane.utils.qa import re_approval_case

from .plan import *
from .report import *


class CaseLabelListSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaseLabel
        fields = "__all__"


class CaseModuleListSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = CaseModule
        fields = [
            "id",
            "name",
            "sort_order",
            "created_at",
            "updated_at",
            "children",  # 递归显示所有子节点
            "repository",
        ]

    def get_children(self, obj):
        """
        递归获取所有子节点
        """
        # 获取直接子节点（未删除的）
        direct_children = obj.children.filter(deleted_at__isnull=True).order_by(
            "sort_order"
        )

        # 使用相同的序列化器递归序列化子节点
        serializer = CaseModuleListSerializer(
            direct_children, many=True, context=self.context
        )
        return serializer.data


class TestPlanCreateUpdateSerializer(ModelSerializer):
    """
    Serializer for creating a TestPlan.
    """

    cases = serializers.PrimaryKeyRelatedField(
        queryset=TestCase.objects.all(), many=True, required=False
    )

    def update(self, instance, validated_data):
        cases = validated_data.pop("cases", None)
        instance = super().update(instance, validated_data)
        if cases is not None:
            current_ids = set(
                PlanCase.objects.filter(plan=instance).values_list("case_id", flat=True)
            )
            new_ids = set([c.id for c in cases])
            add_ids = new_ids - current_ids
            remove_ids = current_ids - new_ids
            if add_ids:
                for case in TestCase.objects.filter(id__in=add_ids):
                    PlanCase.objects.get_or_create(plan=instance, case=case)
            if remove_ids:
                PlanCase.objects.filter(plan=instance, case_id__in=remove_ids).delete()
        return instance

    class Meta:
        model = TestPlan
        fields = [
            "name",
            "description",
            "module",
            "begin_time",
            "end_time",
            "project",
            "threshold",
            "cases",
            "cycle",
        ]


class PlanListSerializer(ModelSerializer):
    class Meta:
        model = TestPlan
        fields = ["name", "id","begin_time","end_time",]


class CaseDetailSerializer(ModelSerializer):
    """
    Serializer for creating a TestPlan.
    """

    review = serializers.SerializerMethodField()

    def get_review(self, obj):
        return obj.review

    class Meta:
        model = TestCase
        fields = "__all__"


class TestPlanDetailSerializer(ModelSerializer):
    """
    Serializer for creating a TestPlan.
    """

    case_count = serializers.SerializerMethodField()
    pass_rate = serializers.SerializerMethodField()
    repository_name = serializers.SlugRelatedField(
        source="repository", read_only=True, slug_field="name"
    )

    def get_case_count(self, obj: TestPlan):
        return obj.plan_cases.count()

    def get_pass_rate(self, obj: TestPlan):
        queryset = obj.plan_cases.all().values("result").annotate(count=Count("result"))
        statis = {label: 0 for label in PlanCase.Result.values}
        for annotate_result in queryset:
            statis[annotate_result["result"]] = annotate_result["count"]
        return statis

    def execute_result(self, obj: TestPlan):
        success_count = PlanCase.objects.filter(
            plan=obj, result=PlanCase.Result.SUCCESS
        ).count()
        total_count = obj.plan_cases.count()
        if not total_count:
            return "-"
        return (
            "通过"
            if ((success_count / total_count) * 100 >= obj.threshold)
            else "不通过"
        )

    def to_representation(self, instance):
        result = self.execute_result(instance)
        instance.result = result
        instance.save()

        data = super().to_representation(instance)
        # 假设你想把所有的 result 改成 BLOCK
        return data

    class Meta:
        model = TestPlan
        fields = "__all__"


def build_plan_stats_map(plan_ids):
    """一次聚合拿到列表页所有 plan 的用例统计，避免 N+1。"""
    empty_pass_rate = {label: 0 for label in PlanCase.Result.values}
    stats = {
        plan_id: {
            "case_count": 0,
            "success_count": 0,
            "pass_rate": dict(empty_pass_rate),
        }
        for plan_id in plan_ids
    }
    if not plan_ids:
        return stats

    rows = (
        PlanCase.objects.filter(plan_id__in=plan_ids)
        .values("plan_id", "result")
        .annotate(count=Count("id"))
    )
    for row in rows:
        entry = stats[row["plan_id"]]
        entry["case_count"] += row["count"]
        if row["result"] in entry["pass_rate"]:
            entry["pass_rate"][row["result"]] = row["count"]
        if row["result"] == PlanCase.Result.SUCCESS:
            entry["success_count"] += row["count"]
    return stats


class TestPlanListSerializer(ModelSerializer):
    """测试计划列表专用序列化器，避免返回大体量 cases 字段。

    统计字段依赖 `context['plan_stats']`，需由调用方提前批量聚合好。
    """

    case_count = serializers.SerializerMethodField()
    pass_rate = serializers.SerializerMethodField()
    result = serializers.SerializerMethodField()
    repository_name = serializers.SlugRelatedField(
        source="repository", read_only=True, slug_field="name"
    )

    def _stats(self, obj: TestPlan):
        plan_stats = self.context.get("plan_stats") or {}
        return plan_stats.get(obj.id) or {
            "case_count": 0,
            "success_count": 0,
            "pass_rate": {label: 0 for label in PlanCase.Result.values},
        }

    def get_case_count(self, obj: TestPlan):
        return self._stats(obj)["case_count"]

    def get_pass_rate(self, obj: TestPlan):
        return dict(self._stats(obj)["pass_rate"])

    def get_result(self, obj: TestPlan):
        stats = self._stats(obj)
        total = stats["case_count"]
        if not total:
            return "-"
        return (
            "通过"
            if (stats["success_count"] / total) * 100 >= obj.threshold
            else "不通过"
        )

    class Meta:
        model = TestPlan
        exclude = ["cases"]


class TestCaseRepositorySerializer(ModelSerializer):
    """
    Serializer for creating a TestPlan.
    """

    class Meta:
        model = TestCaseRepository
        fields = ["name", "description", "project", "workspace", "is_template"]
        # workspace 由 view 按 URL slug 注入，不信任客户端传值
        extra_kwargs = {"workspace": {"required": False}}

    def validate(self, attrs):
        is_template = attrs.get("is_template", getattr(self.instance, "is_template", False))
        project = attrs.get("project", getattr(self.instance, "project", None))
        if is_template and project is not None:
            raise serializers.ValidationError({"project": "模板库不能关联项目"})
        return attrs


class TestCaseRepositoryDetailSerializer(ModelSerializer):
    """
    Serializer for creating a TestPlan.
    """

    created_by = UserLiteSerializer(read_only=True)

    class Meta:
        model = TestCaseRepository
        fields = "__all__"
        depth = 1


class CaseLabelSerializer(ModelSerializer):
    """
    Serializer for creating a TestPlan.
    """

    class Meta:
        model = CaseLabel
        fields = "__all__"


class CaseCreateUpdateSerializer(ModelSerializer):
    labels = serializers.PrimaryKeyRelatedField(
        queryset=CaseLabel.objects.all(), many=True, required=False
    )
    issues = serializers.PrimaryKeyRelatedField(
        queryset=Issue.objects.all(), many=True, required=False
    )
    code = serializers.CharField(required=False, allow_blank=True)

    review = serializers.SerializerMethodField()

    def get_review(self, obj):
        return obj.review

    class Meta:
        model = TestCase
        fields = [
            "code",
            "name",
            "precondition",
            "steps",
            "remark",
            "type",
            "priority",
            "repository",
            "labels",
            "module",
            "assignee",
            "issues",
            "test_type",
            "review",
            "mode",
            "text_description",
            "text_result",
        ]

        validators = []

    def create(self, validated_data):
        labels = validated_data.pop("labels", [])
        issues = validated_data.pop("issues", [])
        instance = super().create(validated_data)
        if labels:
            instance.labels.set(labels)
        if issues:
            instance.issues.set(issues)
        # TestCaseVersion.create_from_case(instance)
        return instance

    def update(self, instance, validated_data):
        labels = validated_data.pop("labels", None)
        issues = validated_data.pop("issues", None)
        if any(
            [
                validated_data.get("name") and validated_data["name"] != instance.name,
                validated_data.get("precondition")
                and validated_data["precondition"] != instance.precondition,
                validated_data.get("steps")
                and validated_data["steps"] != instance.steps,
            ]
        ):
            re_approval_case(instance)
        instance = super().update(instance, validated_data)
        if labels is not None:
            instance.labels.set(labels)
        if issues is not None:
            for issue in issues:
                instance.issues.add(issue)
        return instance


class CaseListSerializer(ModelSerializer):
    """用例查询"""

    # 替换 depth=1，改为显式序列化需要的关联字段
    module = CaseModuleListSerializer(read_only=True)
    assignee = UserLiteSerializer(read_only=True)
    labels = CaseLabelListSerializer(many=True, read_only=True)
    repository_name = serializers.CharField(source="repository.name", read_only=True)
    version = serializers.SerializerMethodField(read_only=True)
    latest_execution_result = serializers.SerializerMethodField(read_only=True)
    latest_execution_plan_id = serializers.SerializerMethodField(read_only=True)

    # 保持原有的 review 字段
    review = serializers.SerializerMethodField()

    def get_review(self, obj):
        return obj.review

    def get_version(self, obj: TestCase):
        if not obj.versions.exists():
            return 1.0
        last_version = obj.versions.order_by("-version").first()
        if obj.updated_at == last_version.updated_at:
            return last_version.version
        else:
            return str(Decimal(str(last_version.version)) + Decimal(str(0.1)))

    def _get_latest_execution_data(self, obj: TestCase) -> dict:
        cached = getattr(obj, "_latest_execution_data_cache", None)
        if cached is not None:
            return cached

        latest_plan_case = (
            PlanCase.objects.filter(
                case_id=obj.id,
                deleted_at__isnull=True,
                plan__deleted_at__isnull=True,
            )
            .order_by("-updated_at", "-created_at")
            .values("result", "plan_id")
            .first()
        )
        cached = {
            "result": (
                latest_plan_case.get("result")
                if latest_plan_case
                else PlanCase.Result.NOT_START
            ),
            "plan_id": latest_plan_case.get("plan_id") if latest_plan_case else None,
        }
        setattr(obj, "_latest_execution_data_cache", cached)
        return cached

    def get_latest_execution_result(self, obj: TestCase):
        annotated_result = getattr(obj, "_latest_execution_result", None)
        if annotated_result is not None:
            return annotated_result
        return self._get_latest_execution_data(obj).get("result")

    def get_latest_execution_plan_id(self, obj: TestCase):
        annotated_plan_id = getattr(obj, "_latest_execution_plan_id", None)
        if annotated_plan_id is not None:
            return str(annotated_plan_id)
        plan_id = self._get_latest_execution_data(obj).get("plan_id")
        return str(plan_id) if plan_id else None

    class Meta:
        model = TestCase
        fields = "__all__"


class _CaseModuleBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaseModule
        fields = ["id", "name"]


class ProjectCaseListSerializer(serializers.ModelSerializer):
    """用例列表轻量序列化器，只输出前端列表实际使用的字段"""

    repository_name = serializers.CharField(source="repository.name", read_only=True)
    module = _CaseModuleBriefSerializer(read_only=True)

    class Meta:
        model = TestCase
        fields = [
            "id",
            "name",
            "code",
            "type",
            "priority",
            "repository_id",
            "repository_name",
            "module",
            "created_at",
        ]


class CaseModuleCreateUpdateSerializer(ModelSerializer):
    """创建和更新用例"""

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", None))
        repository = attrs.get("repository", getattr(self.instance, "repository", None))
        parent = attrs.get("parent", getattr(self.instance, "parent", None))

        if isinstance(name, str):
            name = name.strip()
            attrs["name"] = name

        if parent and repository and parent.repository_id != repository.id:
            raise serializers.ValidationError({"error": "父模块不属于当前用例库"})

        if name and repository:
            duplicate_modules = CaseModule.objects.filter(
                repository=repository,
                name=name,
                parent=parent,
                deleted_at__isnull=True,
            )
            if self.instance:
                duplicate_modules = duplicate_modules.exclude(id=self.instance.id)
            if duplicate_modules.exists():
                raise serializers.ValidationError({"error": "同级模块名称已存在"})

        return attrs

    class Meta:
        model = CaseModule
        fields = ["name", "sort_order", "parent", "repository"]
        extra_kwargs = {
            "parent": {"required": False, "allow_null": True, "default": None}
        }


class CaseLabelCreateSerializer(serializers.ModelSerializer):
    """"""

    class Meta:
        model = CaseLabel
        fields = ["name", "repository"]


# 新增：测试用例附件序列化器（复用 FileAsset）
class CaseAttachmentSerializer(BaseSerializer):
    asset_url = serializers.CharField(read_only=True)

    class Meta:
        model = FileAsset
        fields = "__all__"
        read_only_fields = [
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "workspace",
            "project",
            "case",
            "size",
            "storage_metadata",
            "attributesz",
        ]


class IssueListSerializer(BaseSerializer):
    project = ProjectDetailSerializer(read_only=True)

    class Meta:
        model = Issue
        fields = "__all__"


class IssueUnselectSerializer(BaseSerializer):
    class Meta:
        model = Issue
        fields = ["id", "name", "state", "type"]
        depth = 1


class CaseIssueSerializer(ModelSerializer):
    issues = IssueListSerializer(many=True, read_only=True)

    class Meta:
        model = TestCase
        fields = ["id", "issues"]


class TestCaseCommentSerializer(BaseSerializer):
    children = serializers.SerializerMethodField()
    actor_detail = UserLiteSerializer(read_only=True, source="creator")

    class Meta:
        model = TestCaseComment
        fields = [
            "id",
            "case",
            "creator",
            "actor_detail",
            "comment_html",
            "comment_json",
            "comment_stripped",
            "content",
            "parent",
            "edited_at",
            "children",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "creator",
            "comment_stripped",
            "edited_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def get_children(self, obj):
        current_depth = int(self.context.get("current_depth", 1))
        max_depth = int(self.context.get("max_depth", 5))
        if current_depth >= max_depth:
            return []
        qs = obj.children.filter(deleted_at__isnull=True).order_by("created_at")
        serializer = TestCaseCommentSerializer(
            qs,
            many=True,
            context={"current_depth": current_depth + 1, "max_depth": max_depth},
        )
        return serializer.data


class TestCaseActivitySerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = TestCaseActivity
        fields = [
            "id",
            "case",
            "actor",
            "actor_detail",
            "verb",
            "field",
            "old_value",
            "new_value",
            "old_identifier",
            "new_identifier",
            "comment",
            "test_case_comment",
            "epoch",
            "extra",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# ----- review------
class ReviewModuleCreateUpdateSerializer(ModelSerializer):
    class Meta:
        model = CaseReviewModule
        fields = ["name", "project", "parent"]


class ReviewModuleDetailSerializer(ModelSerializer):
    class Meta:
        model = CaseReviewModule
        fields = "__all__"


class ReviewModuleListSerializer(ModelSerializer):
    review_count = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    def get_review_count(self, obj: CaseReviewModule):
        return obj.reviews.filter(deleted_at__isnull=True).count()

    def get_children(self, obj: CaseReviewModule):
        qs = obj.children.filter(deleted_at__isnull=True).order_by("created_at")
        return ReviewModuleListSerializer(qs, many=True).data

    class Meta:
        model = CaseReviewModule
        fields = "__all__"
        read_only_fields = ["review_count"]


class ReviewCreateUpdateSerializer(ModelSerializer):
    cases = serializers.PrimaryKeyRelatedField(
        queryset=TestCase.objects.all(), many=True, required=False
    )

    def create(self, validated_data):
        cases = validated_data.pop("cases", [])
        instance = super().create(validated_data)
        for case in cases:
            CaseReviewThrough.objects.get_or_create(review=instance, case=case)
        return instance

    def update(self, instance, validated_data):
        cases = validated_data.pop("cases", None)
        instance = super().update(instance, validated_data)
        if cases is not None:
            current_ids = set(
                CaseReviewThrough.objects.filter(review=instance).values_list(
                    "case_id", flat=True
                )
            )
            new_ids = set([c.id for c in cases])
            add_ids = new_ids - current_ids
            remove_ids = current_ids - new_ids
            if add_ids:
                for case in TestCase.objects.filter(id__in=add_ids):
                    CaseReviewThrough.objects.get_or_create(review=instance, case=case)
            if remove_ids:
                CaseReviewThrough.objects.filter(
                    review=instance, case_id__in=remove_ids
                ).delete()
        return instance

    class Meta:
        model = CaseReview
        fields = "__all__"


class ReviewListSerializer(ModelSerializer):
    case_count = serializers.SerializerMethodField()
    pass_rate = serializers.SerializerMethodField()
    module_name = serializers.SerializerMethodField()

    def get_case_count(self, obj: CaseReview):
        return obj.cases.count()

    def get_pass_rate(self, obj: CaseReview):
        queryset = (
            CaseReviewThrough.objects.filter(review=obj)
            .values("result")
            .annotate(count=Count("result"))
        )
        statis = {label: 0 for label in CaseReviewThrough.Result.values}

        for annotate_result in queryset:
            statis[annotate_result["result"]] = annotate_result["count"]
        return statis

    def get_module_name(self, obj: CaseReview):
        return obj.module.name if obj.module else ""

    class Meta:
        model = CaseReview
        exclude = ["cases"]


class ReviewSerializer(ModelSerializer):
    class Meta:
        model = CaseReview
        fields = ["id", "name"]


class ReviewCaseListSerializer(ModelSerializer):
    name = serializers.SerializerMethodField()
    priority = serializers.SerializerMethodField()
    assignees = serializers.SerializerMethodField()
    code = serializers.CharField(source="case.code", read_only=True)
    repository = serializers.CharField(source="case.repository.name", read_only=True)
    module = serializers.CharField(source="case.module.name", read_only=True)
    suggestion_count = serializers.IntegerField(read_only=True, default=0)
    reviewer_statuses = serializers.SerializerMethodField()
    unreviewed_assignees = serializers.SerializerMethodField()
    reviewed_count = serializers.SerializerMethodField()
    reviewer_count = serializers.SerializerMethodField()

    def get_name(self, obj: CaseReviewThrough):
        return obj.case.name

    def get_priority(self, obj: CaseReviewThrough):
        return obj.case.priority

    def _get_assignee_ids(self, obj: CaseReviewThrough):
        prefetched_assignees = getattr(obj.review, "_prefetched_objects_cache", {}).get(
            "assignees"
        )
        if prefetched_assignees is not None:
            return [str(assignee.id) for assignee in prefetched_assignees]
        return [str(assignee_id) for assignee_id in obj.review.assignees.values_list("id", flat=True)]

    def _get_last_record_result_by_assignee(self, obj: CaseReviewThrough, assignee_ids):
        records = getattr(obj, "prefetched_review_records", None)
        if records is None:
            records = list(
                CaseReviewRecord.objects.filter(crt=obj, deleted_at__isnull=True)
                .exclude(result=CaseReviewRecord.Result.SUGGEST)
                .order_by("assignee_id", "-created_at")
            )

        assignee_id_set = {str(assignee_id) for assignee_id in assignee_ids}
        last_by_assignee = {}
        for record in records:
            if not getattr(record, "assignee_id", None):
                continue
            assignee_id = str(record.assignee_id)
            if assignee_id not in assignee_id_set or assignee_id in last_by_assignee:
                continue
            last_by_assignee[assignee_id] = record.result
        return last_by_assignee

    def _is_reviewed_result(self, result):
        if not result:
            return False
        return str(result) != str(CaseReviewRecord.Result.RE_REVIEW)

    def get_assignees(self, obj: CaseReviewThrough):
        return self._get_assignee_ids(obj)

    def get_reviewer_statuses(self, obj: CaseReviewThrough):
        assignee_ids = self._get_assignee_ids(obj)
        last_by_assignee = self._get_last_record_result_by_assignee(obj, assignee_ids)
        return [
            {
                "assignee": assignee_id,
                "result": last_by_assignee.get(assignee_id),
                "reviewed": self._is_reviewed_result(last_by_assignee.get(assignee_id)),
            }
            for assignee_id in assignee_ids
        ]

    def get_unreviewed_assignees(self, obj: CaseReviewThrough):
        assignee_ids = self._get_assignee_ids(obj)
        last_by_assignee = self._get_last_record_result_by_assignee(obj, assignee_ids)
        return [
            assignee_id
            for assignee_id in assignee_ids
            if not self._is_reviewed_result(last_by_assignee.get(assignee_id))
        ]

    def get_reviewed_count(self, obj: CaseReviewThrough):
        assignee_ids = self._get_assignee_ids(obj)
        last_by_assignee = self._get_last_record_result_by_assignee(obj, assignee_ids)
        return len(
            [
                assignee_id
                for assignee_id in assignee_ids
                if self._is_reviewed_result(last_by_assignee.get(assignee_id))
            ]
        )

    def get_reviewer_count(self, obj: CaseReviewThrough):
        return len(self._get_assignee_ids(obj))

    class Meta:
        model = CaseReviewThrough
        fields = [
            "id",
            "name",
            "priority",
            "assignees",
            "result",
            "created_by",
            "case_id",
            "code",
            "repository",
            "module",
            "suggestion_count",
            "reviewer_statuses",
            "unreviewed_assignees",
            "reviewed_count",
            "reviewer_count",
        ]


class ReviewCaseRecordsSerializer(ModelSerializer):
    review_name = serializers.CharField(source="crt.review.name", read_only=True)
    update_time = serializers.SerializerMethodField()

    def get_update_time(self, obj: CaseReviewThrough):
        return timezone.localtime(obj.updated_at).strftime("%Y-%m-%d %H:%M:%S")

    class Meta:
        model = CaseReviewRecord
        fields = "__all__"
