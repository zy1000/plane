"""把缺陷字段「技术原因及解决方案」拆成「技术原因」+「解决方案」。

- 原字段改名为「技术原因」：字段值和流转必填都挂在字段 id 上，原样跟过去（旧内容留在「技术原因」里，不拆文本）
- 同一类型下新建「解决方案」，定义照抄原字段；原字段在哪些流转上必填，「解决方案」也在那些流转上必填
- 字段库里的同名库字段同样改名，再建一个「解决方案」库字段，绑到原来绑定的类型上
- 只要有类型或字段库已经有「技术原因」/「解决方案」，就列出来、整体不执行，先手工处理

默认只打印要改什么；加 --apply 才写库（一个事务，失败整体回滚）。
"""

from collections import Counter, defaultdict

from django.core.management import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from plane.db.models import IssueFieldDefinition, TypeExtraField, TypeExtraFieldValue
from plane.db.models.issue_type import LIBRARY_FIELD_DEFINITION_COLUMNS
from plane.db.models.workflow import WorkflowTransitionRequiredField

OLD_NAME = "技术原因及解决方案"
REASON_NAME = "技术原因"
SOLUTION_NAME = "解决方案"


class Command(BaseCommand):
    help = "把缺陷字段「技术原因及解决方案」拆成「技术原因」+「解决方案」（默认只预览，--apply 才写库）"

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="真正写库；不加只打印要改什么")
        parser.add_argument("--workspace", help="只处理这个工作区（slug）")

    def handle(self, *args, **options):
        definitions = IssueFieldDefinition.objects.filter(name=OLD_NAME)
        fields = TypeExtraField.objects.filter(name=OLD_NAME)
        if options["workspace"]:
            definitions = definitions.filter(workspace__slug=options["workspace"])
            fields = fields.filter(workspace__slug=options["workspace"])
        definitions = list(definitions.select_related("workspace"))
        fields = list(fields.select_related("workspace"))
        if not fields and not definitions:
            self.stdout.write("没有名为「技术原因及解决方案」的字段，不用拆")
            return

        self._check_conflicts(definitions, fields)

        required_rows = list(WorkflowTransitionRequiredField.objects.filter(extra_field__in=fields))
        moves = self._tie_moves(fields)
        self._print_plan(definitions, fields, required_rows)
        self.stdout.write(f"其中 {len(moves)} 个类型要把排在原字段后面的同序号字段往后挪，让「解决方案」紧跟「技术原因」")

        if not options["apply"]:
            self.stdout.write(self.style.WARNING("预览模式，没有写库。确认无误后加 --apply 执行。"))
            return

        with transaction.atomic():
            self._apply(definitions, fields, required_rows, moves)

        left = TypeExtraField.objects.filter(name=OLD_NAME, id__in=[f.id for f in fields]).count()
        self.stdout.write(self.style.SUCCESS(f"已完成。剩余未改名字段：{left}"))

    def _check_conflicts(self, definitions, fields):
        problems = []
        clashes = TypeExtraField.objects.filter(
            issue_type_id__in={f.issue_type_id for f in fields}, name__in=(REASON_NAME, SOLUTION_NAME)
        ).select_related("workspace", "scheme", "issue_type")
        for f in clashes:
            problems.append(f"类型 {f.workspace.slug} /「{f.scheme.name}」/「{f.issue_type.name}」已有字段「{f.name}」")
        library_clashes = IssueFieldDefinition.objects.filter(
            workspace_id__in={d.workspace_id for d in definitions}, name__in=(REASON_NAME, SOLUTION_NAME)
        ).select_related("workspace")
        for d in library_clashes:
            problems.append(f"字段库 {d.workspace.slug} 已有库字段「{d.name}」")
        if problems:
            for line in problems:
                self.stderr.write(line)
            raise CommandError(f"有 {len(problems)} 处同名冲突，先手工处理再跑")

    def _tie_moves(self, fields):
        """字段按 (sort_order, created_at) 排，老类型的 sort_order 多半都是 65535、实际靠创建时间排。
        「解决方案」取原字段的 sort_order 会落到同序号字段的最后；把排在原字段后面的同序号字段挪到
        原字段与下一档之间（彼此顺序不变），「解决方案」就紧跟原字段。返回 {原字段 id: (要挪的字段 id, 新 sort_order)}。
        """
        siblings = defaultdict(list)
        for row in TypeExtraField.objects.filter(issue_type_id__in={f.issue_type_id for f in fields}).values(
            "id", "issue_type_id", "sort_order", "created_at"
        ):
            siblings[row["issue_type_id"]].append(row)
        moves = {}
        for f in fields:
            rows = siblings[f.issue_type_id]
            later = [r["id"] for r in rows if r["sort_order"] == f.sort_order and r["created_at"] > f.created_at]
            if later:
                bigger = [r["sort_order"] for r in rows if r["sort_order"] > f.sort_order]
                moves[f.id] = (later, (f.sort_order + min(bigger)) / 2 if bigger else f.sort_order + 10000)
        return moves

    def _print_plan(self, definitions, fields, required_rows):
        field_count = Counter(f.workspace.slug for f in fields)
        bound_count = Counter(f.workspace.slug for f in fields if f.library_field_id)
        slug_by_field = {f.id: f.workspace.slug for f in fields}
        required_count = Counter(slug_by_field[r.extra_field_id] for r in required_rows)
        value_count = Counter(
            slug_by_field[field_id]
            for field_id in TypeExtraFieldValue.objects.filter(extra_field__in=fields).values_list(
                "extra_field_id", flat=True
            )
        )

        self.stdout.write("工作区 | 改名字段（其中绑库）| 新建「解决方案」| 补流转必填 | 留在「技术原因」的旧值")
        for slug in sorted(field_count, key=lambda s: -field_count[s]):
            self.stdout.write(
                f"{slug} | {field_count[slug]}（{bound_count[slug]}）| {field_count[slug]} | "
                f"{required_count[slug]} | {value_count[slug]}"
            )
        self.stdout.write(
            f"合计：字段 {len(fields)}，流转必填 {len(required_rows)}，旧值 {sum(value_count.values())}；"
            f"库字段改名并新建「解决方案」{len(definitions)} 个"
            f"（{'、'.join(d.workspace.slug for d in definitions)}）"
        )

    def _apply(self, definitions, fields, required_rows, moves):
        # 1. 库字段：改名会经 IssueFieldDefinition.save() 同步到全部绑定行；再建「解决方案」库字段
        solution_definitions = {}
        for definition in definitions:
            definition.name = REASON_NAME
            definition.save()
            values = definition.definition_values()
            values.update(name=SOLUTION_NAME, description="")
            solution_definitions[definition.id] = IssueFieldDefinition.objects.create(
                workspace_id=definition.workspace_id, sort_order=definition.sort_order, **values
            )

        # 2. 不绑库的字段直接改名
        TypeExtraField.objects.filter(
            id__in=[f.id for f in fields if f.library_field_id is None]
        ).update(name=REASON_NAME, updated_at=timezone.now())

        # 3. 每个类型建「解决方案」，sort_order 同原字段、再挪开同序号的后续字段（见 _tie_moves）→ 紧跟原字段；
        #    原字段绑库的，新字段绑新库字段
        new_field_by_old_id = {}
        for f in fields:
            values = {column: getattr(f, column) for column in LIBRARY_FIELD_DEFINITION_COLUMNS}
            values.update(name=SOLUTION_NAME, description="")
            new_field_by_old_id[f.id] = TypeExtraField(
                workspace_id=f.workspace_id,
                scheme_id=f.scheme_id,
                issue_type_id=f.issue_type_id,
                is_default=f.is_default,
                sort_order=f.sort_order,
                library_field=solution_definitions.get(f.library_field_id),
                **values,
            )
        TypeExtraField.objects.bulk_create(new_field_by_old_id.values())
        for field_ids, sort_order in moves.values():
            TypeExtraField.objects.filter(id__in=field_ids).update(sort_order=sort_order)

        # 4. 原字段在哪些流转上必填，「解决方案」也在那些流转上必填
        WorkflowTransitionRequiredField.objects.bulk_create(
            WorkflowTransitionRequiredField(
                workflow_id=row.workflow_id, extra_field_id=new_field_by_old_id[row.extra_field_id].id
            )
            for row in required_rows
        )
