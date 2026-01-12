import random
import string
from enum import IntEnum

from django.core.validators import RegexValidator
from django.db import transaction
from django.db import models
from django.db.models import Q
from django.conf import settings


from . import BaseModel, Issue

def generate_case_code():
    """
     生成一个随机字符串，满足正则: ^[A-Za-z0-9]{1,5}-[A-Za-z0-9]{1,5}$
     格式：前缀(1-5位)-后缀(1-5位)，仅包含字母和数字
     """
    # 字符集：大小写字母 + 数字
    chars = string.ascii_letters + string.digits  # a-z, A-Z, 0-9
    # 随机生成前缀长度 (1~5)
    prefix_length = random.randint(1, 5)
    prefix = ''.join(random.choices(chars, k=prefix_length))
    # 随机生成后缀长度 (1~5)
    suffix_length = random.randint(1, 5)
    suffix = ''.join(random.choices(chars, k=suffix_length))
    return f"{prefix}-{suffix}"


class TestCaseRepository(BaseModel):
    name = models.CharField(max_length=255, verbose_name="TestCaseRepository Name")
    description = models.TextField(verbose_name="TestCaseRepository Description", blank=True)

    project = models.ForeignKey('db.Project', null=True, blank=True, on_delete=models.CASCADE,
                                related_name="project_%(class)s")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_%(class)s")

    class Meta:
        db_table = "test_repository"
        ordering = ("-created_at",)


class CaseLabel(BaseModel):
    name = models.CharField(max_length=20)
    repository = models.ForeignKey(TestCaseRepository, on_delete=models.CASCADE, verbose_name="TestCaseRepository",
                                   related_name="labels")

    class Meta:
        constraints = [
            # Enforce uniqueness of project and name when project is not NULL and deleted_at is NULL
            models.UniqueConstraint(
                fields=["repository", "name"],
                condition=Q(repository__isnull=False, deleted_at__isnull=True),
                name="unique_test_label_name_when_not_deleted",
            ),
        ]
        verbose_name = "CaseLabel"
        verbose_name_plural = "CaseLabels"
        db_table = "test_labels"
        ordering = ("-created_at",)

    def __str__(self):
        return str(self.name)


class CaseModule(BaseModel):
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    name = models.CharField(max_length=30)
    sort_order = models.FloatField(default=65535)
    repository = models.ForeignKey(TestCaseRepository, on_delete=models.CASCADE, verbose_name="TestCaseRepository",
                                   related_name="modules")

    @property
    def get_all_children(self) -> list:
        """获取当前模块及其所有子模块的ID（包括多层嵌套的子模块）"""

        def get_children_ids(module):
            ids = [module.id]
            for child in module.children.all():
                ids.extend(get_children_ids(child))
            return ids

        return get_children_ids(self)

    class Meta:
        constraints = [
            # Enforce uniqueness of project and name when project is not NULL and deleted_at is NULL
            models.UniqueConstraint(
                fields=["repository", "name"],
                condition=Q(repository__isnull=False, deleted_at__isnull=True),
                name="unique_case_module_repository_name_when_not_deleted",
            ),
        ]
        db_table = "test_modules"
        ordering = ('sort_order', "-created_at",)


