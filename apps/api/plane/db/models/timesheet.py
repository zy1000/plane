# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import datetime
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from .base import BaseModel

MIDNIGHT_END_SENTINEL = datetime.time(23, 59, 0)


# 工时类别预置 key（与 migration 中的初始化数据保持一致）
TIMESHEET_CATEGORY_PROJECT = "PROJECT"
TIMESHEET_CATEGORY_ISSUE = "ISSUE"
TIMESHEET_CATEGORY_TEST_CASE = "TEST_CASE"
TIMESHEET_CATEGORY_SAMPLE = "SAMPLE"
# 工作项工时拆分：按 issue type 归类
TIMESHEET_CATEGORY_REQUIREMENT = "REQUIREMENT"  # 史诗 / 特性 / 用户故事
TIMESHEET_CATEGORY_TASK = "TASK"                # 任务
TIMESHEET_CATEGORY_BUG = "BUG"                  # 缺陷

# 必须挂工作项的类别 key 集合（含拆分后的子类别与旧 ISSUE 兜底）
CATEGORY_KEYS_REQUIRE_ISSUE = {
    TIMESHEET_CATEGORY_ISSUE,
    TIMESHEET_CATEGORY_REQUIREMENT,
    TIMESHEET_CATEGORY_TASK,
    TIMESHEET_CATEGORY_BUG,
}
# 必须挂测试用例的类别 key 集合
CATEGORY_KEYS_REQUIRE_TEST_CASE = {TIMESHEET_CATEGORY_TEST_CASE}
# 仅挂项目（不允许挂 issue / test_case）的类别 key 集合，未来新增纯项目级类别时在此处追加
CATEGORY_KEYS_PROJECT_ONLY = {TIMESHEET_CATEGORY_PROJECT, TIMESHEET_CATEGORY_SAMPLE}

# 工作项 type 名称 → 工时类别 key 的映射。
# 名称是工作区里 IssueType.name 的中文配置，与 apps/api/plane/app/views/issue/custom.py
# 中的 '史诗' / '特性' / '用户故事' / '任务' / '缺陷' 保持一致。
# 新增类型 / 重命名时在此处维护即可。
ISSUE_TYPE_NAME_TO_CATEGORY_KEY = {
    "史诗": TIMESHEET_CATEGORY_REQUIREMENT,
    "特性": TIMESHEET_CATEGORY_REQUIREMENT,
    "用户故事": TIMESHEET_CATEGORY_REQUIREMENT,
    "任务": TIMESHEET_CATEGORY_TASK,
    "缺陷": TIMESHEET_CATEGORY_BUG,
}


def resolve_issue_category_key(issue) -> str:
    """按 issue 的 type.name 解析出对应的工时类别 key。
    未匹配到映射或未挂 type 时回落到通用的 ISSUE（保证始终有兜底）。
    """
    if issue is None:
        return TIMESHEET_CATEGORY_ISSUE
    type_name = None
    type_obj = getattr(issue, "type", None)
    if type_obj is not None:
        type_name = getattr(type_obj, "name", None)
    if not type_name and getattr(issue, "type_id", None):
        # lazy 读取，避免调用方必须 select_related('type')
        from .issue_type import IssueType

        type_name = (
            IssueType.objects.filter(pk=issue.type_id)
            .values_list("name", flat=True)
            .first()
        )
    return ISSUE_TYPE_NAME_TO_CATEGORY_KEY.get(type_name, TIMESHEET_CATEGORY_ISSUE)


class TimesheetCategory(BaseModel):
    """
    工时类别字典：运行时用来决定工时条目的归类与填报面板。

    当前内置四类：
      - PROJECT：项目工时（只挂 project）
      - ISSUE：工作项工时（必须挂 issue）
      - TEST_CASE：测试工时（必须挂 test_case）
      - SAMPLE：送样工时（只挂 project，与项目工时类似但类别独立）

    未来新增纯项目级类别只需追加一条数据；若新增需要关联新对象的类别，
    同步扩展 TimeSheet.clean() 与 CATEGORY_KEYS_* 常量。
    """

    key = models.CharField(max_length=32, unique=True, verbose_name="类别编码")
    name = models.CharField(max_length=64, verbose_name="类别名称")
    description = models.TextField(blank=True, default="", verbose_name="描述")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="排序")
    is_active = models.BooleanField(default=True, verbose_name="是否启用")
    is_system = models.BooleanField(default=False, verbose_name="是否系统预置")

    class Meta:
        verbose_name = "工时类别"
        verbose_name_plural = "工时类别"
        db_table = "timesheet_categories"
        ordering = ("sort_order", "key")

    def __str__(self):
        return f"{self.key} - {self.name}"


