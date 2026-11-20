"""清理存量的工作项订阅：只保留创建人和当前负责人。

以前任何人操作过一次工作项、被 @ 过一次，就会被自动加为订阅人，而且只增不减；表里没有记
来源，分不出哪些是本人手动点的订阅。按已定的规则，存量一律只留创建人和当前负责人，其余软删。
之后想继续关注的人自己再点「订阅」。

默认只打印要删多少；加 --apply 才写库（软删，``deleted_at`` 置为当前时间，可以按时间找回）。
"""

from django.core.management import BaseCommand
from django.db.models import Exists, F, OuterRef
from django.utils import timezone

from plane.db.models import IssueAssignee, IssueSubscriber


class Command(BaseCommand):
    help = "清理存量工作项订阅，只保留创建人和当前负责人（默认只预览，--apply 才执行）"

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="真正写库；不加只打印要删多少")
        parser.add_argument("--workspace", help="只处理这个工作区（slug）")

    def handle(self, *args, **options):
        subscribers = IssueSubscriber.objects.all()
        if options["workspace"]:
            subscribers = subscribers.filter(workspace__slug=options["workspace"])
        is_assignee = Exists(
            IssueAssignee.objects.filter(
                issue_id=OuterRef("issue_id"), assignee_id=OuterRef("subscriber_id"), deleted_at__isnull=True
            )
        )
        total = subscribers.count()
        creators = subscribers.filter(subscriber_id=F("issue__created_by_id")).count()
        extra = subscribers.exclude(subscriber_id=F("issue__created_by_id")).annotate(is_assignee=is_assignee)
        assignees = extra.filter(is_assignee=True).count()
        stale = extra.filter(is_assignee=False)
        stale_count = stale.count()

        self.stdout.write(f"现有订阅 {total} 条：创建人 {creators}，当前负责人（非创建人）{assignees}，其余 {stale_count}")
        self.stdout.write(f"将删除「其余」这 {stale_count} 条，涉及 {stale.values('subscriber_id').distinct().count()} 人")
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("预览模式，没有写库。确认无误后加 --apply 执行。"))
            return

        now = timezone.now()
        deleted = IssueSubscriber.objects.filter(pk__in=stale.values("pk")).update(deleted_at=now)
        self.stdout.write(self.style.SUCCESS(f"已软删 {deleted} 条，deleted_at = {now.isoformat()}"))