class TestCase(BaseModel):
    class State(models.IntegerChoices):
        PENDING_REVIEW = 0, '待评审'
        APPROVED = 1, '已通过'
        REJECTED = 2, '已拒绝'

    class Type(models.IntegerChoices):
        FUNCTIONAL = 0, '功能测试'
        PERFORMANCE = 1, '性能测试'
        SECURITY = 2, '安全测试'
        USABILITY = 3, '可用性测试'
        COMPATIBILITY = 4, '兼容性测试'
        REGRESSION = 5, '回归测试'
        OTHER = 6, '其他'

    class Priority(models.IntegerChoices):
        LOW = 0, '低'
        MEDIUM = 1, '中'
        HIGH = 2, '高'

    class TestType(models.IntegerChoices):
        MANUAL = 0, '手动'
        AUTO = 1, '自动'

    code = models.CharField(
        max_length=50,
        verbose_name="TestCase Code",
        blank=True
    )
    name = models.CharField(max_length=255, verbose_name="TestCase Name")

    precondition = models.TextField(verbose_name="TestCase Precondition", blank=True, default='<p></p>')
    steps = models.JSONField(verbose_name="TestCase Steps", blank=True, default=dict)
    remark = models.TextField(verbose_name="TestCase Remark", blank=True, default='<p></p>')
    type = models.IntegerField(choices=Type.choices, default=Type.FUNCTIONAL, verbose_name="TestCase Type")
    test_type = models.IntegerField(choices=TestType.choices, default=TestType.AUTO, verbose_name="TestType Type")
    priority = models.IntegerField(choices=Priority.choices, default=Priority.MEDIUM, verbose_name="TestCase Priority")

    repository = models.ForeignKey(TestCaseRepository, on_delete=models.CASCADE, verbose_name="TestCaseRepository",
                                   related_name="cases")
    module = models.ForeignKey(CaseModule, on_delete=models.CASCADE, blank=True, null=True,
                               related_name="cases")
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True,
                                 related_name="cases")
    labels = models.ManyToManyField(CaseLabel, blank=True, related_name="cases")
    issues = models.ManyToManyField(Issue, blank=True, related_name="cases")

    @property
    def review(self):
        crr = CaseReviewRecord.objects.filter(crt__case=self).order_by("-created_at").first()

        return crr.result if crr else CaseReviewThrough.Result.NOT_START

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = generate_case_code()
        super().save(*args, **kwargs)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["repository", "code"],
                condition=Q(repository__isnull=False, deleted_at__isnull=True),
                name="unique_case_repository_code_when_not_deleted",
            ),
        ]
        db_table = "test_case"
        ordering = ("-created_at",)


