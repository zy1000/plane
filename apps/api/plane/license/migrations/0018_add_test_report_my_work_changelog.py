from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "测试报告与我的工作页面"
CHANGELOG_VERSION = "1.11.0"


def create_test_report_my_work_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
<h3>测试报告与我的工作页面</h3>
<p>本次更新补齐测试管理中的报告发布能力，并优化个人工作入口。测试团队可以基于测试计划生成报告、查看执行质量数据并导出交付文档，成员也可以在我的工作页面集中处理与自己相关的工作项。</p>

<h3>新功能 · 测试报告</h3>
<ul>
  <li>测试管理新增「测试报告」入口，支持按项目维护报告列表。</li>
  <li>支持新建、编辑和删除测试报告，并可关联一个或多个测试计划。</li>
  <li>报告列表展示报告类型、关联计划、用例数量、通过率、完成率、创建人和创建时间。</li>
  <li>支持按报告名称搜索，快速定位目标测试报告。</li>
  <li>报告详情页新增执行分析卡片和结果分布图，汇总成功、失败、阻塞、无效、未执行等结果。</li>
  <li>报告详情支持查看关联用例明细，包括优先级、执行结果、模块、执行人、缺陷数量和所属计划。</li>
  <li>支持编辑报告总结内容，并将测试报告导出为 PDF，便于评审、归档和对外交付。</li>
</ul>

<h3>新功能 · 我的工作页面</h3>
<ul>
  <li>新增我的工作聚合入口，集中展示与当前成员相关的工作项。</li>
  <li>支持按分配给我、我创建的、我关注的和逾期工作项切换视图。</li>
  <li>复用工作项列表的筛选、排序和布局能力，方便在个人维度快速跟进任务。</li>
  <li>支持从工作项详情返回我的工作视图，减少跨项目查找和切换成本。</li>
</ul>

<h3>体验优化</h3>
<ul>
  <li>测试报告列表增加分页和关键字段展示，便于管理大量报告。</li>
  <li>报告通过率使用分段进度条展示不同执行结果占比，异常结果更容易识别。</li>
  <li>报告详情保留报告名称与上下文信息，导出文件命名更贴近实际报告。</li>
  <li>我的工作页面统一个人工作项入口，帮助成员优先处理待办、逾期和关注事项。</li>
</ul>

<h3>适合哪些场景</h3>
<ul>
  <li>需要定期沉淀测试执行结果、输出测试报告的质量团队。</li>
  <li>需要将测试计划执行情况汇总为评审材料或交付文档的项目。</li>
  <li>成员同时参与多个项目，需要在个人视角集中查看待处理工作项的协作场景。</li>
</ul>
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "新增测试报告列表、详情分析、用例明细、PDF 导出，并优化我的工作聚合入口。",
            "description": content,
            "content": content,
            "update_type": "added",
            "tags": ["测试报告", "测试管理", "我的工作", "工作项", "PDF 导出"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 6, 29, 0, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_test_report_my_work_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0017_add_file_version_management_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_test_report_my_work_changelog,
            delete_test_report_my_work_changelog,
        ),
    ]
