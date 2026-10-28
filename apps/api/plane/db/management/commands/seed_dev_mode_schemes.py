# 工作项类型库：确保每个有研发模式的工作区都有类型库且已生成种子，并给还没有任何类型关联的模式关联系统类型。
#
# 上线时跑一次。漏跑也不会坏：打开模板中心类型库 / 模式工作项页、新建跟随项目时都会按需补上
# （utils.issue_scheme.ensure_issue_type_library / ensure_mode_type_links）。幂等，可重复执行。

from django.core.management import BaseCommand

from plane.db.models import DevMode
from plane.utils.issue_scheme import ensure_issue_type_library, ensure_mode_type_links


class Command(BaseCommand):
    help = "确保工作项类型库已生成种子，并给没有关联类型的研发模式关联系统类型。可重复执行。"

    def add_arguments(self, parser):
        parser.add_argument("--workspace", type=str, default="", help="只处理这个工作区（slug），默认全部")

    def handle(self, *args, **options):
        modes = DevMode.objects.select_related("workspace").order_by("workspace__slug", "created_at")
        if options["workspace"]:
            modes = modes.filter(workspace__slug=options["workspace"])
        linked = 0
        seen = set()
        for mode in modes:
            if mode.workspace_id not in seen:
                ensure_issue_type_library(mode.workspace_id)
                seen.add(mode.workspace_id)
            if ensure_mode_type_links(mode):
                linked += 1
                self.stdout.write(f"已关联  {mode.workspace.slug} / {mode.name}")
        self.stdout.write(self.style.SUCCESS(f"完成：{len(seen)} 个工作区，新关联 {linked} 个模式"))
