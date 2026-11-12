from django.conf import settings
from django.db import models

from .base import BaseModel
from .project import ProjectBaseModel


class Product(BaseModel):
    name = models.CharField(max_length=255)
    identifier = models.CharField(
        max_length=12, db_index=True, verbose_name="产品标识（需求编号前缀）"
    )
    # 产品代号（Cedar28B-032501-水）。允许重复，只有非空 check，见 Meta.constraints。
    code = models.CharField(max_length=255, verbose_name="产品代号")
    # 六个字典 FK：DB 允许空（迁移前的存量产品为空，前端编辑时强制补齐），API 层必填。
    # RESTRICT 而非 PROTECT：直接删被引用的字典值同样报错，但整个工作区硬删时
    # Product 与 DataDictionaryItem 同批级联可以通过。真正的保护在
    # DataDictionaryItemViewSet.destroy 的引用检查 —— soft_delete_related_objects
    # 会把 RESTRICT/PROTECT 当 CASCADE 软删，所以字典值只能硬删。
    stage = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="products_by_stage",
        verbose_name="产品阶段",
    )
    category = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="products_by_category",
        verbose_name="产品类别",
    )
    status = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="products_by_status",
        verbose_name="产品状态",
    )
    hardware_level = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="products_by_hardware_level",
        verbose_name="硬件研发等级",
    )
    structure_level = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="products_by_structure_level",
        verbose_name="结构研发等级",
    )
    software_level = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="products_by_software_level",
        verbose_name="软件研发等级",
    )
    start_date = models.DateField(null=True, blank=True, verbose_name="启动日期")
    # 两位负责人只要求是工作区成员，不像 owner 那样要求进产品成员表
    project_lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_lead_products",
        verbose_name="项目负责人",
    )
    test_lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="test_lead_products",
        verbose_name="测试负责人",
    )
    model_number = models.CharField(
        max_length=255, null=True, blank=True, verbose_name="产品型号"
    )
    external_model = models.CharField(
        max_length=255, null=True, blank=True, verbose_name="外部型号"
    )
    o_phase_close_date = models.DateField(
        null=True, blank=True, verbose_name="O阶段关闭日期"
    )
    v_phase_close_date = models.DateField(
        null=True, blank=True, verbose_name="V阶段关闭日期"
    )
    description_html = models.TextField(
        verbose_name="Product Description HTML", blank=True, null=True
    )
    workspace = models.ForeignKey(
        "db.WorkSpace", on_delete=models.CASCADE, related_name="products"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_products",
    )
    reviewers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="reviewed_products",
        blank=True,
        verbose_name="评审人",
    )
    logo_props = models.JSONField(default=dict)
    # 外部来源（如 "jiandaoyun_product" = 简道云同步来的产品）与远端记录 _id，见 plane/integrations/product_sync.py
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    def save(self, *args, **kwargs):
        # 最后一道防线 —— 真正的归一化在 ProductSerializer.validate_identifier，
        # 那里必须先归一化再查重，否则 "ecom" 会绕过查重直接撞 DB 约束。
        if self.identifier:
            self.identifier = self.identifier.strip().upper()
        if self.code:
            self.code = self.code.strip()
        elif self.name:
            # ORM 直建（脚本 / 测试）的兜底，口径与迁移 0347 的回填一致（代号缺省 = 名称）；
            # API 层 code 仍是必填，这里只是别让 CheckConstraint 在非 API 路径上炸。
            self.code = self.name.strip()
        return super().save(*args, **kwargs)

    class Meta:
        db_table = "products"
        ordering = ("-created_at",)

        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_unique_name_workspace_deleted_at__isnull",
            ),
            # 标识是需求编号的前缀（ECOM-1）。带 deleted_at 条件是刻意的：
            # 标识由用户手填，产品删掉之后应该允许改嫁给新产品。
            # 需求行上的 sequence_id 则相反，见 Requirement.Meta.constraints。
            models.UniqueConstraint(
                fields=["identifier", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_unique_identifier_workspace_active",
            ),
            # 空标识撑不起 ECOM-1。没有它，第一个漏填的产品会静默拿到 ''，
            # 直到同工作区第二个漏填的产品才报唯一约束 —— 那时排查现场已经不在了。
            models.CheckConstraint(
                check=~models.Q(identifier=""),
                name="product_identifier_not_blank",
            ),
            # 代号不唯一：多个产品可以挂同一个项目代号（取自 project_code 字典）
            models.CheckConstraint(
                check=~models.Q(code=""),
                name="product_code_not_blank",
            ),
        ]


class ProductProject(ProjectBaseModel):
    """产品与项目的关联。项目通过它确定自己能引用哪些产品的需求。

    Product 本身是工作区级的、与 Project 没有外键关系（见 docs/domain-glossary.md
    的「已知的断链」）。这张表是唯一的桥，且**只表达引用关系** —— 产品不因此归属
    某个项目，项目也不因此获得产品的写权限。

    两端必须同工作区。这条跨表规则 DB 表达不了（workspace 在各自的父表上），由
    写入口校验，见 plane/utils/requirement_project.py::resolve_linkable_products
    与 resolve_linkable_projects。
    """

    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="product_projects",
        verbose_name="所属产品",
    )
    # project / workspace 由 ProjectBaseModel 提供

    class Meta:
        unique_together = ["product", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_project_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Product Project"
        verbose_name_plural = "Product Projects"
        db_table = "product_projects"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.product.name} <-> {self.project.name}"


class ProductTeamAssignment(ProjectBaseModel):
    """产品研发矩阵：这个项目里，谁负责这个产品的什么角色。

    只回答「找谁」（阶段评审负责人 / 审核人候选、审批人按角色找人时先按产品找），
    **任何鉴权都不读它**。一格可以有多个人。纯连接行，硬删。
    写入口校验 (project, product) 是活跃关联、member 是该项目活跃成员。
    """

    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="team_assignments",
        verbose_name="所属产品",
    )
    job_role = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.PROTECT,
        related_name="product_team_assignments",
        verbose_name="角色",
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="product_team_assignments",
        verbose_name="成员",
    )

    class Meta:
        db_table = "product_team_assignments"
        ordering = ("created_at",)
        verbose_name = "Product Team Assignment"
        verbose_name_plural = "Product Team Assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["project", "product", "job_role", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_team_assignment_unique_active",
            ),
        ]

    def delete(self, using=None, soft=False, *args, **kwargs):
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return f"{self.project_id}/{self.product_id}/{self.job_role_id} -> {self.member_id}"
