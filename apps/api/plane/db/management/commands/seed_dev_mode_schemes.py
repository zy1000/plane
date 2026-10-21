# 工作项方案批次 4（docs/issue-scheme/）：给研发模式的空方案生成种子内容。
#
# 新建模式（模板中心接口）时会自动生成；存量模式在批次 1 只建了空壳，上线时跑一次本命令补齐。
# 漏跑也不会坏：新项目跟随一个空模式方案时，建项目流程会先补生成（utils.issue_scheme.prepare_project_issue_scheme）。
# 幂等：方案里已有任何类型就跳过。

from django.core.management import BaseCommand

from plane.db.models import DevMode
from plane.utils.issue_scheme import seed_issue_scheme


class Command(BaseCommand):
    help = "给研发模式的空工作项方案生成种子内容（五个类型、默认状态、缺陷字段与缺陷默认工作流）。可重复执行。"

    def add_arguments(self, parser):
        parser.add_argument("--workspace", type=str, default="", help="只处理这个工作区（slug），默认全部")

    def handle(self, *args, **options):
        modes = DevMode.objects.select_related("issue_scheme", "workspace").order_by("workspace__slug", "created_at")
        if options["workspace"]:
            modes = modes.filter(workspace__slug=options["workspace"])
        seeded = skipped = 0
        for mode in modes:
            if seed_issue_scheme(mode.issue_scheme):
                seeded += 1
                self.stdout.write(f"已生成  {mode.workspace.slug} / {mode.name}")
            else:
                skipped += 1
        self.stdout.write(self.style.SUCCESS(f"完成：生成 {seeded} 个，已有内容跳过 {skipped} 个"))
