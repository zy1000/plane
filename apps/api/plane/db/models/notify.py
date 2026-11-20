"""统一通知入口用到的三张表：对象订阅人、通知事件、邮件发送记录。

规则与发送逻辑在 ``plane/utils/notify/``，这里只放数据结构。
"""

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class NotifyMode(models.TextChoices):
    """邮件接收方式。``NONE`` 只出现在个人设置和事件的最终结果里，订阅人不会是 none。"""

    INSTANT = "instant", "即时邮件"
    DIGEST = "digest", "每日摘要"
    NONE = "none", "不接收"


class NotifyCategory(models.TextChoices):
    """个人设置里的四个类别，决定个人能把这类邮件调成什么方式。"""

    APPROVAL = "approval", "待我审批"
    ASSIGN = "assign", "指派与提及"
    RESULT = "result", "我发起事项的结果"
    INFORM = "inform", "知会"


class NotifySubscriber(BaseModel):
    """工作项以外的对象（发布、迭代、需求、项目阶段、测试计划）上的订阅人。

    工作项沿用 ``IssueSubscriber``。一张表管所有对象类型，靠 ``entity_type`` + ``entity_id`` 定位。
    """

    class EntityType(models.TextChoices):
        RELEASE = "release", "发布"
        CYCLE = "cycle", "迭代"
        REQUIREMENT = "requirement", "需求"
        PROJECT_STAGE = "project_stage", "项目阶段"
        TEST_PLAN = "test_plan", "测试计划"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="notify_subscribers")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="notify_subscribers", null=True)
    entity_type = models.CharField(max_length=32, choices=EntityType.choices)
    entity_id = models.UUIDField()
    subscriber = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notify_subscriptions")
    mode = models.CharField(max_length=16, choices=NotifyMode.choices, default=NotifyMode.DIGEST)

    class Meta:
        verbose_name = "Notify Subscriber"
        verbose_name_plural = "Notify Subscribers"
        db_table = "notify_subscribers"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["entity_type", "entity_id", "subscriber"],
                condition=models.Q(deleted_at__isnull=True),
                name="notify_subscriber_unique_entity_subscriber_when_deleted_at_null",
            )
        ]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"], name="notify_sub_entity_idx"),
            models.Index(fields=["subscriber", "workspace"], name="notify_sub_user_ws_idx"),
        ]

    def __str__(self):
        return f"{self.entity_type}:{self.entity_id} <{self.subscriber_id}>"


class NotifyMail(BaseModel):
    """一封邮件一行，同时就是「邮件发送记录」页的数据。"""

    class Kind(models.TextChoices):
        INSTANT = "instant", "即时"
        DIGEST = "digest", "每日摘要"

    class Status(models.TextChoices):
        PENDING = "pending", "待发送"
        SENT = "sent", "已发送"
        FAILED = "failed", "发送失败"
        NO_RECIPIENT = "no_recipient", "无收件人"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="notify_mails")
    # 「无收件人」的记录没有收件人
    receiver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notify_mails", null=True)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    category = models.CharField(max_length=16, choices=NotifyCategory.choices, blank=True, default="")
    subject = models.CharField(max_length=500)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    # 失败原因 / 无收件人原因，给管理员看的一句话
    reason = models.CharField(max_length=500, blank=True, default="")
    attempts = models.PositiveSmallIntegerField(default=0)
    next_retry_at = models.DateTimeField(null=True)
    sent_at = models.DateTimeField(null=True)
    # 渲染邮件要用的全部内容；重发时直接拿它重新渲染，不再回头查业务表
    payload = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Notify Mail"
        verbose_name_plural = "Notify Mails"
        db_table = "notify_mails"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workspace", "status", "created_at"], name="notify_mail_ws_status_idx"),
            models.Index(fields=["status", "next_retry_at"], name="notify_mail_retry_idx"),
            models.Index(fields=["receiver", "kind", "created_at"], name="notify_mail_receiver_idx"),
        ]

    def __str__(self):
        return f"{self.kind} <{self.receiver_id}> {self.subject}"


class NotifyEvent(BaseModel):
    """一件事对一个收件人的一条待发内容。

    即时的由 ``flush_instant_mails`` 按「人 × 类别」合并成一封；每日摘要的由
    ``send_daily_digests`` 在次日早上汇总。发出去之后 ``mail`` 指向那封邮件。
    """

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="notify_events")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="notify_events", null=True)
    receiver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notify_events")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="triggered_notify_events", null=True
    )
    # 事件代码，见 utils/notify/rules.py
    event = models.CharField(max_length=64)
    category = models.CharField(max_length=16, choices=NotifyCategory.choices)
    mode = models.CharField(max_length=16, choices=NotifyMode.choices)
    # 事件所在对象；摘要按它分组，链接也指向它
    entity_type = models.CharField(max_length=32)
    entity_id = models.UUIDField(null=True)
    # 同一个 dedupe_key 当天已经即时发过的，后面的改进摘要（如同一个用例评审反复追加用例）
    dedupe_key = models.CharField(max_length=200, blank=True, default="")
    # 邮件里的一行：标签、标题、说明、明细、链接（站内相对路径）
    tag = models.CharField(max_length=32, blank=True, default="")
    title = models.CharField(max_length=500)
    summary = models.CharField(max_length=1000, blank=True, default="")
    details = models.JSONField(default=list)
    url_path = models.CharField(max_length=500, blank=True, default="")
    # 操作时的访问地址，认不出大网 / 小网地址时拿它拼链接
    origin = models.CharField(max_length=300, blank=True, default="")
    mail = models.ForeignKey(NotifyMail, on_delete=models.SET_NULL, related_name="events", null=True)
    # 已处理（发出、并入摘要、或因个人设置 / 上限不发）的时间；为空表示还在排队
    handled_at = models.DateTimeField(null=True)

    class Meta:
        verbose_name = "Notify Event"
        verbose_name_plural = "Notify Events"
        db_table = "notify_events"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["mode", "handled_at", "created_at"], name="notify_event_queue_idx"),
            models.Index(fields=["receiver", "mode", "handled_at"], name="notify_event_receiver_idx"),
            models.Index(fields=["receiver", "dedupe_key", "created_at"], name="notify_event_dedupe_idx"),
        ]

    def __str__(self):
        return f"{self.event} <{self.receiver_id}>"


class NotifyRuleOverride(BaseModel):
    """工作区在「通知规则」页改过的规则：某个事件里某个收件角色的方式。

    只存和系统默认不一样的那几格；没有记录的角色跟随内置规则（``utils/notify/rules.py``）。
    「恢复默认」就是把这个事件的记录删掉。
    """

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="notify_rule_overrides")
    event = models.CharField(max_length=64)
    role = models.CharField(max_length=32)
    mode = models.CharField(max_length=16, choices=NotifyMode.choices)

    class Meta:
        verbose_name = "Notify Rule Override"
        verbose_name_plural = "Notify Rule Overrides"
        db_table = "notify_rule_overrides"
        ordering = ("event", "role")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "event", "role"],
                condition=models.Q(deleted_at__isnull=True),
                name="notify_rule_override_unique_event_role_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.event}:{self.role}={self.mode}"