class TestCaseVersion(BaseModel):
    case = models.ForeignKey(TestCase, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField(default=0)
    repository_id = models.CharField(max_length=36)
    module_id = models.CharField(max_length=36, null=True, blank=True)
    assignee_id = models.CharField(max_length=36, null=True, blank=True)
    code = models.CharField(max_length=12, blank=True)
    name = models.CharField(max_length=255)
    precondition = models.TextField(blank=True, default="<p></p>")
    steps = models.JSONField(blank=True, default=dict)
    remark = models.TextField(blank=True, default="<p></p>")
    type = models.IntegerField(choices=TestCase.Type.choices)
    test_type = models.IntegerField(choices=TestCase.TestType.choices)
    priority = models.IntegerField(choices=TestCase.Priority.choices)
    state = models.IntegerField(choices=TestCase.State.choices, default=TestCase.State.PENDING_REVIEW)
    label_ids = models.JSONField(blank=True, default=list)
    issue_ids = models.JSONField(blank=True, default=list)

    class Meta:
        db_table = "test_case_versions"
        ordering = ("-created_at",)
        unique_together = ("case", "version")

    @classmethod
    def create_from_case(cls, case: TestCase) -> "TestCaseVersion":
        from django.db.models import Max

        latest = (
            cls.objects.filter(case_id=str(case.id))
            .aggregate(max_version=Max("version"))
            .get("max_version")
        )
        next_version = 0 if latest is None else latest + 1

        label_ids = list(map(str, case.labels.values_list("id", flat=True)))
        issue_ids = list(map(str, case.issues.values_list("id", flat=True)))

        return cls.objects.create(
            case=case,
            version=next_version,
            repository_id=str(case.repository_id),
            module_id=str(case.module_id) if case.module_id else None,
            assignee_id=str(case.assignee_id) if case.assignee_id else None,
            code=case.code or "",
            name=case.name,
            precondition=case.precondition,
            steps=case.steps,
            remark=case.remark,
            type=case.type,
            test_type=case.test_type,
            priority=case.priority,
            state=getattr(case, "state", TestCase.State.PENDING_REVIEW),
            label_ids=label_ids,
            issue_ids=issue_ids,
        )

    @classmethod
    def rollback_case(cls, case: TestCase, version: int) -> TestCase:
        from plane.db.models import CaseLabel as CaseLabelModel, Issue as IssueModel

        snapshot = cls.objects.get(case=case, version=version)

        with transaction.atomic():
            case.repository_id = snapshot.repository_id
            case.module_id = snapshot.module_id
            case.assignee_id = snapshot.assignee_id
            case.code = snapshot.code
            case.name = snapshot.name
            case.precondition = snapshot.precondition
            case.steps = snapshot.steps
            case.remark = snapshot.remark
            case.type = snapshot.type
            case.test_type = snapshot.test_type
            case.priority = snapshot.priority
            case.state = snapshot.state

            labels_qs = CaseLabelModel.objects.filter(id__in=snapshot.label_ids)
            issues_qs = IssueModel.objects.filter(id__in=snapshot.issue_ids)

            case.save()
            case.labels.set(labels_qs)
            case.issues.set(issues_qs)

        return case


class PlanModule(BaseModel):
    name = models.CharField(max_length=30)
    repository = models.ForeignKey(TestCaseRepository, on_delete=models.CASCADE, verbose_name="TestCaseRepository",
                                   related_name="plan_modules")
    is_default = models.BooleanField(default=False)

    class Meta:
        constraints = [
            # Enforce uniqueness of project and name when project is not NULL and deleted_at is NULL
            models.UniqueConstraint(
                fields=["repository", "name"],
                condition=Q(repository__isnull=False, deleted_at__isnull=True),
                name="unique_plane_module_repository_name_when_not_deleted",
            ),
        ]
        db_table = "test_plan_modules"
        ordering = ("created_at",)


class TestPlan(BaseModel):
    class State(models.TextChoices):
        NOT_START = '未开始', 'gray'
        PROGRESS = '进行中', 'blue'
        COMPLETED = '已完成', 'green'

    name = models.CharField(max_length=255, verbose_name="TestPlan Name")
    description = models.TextField(verbose_name="TestPlan Description", blank=True, null=True)
    begin_time = models.DateField(null=True, blank=True, verbose_name="TestPlan Begin Time")
    end_time = models.DateField(null=True, blank=True, verbose_name="TestPlan End Time")
    state = models.CharField(choices=State.choices, default=State.NOT_START, verbose_name="TestPlan State")
    result = models.CharField(max_length=30, default='-', verbose_name="TestPlan execute result")
    threshold = models.IntegerField(null=True, blank=True, default=100, verbose_name="TestPlan Threshold")

    module = models.ForeignKey(PlanModule, null=True, on_delete=models.CASCADE, verbose_name="PlanModule",
                               related_name="plans")
    repository = models.ForeignKey(TestCaseRepository, on_delete=models.CASCADE, verbose_name="TestCaseRepository",
                                   related_name="plans")
    cases = models.ManyToManyField(TestCase, blank=True, related_name="plans", through="PlanCase",
                                   through_fields=("plan", "case"))

    cycle = models.ForeignKey("db.Cycle", null=True, blank=True, related_name="plans", on_delete=models.DO_NOTHING)
    modules = models.ManyToManyField("db.Module", blank=True, related_name="plans", db_table="plan_modules_relations")

    @property
    def state_display(self):
        return self.get_state_display()

    class Meta:
        constraints = [
            # Enforce uniqueness of project and name when project is not NULL and deleted_at is NULL
            models.UniqueConstraint(
                fields=["repository", "name"],
                condition=Q(repository__isnull=False, deleted_at__isnull=True),
                name="unique_plan_repository_name_when_not_deleted",
            ),
        ]
        db_table = "test_plan"
        ordering = ("-created_at",)


class PlanCase(BaseModel):
    class Result(models.TextChoices):
        SUCCESS = '成功', 'green'
        FAIL = '失败', 'red'
        BLOCK = '阻塞', 'gold'
        NOT_START = '未执行', 'gray'
        INVALID = '无效', 'gray'

    case = models.ForeignKey(TestCase, on_delete=models.CASCADE, related_name="plan_cases")
    plan = models.ForeignKey(TestPlan, on_delete=models.CASCADE, related_name="plan_cases")
    result = models.CharField(choices=Result.choices, default=Result.NOT_START,
                              verbose_name="PlanCase Execute Result")
    issue = models.ManyToManyField(Issue, related_name="plan_cases")

    class Meta:
        verbose_name = "PlanCase"
        verbose_name_plural = "PlanCases"
        db_table = "test_plan_cases"
        ordering = ("-created_at",)


class PlanCaseRecord(BaseModel):
    class Result(models.TextChoices):
        SUCCESS = '成功', 'green'
        FAIL = '失败', 'red'
        BLOCK = '阻塞', 'gold'
        INVALID = '无效', 'gray'

    result = models.CharField(choices=Result.choices, default=Result.SUCCESS,
                              verbose_name="PlanCaseRecord Result")
    reason = models.TextField(verbose_name="PlanCaseRecord Reason", blank=True, null=True)
    steps = models.JSONField(verbose_name="TestCase Steps", blank=True, default=dict)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True,
                                 related_name="plan_case_records")

    plan_case = models.ForeignKey(PlanCase, on_delete=models.SET_NULL, blank=True, null=True,
                                  related_name="plan_case_records")

    class Meta:
        db_table = "test_plan_case_records"
        ordering = ("-created_at",)