class TimeSheet(BaseModel):
    """
    工时记录：记录一个人在某个时间段内的工时投入。

    挂靠规则：
      - project 必填，代表该工时所属的项目。
      - category 必填，决定该工时的业务类别（项目/工作项/测试/送样/…）。
      - issue / test_case 为可选的二级挂靠对象，最多只能同时填写其中一个；
        具体必填/必空关系由 category.key 决定（见 clean()）。
      - 当提供 issue 时，project 由 issue.project 自动回填；
        当提供 test_case 时，project 由 test_case.repository.project 自动回填。
    """

    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="timesheets",
        verbose_name="工时人员",
    )
    date = models.DateField(verbose_name="工时日期")
    start_time = models.TimeField(verbose_name="开始时间")
    end_time = models.TimeField(verbose_name="结束时间")
    hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name="花费小时数",
    )
    description = models.TextField(blank=True, verbose_name="工作描述")

    # 所属项目（必填；当挂靠工作项或测试用例时由 save() 自动回填）
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="timesheets",
        verbose_name="所属项目",
    )

    # 可选二级挂靠对象，二者最多只能填写其中一个
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="timesheets",
        verbose_name="所属工作项",
    )
    test_case = models.ForeignKey(
        "db.TestCase",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="timesheets",
        verbose_name="所属测试用例",
    )

    # 工时类别（必填；数据迁移会为历史记录按 issue/test_case 是否为空自动回填）
    category = models.ForeignKey(
        "db.TimesheetCategory",
        on_delete=models.PROTECT,
        related_name="timesheets",
        verbose_name="工时类别",
    )

    class Meta:
        verbose_name = "工时记录"
        verbose_name_plural = "工时记录"
        db_table = "timesheets"
        ordering = ("-date", "-start_time")
        constraints = [
            # issue 与 test_case 不能同时有值
            models.CheckConstraint(
                check=Q(issue__isnull=True) | Q(test_case__isnull=True),
                name="timesheet_issue_and_test_case_not_both_set",
            ),
            # 花费小时数必须为正数
            models.CheckConstraint(
                check=Q(hours__gt=0),
                name="timesheet_hours_positive",
            ),
            models.UniqueConstraint(
                fields=["member", "date", "start_time", "end_time", "issue"],
                condition=Q(issue__isnull=False, test_case__isnull=True, deleted_at__isnull=True),
                name="timesheet_unique_member_issue_slot_active",
            ),
            models.UniqueConstraint(
                fields=["member", "date", "start_time", "end_time", "test_case"],
                condition=Q(test_case__isnull=False, issue__isnull=True, deleted_at__isnull=True),
                name="timesheet_unique_member_case_slot_active",
            ),
            # 仅项目级类别（无 issue / test_case）按 (category, project) 组合唯一，
            # 以便「项目工时」与「送样工时」在同一时间段可共存。
            models.UniqueConstraint(
                fields=["member", "date", "start_time", "end_time", "category", "project"],
                condition=Q(issue__isnull=True, test_case__isnull=True, deleted_at__isnull=True),
                name="timesheet_unique_member_cat_project_slot",
            ),
        ]
        indexes = [
            models.Index(fields=["member", "date"], name="idx_timesheet_member_date"),
            models.Index(fields=["project"], name="idx_timesheet_project"),
            models.Index(fields=["issue"], name="idx_timesheet_issue"),
            models.Index(fields=["test_case"], name="idx_timesheet_test_case"),
            models.Index(fields=["category"], name="idx_timesheet_category"),
        ]

    def __str__(self):
        secondary = (
            f" / issue:{self.issue_id}"
            if self.issue_id
            else f" / case:{self.test_case_id}"
            if self.test_case_id
            else ""
        )
        return f"{self.member} | {self.date} | {self.hours}h | project:{self.project_id}{secondary}"

    @staticmethod
    def get_earliest_allowed_date():
        """工时填报最早允许日期：上个月1号"""
        today = datetime.date.today()
        if today.month == 1:
            return datetime.date(today.year - 1, 12, 1)
        return datetime.date(today.year, today.month - 1, 1)

    def clean(self):
        super().clean()

        # 工时填报日期限制：不允许填报超过上一个月的工时
        if self.date:
            earliest = self.get_earliest_allowed_date()
            if self.date < earliest:
                raise ValidationError(
                    {"date": f"不允许填报 {earliest.strftime('%Y-%m-%d')} 之前的工时，仅可填报本月和上月的工时。"}
                )

        # issue 与 test_case 不能同时填写
        if self.issue_id and self.test_case_id:
            raise ValidationError("工时记录的工作项与测试用例不能同时填写，最多挂靠其中一个。")

        # 按工时类别校验 issue / test_case 的必填与互斥关系
        category_key = None
        if self.category_id:
            # 通过 category 字段读取 key；若 category 尚未从数据库加载，使用 values() 避免额外错误
            try:
                category_key = self.category.key
            except Exception:
                from .timesheet import TimesheetCategory as _Cat  # 避免循环导入风险
                category_key = _Cat.objects.filter(pk=self.category_id).values_list("key", flat=True).first()

        if category_key in CATEGORY_KEYS_REQUIRE_ISSUE:
            if not self.issue_id:
                raise ValidationError({"issue": "该工时类别必须挂靠工作项。"})
            if self.test_case_id:
                raise ValidationError({"test_case": "该工时类别不能挂靠测试用例。"})
        elif category_key in CATEGORY_KEYS_REQUIRE_TEST_CASE:
            if not self.test_case_id:
                raise ValidationError({"test_case": "该工时类别必须挂靠测试用例。"})
            if self.issue_id:
                raise ValidationError({"issue": "该工时类别不能挂靠工作项。"})
        elif category_key in CATEGORY_KEYS_PROJECT_ONLY:
            if self.issue_id:
                raise ValidationError({"issue": "该工时类别不能挂靠工作项。"})
            if self.test_case_id:
                raise ValidationError({"test_case": "该工时类别不能挂靠测试用例。"})

        # 验证结束时间晚于开始时间
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": "结束时间必须晚于开始时间。"})

        # 验证花费小时数为正数
        if self.hours is not None and self.hours <= 0:
            raise ValidationError({"hours": "花费小时数必须大于 0。"})

        # 验证花费小时数不超过开始/结束时间之差
        if self.start_time and self.end_time and self.hours is not None and self.end_time > self.start_time:
            start_dt = datetime.datetime.combine(datetime.date.today(), self.start_time)
            if self.end_time == MIDNIGHT_END_SENTINEL:
                end_dt = datetime.datetime.combine(
                    datetime.date.today() + datetime.timedelta(days=1),
                    datetime.time(0, 0, 0),
                )
            else:
                end_dt = datetime.datetime.combine(datetime.date.today(), self.end_time)
            td = end_dt - start_dt
            duration_seconds = Decimal(td.days * 86400 + td.seconds)
            max_hours = duration_seconds / Decimal("3600")
            if self.hours > max_hours:
                raise ValidationError(
                    {
                        "hours": (
                            f"花费小时数（{self.hours}h）不能超过开始与结束时间之差（{max_hours:.2f}h）。"
                        )
                    }
                )

        # 校验 issue 与 project 归属一致
        if self.issue_id and self.project_id and self.issue.project_id != self.project_id:
            raise ValidationError({"issue": "所选工作项不属于当前项目。"})

        # 校验 test_case 与 project 归属一致
        if self.test_case_id and self.project_id:
            case_project_id = self.test_case.repository.project_id
            if case_project_id != self.project_id:
                raise ValidationError({"test_case": "所选测试用例不属于当前项目。"})

        if (
            self.member_id
            and self.date
            and self.start_time
            and self.end_time
        ):
            overlap_qs = self.__class__.objects.filter(
                member_id=self.member_id,
                date=self.date,
                start_time__lt=self.end_time,
                end_time__gt=self.start_time,
                deleted_at__isnull=True,
            )

            if self.pk:
                overlap_qs = overlap_qs.exclude(pk=self.pk)

            if overlap_qs.exists():
                raise ValidationError(
                    "同一成员在同一天存在时间重叠的工时记录，请调整时间段后再登记。"
                )

    def save(self, *args, **kwargs):
        # 挂靠工作项时，自动回填所属项目
        if self.issue_id and not self.project_id:
            self.project_id = self.issue.project_id

        # 挂靠测试用例时，自动回填所属项目
        if self.test_case_id and not self.project_id:
            self.project_id = self.test_case.repository.project_id

        # category 未指定时按 issue / test_case 兜底推断（兼容旧调用点与迁移期）
        if not self.category_id:
            if self.test_case_id:
                fallback_key = TIMESHEET_CATEGORY_TEST_CASE
            elif self.issue_id:
                # 工作项工时按 type.name 路由到拆分后的子类别（需求 / 任务 / 缺陷）
                fallback_key = resolve_issue_category_key(self.issue)
            else:
                fallback_key = TIMESHEET_CATEGORY_PROJECT
            # 先按 is_active 取；取不到（如拆分前的旧 ISSUE 被停用）再放开条件，
            # 以保证即使字典表有停用项、老客户端仍可保存。
            fallback_id = (
                TimesheetCategory.objects.filter(key=fallback_key, is_active=True)
                .values_list("id", flat=True)
                .first()
            )
            if fallback_id is None:
                fallback_id = (
                    TimesheetCategory.objects.filter(key=fallback_key)
                    .values_list("id", flat=True)
                    .first()
                )
            if fallback_id is not None:
                self.category_id = fallback_id

        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)
