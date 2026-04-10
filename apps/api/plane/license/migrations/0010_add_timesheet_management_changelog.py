from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "工时管理功能上线"
CHANGELOG_VERSION = "1.3.0"


def create_timesheet_management_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "支持按项目与工作区记录、查看与管理工时，可与工作项或测试用例关联，并提供复制上一周与概览统计等能力。",
            "description": "你可以在时间线或表格中填报工时，将时间投入挂到具体项目、工作项或测试用例，并查看个人与项目的工时分布与缺失提醒。",
            "content": """
<h3>工时管理已上线</h3>
<p>本次更新为团队协作引入了结构化的工时记录能力：成员可以按日期与时间段登记实际投入，系统会校验时间段与重复规则，帮助团队更准确地统计人力投入与项目成本。</p>

<h3>核心能力</h3>
<ul>
  <li><strong>多层级挂靠</strong>：工时必须归属项目；可选择仅记「项目工时」，或进一步关联到工作项、测试用例（二者最多选其一）。</li>
  <li><strong>项目与全局视图</strong>：在项目内按周查看与编辑；在工作区维度可跨项目汇总查看工时记录。</li>
  <li><strong>复制上一周</strong>：一键将上一周已填工时复制到当前周对应星期，冲突记录会自动跳过并提示。</li>
  <li><strong>工时概览</strong>：按个人或项目维度查看总工时、日均、项目分布等，并支持缺失填报提醒。</li>
  <li><strong>工作项侧快捷登记</strong>：在工作项详情中可直接填写工时，与项目级时间线保持一致规则。</li>
  <li><strong>项目预估工时</strong>：项目支持设置总预估工时（默认 100h，且须为 0.5 小时步进），便于与实耗对比。</li>
</ul>

<h3>填报与校验说明</h3>
<ul>
  <li>每条记录包含日期、起止时间、花费小时数与可选描述；花费小时数须为正数且不超过起止时间跨度。</li>
  <li>同一成员同一天内不允许存在时间重叠的工时记录；同一成员在同一项目/工作项/用例的同一时间段亦受唯一性约束，避免重复登记。</li>
  <li>可填报日期范围受策略限制（例如仅允许本月及上月），避免历史数据被随意修改。</li>
</ul>

<h3>带来的收益</h3>
<ul>
  <li>将「谁在什么上花了多少时间」与项目、需求、测试资产打通，便于复盘与排期。</li>
  <li>减少重复填报成本（复制上周、侧栏快速录入）。</li>
  <li>为后续报表、成本与容量规划提供一致的数据基础。</li>
</ul>

<p>若团队已开始使用项目与测试管理，可在「工时管理」入口或项目侧栏中开始使用工时能力。</p>
""".strip(),
            "update_type": "added",
            "tags": ["timesheet", "工时", "project", "worklog"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 4, 10, 0, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_timesheet_management_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0009_add_project_role_permissions_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_timesheet_management_changelog,
            delete_timesheet_management_changelog,
        ),
    ]
