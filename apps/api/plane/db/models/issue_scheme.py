"""工作项方案：一套「类型 + 扩展字段 + 状态 + 工作流」的容器。

两种归属::

    类型库（project 为空）    每个工作区恰好一个，所有研发模式都指向它；模式经 DevModeIssueType
                              关联库里的类型，跟随项目只看得到所属模式关联的类型
    项目方案（project 非空）  归某个项目所有（项目切换为自定义时拷出），只有这个项目用

项目恒指向一个方案（``Project.issue_scheme``）；跟随 = 指向类型库。

所有读写只按 ``scheme`` 过滤（批次 3 起）：五张表（IssueType / TypeExtraField / State /
Workflow / WorkflowTransition）继承 ``SchemeBaseModel``，没有 ``project`` 列。按项目取
「本项目能用的类型 / 状态」统一写成 ``scheme__projects=<project_id>``（经 Project.issue_scheme
反查），跟随与自定义两种项目走同一条路径。
"""

from django.db import IntegrityError, models, transaction
from django.db.models import Q

from .base import BaseModel

#: 类型库方案的名字（只用于展示和排错）
ISSUE_TYPE_LIBRARY_NAME = "工作项类型库"


class IssueScheme(BaseModel):
    """工作项方案。

    **不覆写硬删**（不同于 DevMode / StageType）：级联链是 方案 → 状态 → 工作项
    （``Issue.state`` 是 CASCADE），硬删一个方案会把工作项一起硬删。走普通软删。
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="issue_schemes",
        verbose_name="所属工作区",
    )
    # 模式方案 = 模式名；项目方案 = 项目名。只用于展示和排错，由 DevMode / Project 的 save() 同步
    name = models.CharField(max_length=255, verbose_name="名称")
    # 有值 = 项目方案；空 = 模式方案
    project = models.OneToOneField(
        "db.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="owned_issue_scheme",
        verbose_name="归属项目",
    )

    class Meta:
        db_table = "issue_schemes"
        ordering = ("created_at", "id")
        verbose_name = "Issue Scheme"
        verbose_name_plural = "Issue Schemes"
        constraints = [
            # 每个工作区只有一个类型库
            models.UniqueConstraint(
                fields=["workspace"],
                condition=Q(project__isnull=True, deleted_at__isnull=True),
                name="issue_scheme_one_library_per_workspace",
            ),
        ]

    @property
    def is_project_owned(self):
        return self.project_id is not None

    @classmethod
    def get_or_create_library(cls, workspace_id):
        """本工作区的类型库方案，没有就建（只建空壳，种子内容由 utils.issue_scheme.ensure_issue_type_library 补）。"""
        library = cls.objects.filter(workspace_id=workspace_id, project__isnull=True).first()
        if library is not None:
            return library
        try:
            with transaction.atomic():
                return cls.objects.create(workspace_id=workspace_id, name=ISSUE_TYPE_LIBRARY_NAME)
        except IntegrityError:
            # 并发建库撞了唯一约束：另一路已经建好
            return cls.objects.get(workspace_id=workspace_id, project__isnull=True)

    def __str__(self):
        return self.name


class SchemeBaseModel(BaseModel):
    """挂在方案下的五张表的公共基类：workspace + scheme（scheme 由子类声明，为了各自的 related_name）。

    ``workspace`` 恒等于 ``scheme.workspace``，在 save() 里带出（同 ProjectBaseModel 从项目带）。
    这些行**不代表某个项目**：要判断「属于哪个项目」的业务逻辑（成员资格、字段值、审批记录）
    从工作项或请求上下文取项目，不要从这些行上取（需求 3.1.2）。
    """

    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="workspace_%(class)s"
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.scheme_id is not None:
            self.workspace_id = self.scheme.workspace_id
        super().save(*args, **kwargs)
