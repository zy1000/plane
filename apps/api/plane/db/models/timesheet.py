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


class TimeSheet(BaseModel):
    """
    工时记录：记录一个人在某个时间段内的工时投入。

    挂靠规则：
      - project 必填，代表该工时所属的项目。
      - issue / test_case 为可选的二级挂靠对象，最多只能同时填写其中一个。
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
            models.UniqueConstraint(
                fields=["member", "date", "start_time", "end_time", "project"],
                condition=Q(issue__isnull=True, test_case__isnull=True, deleted_at__isnull=True),
                name="timesheet_unique_member_project_slot_active",
            ),
        ]
        indexes = [
            models.Index(fields=["member", "date"], name="idx_timesheet_member_date"),
            models.Index(fields=["project"], name="idx_timesheet_project"),
            models.Index(fields=["issue"], name="idx_timesheet_issue"),
            models.Index(fields=["test_case"], name="idx_timesheet_test_case"),
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

        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)