class TestCaseComment(BaseModel):
    content = models.TextField(verbose_name="Comment Content")
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="testcase_comments",
        verbose_name="Creator",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="Parent Comment",
    )
    case = models.ForeignKey(
        TestCase,
        on_delete=models.CASCADE,
        related_name="comments",
        verbose_name="TestCase",
    )

    class Meta:
        verbose_name = "测试用例评论"
        verbose_name_plural = "测试用例评论"
        db_table = "test_case_comments"
        ordering = ("-created_at",)

    def __str__(self):
        return str(self.content)[:50]


class CaseReviewModule(BaseModel):
    name = models.CharField(max_length=30)
    repository = models.ForeignKey(TestCaseRepository, on_delete=models.CASCADE, verbose_name="CaseReviewModule",
                                   related_name="review_modules")
    is_default = models.BooleanField(default=False)

    class Meta:
        constraints = [
            # Enforce uniqueness of project and name when project is not NULL and deleted_at is NULL
            models.UniqueConstraint(
                fields=["repository", "name"],
                condition=Q(repository__isnull=False, deleted_at__isnull=True),
                name="unique_review_module_repository_name_when_not_deleted",
            ),
        ]
        verbose_name = "CaseReviewModule"
        verbose_name_plural = "CaseReviewModule"
        db_table = "test_review_module"
        ordering = ("-created_at",)


class CaseReview(BaseModel):
    class State(models.TextChoices):
        NOT_START = '未开始', 'gray'
        PROGRESS = '进行中', 'blue'
        COMPLETED = '已完成', 'green'

    class ReviewMode(models.TextChoices):
        SINGLE = '单人评审', 'green'
        MULTIPLE = '多人评审', 'blue'

    name = models.CharField(max_length=255)
    description = models.TextField(verbose_name="CaseReview Description", blank=True)
    state = models.CharField(choices=State.choices, default=State.NOT_START, verbose_name="CaseReview State")
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="review_assignee",
    )
    mode = models.CharField(choices=ReviewMode.choices, default=ReviewMode.SINGLE, verbose_name="CaseReview Mode")

    module = models.ForeignKey(CaseReviewModule, on_delete=models.CASCADE, verbose_name="CaseReviewModule",
                               related_name="reviews")
    started_at = models.DateField(null=True, blank=True, verbose_name="CaseReview Started Time")
    ended_at = models.DateField(null=True, blank=True, verbose_name="CaseReview Ended Time")

    cases = models.ManyToManyField(TestCase, blank=True, related_name="reviews", through="CaseReviewThrough",
                                   through_fields=("review", "case"))

    class Meta:
        verbose_name = "CaseReview"
        verbose_name_plural = "CaseReview"
        db_table = "test_case_review"
        ordering = ("-created_at",)


class CaseReviewThrough(BaseModel):
    class Result(models.TextChoices):
        PASS = '通过', 'green'
        FAIL = '不通过', 'red'
        RE_REVIEW = '重新提审', 'gold'
        PROCESS = '评审中', 'blue'
        NOT_START = '未评审', 'gray'

    case = models.ForeignKey(TestCase, on_delete=models.CASCADE, related_name="review_cases")
    review = models.ForeignKey(CaseReview, on_delete=models.CASCADE, related_name="review_cases")
    result = models.CharField(choices=Result.choices, default=Result.NOT_START,
                              verbose_name="CaseReview Result")

    class Meta:
        verbose_name = "CaseReviewThrough"
        verbose_name_plural = "CaseReviewThrough"
        db_table = "test_review_through"
        ordering = ("-created_at",)


class CaseReviewRecord(BaseModel):
    class Result(models.TextChoices):
        PASS = '通过', 'green'
        FAIL = '不通过', 'red'
        RE_REVIEW = '重新提审', 'gold'
        SUGGEST = '建议', 'gold'

    result = models.CharField(choices=Result.choices, default=Result.PASS,
                              verbose_name="CaseReview Result")
    reason = models.TextField(verbose_name="CaseReview Reason", blank=True, null=True)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True,
                                 related_name="review_records")
    confirmed = models.BooleanField(
        default=False,
        verbose_name="已确认",
        help_text="标记该评审记录是否已被确认"
    )

    crt = models.ForeignKey(CaseReviewThrough, on_delete=models.SET_NULL, blank=True, null=True,
                            related_name="review_records")

    class Meta:
        ordering = ("-created_at",)
