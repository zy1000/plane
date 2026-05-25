from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "工作项导入 & Xmind 预览"
CHANGELOG_VERSION = "1.7.0"


def create_issue_import_xmind_preview_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
<h3>工作项 Excel 导入全面升级</h3>
<p>本次更新重构了工作项批量导入流程，支持下载标准模板、自定义字段映射、逐行校验与勾选导入，让大批量工作项录入更高效、更可控。</p>

<h3>工作项导入 · 新功能</h3>
<ul>
  <li>在工作项列表页新增「导入」入口，支持通过 Excel 批量创建工作项。</li>
  <li>提供标准导入模板下载，模板列名可与实际文件不同，上传后自动推荐字段映射。</li>
  <li>导入流程分为两步：先上传文件并完成字段映射，再查看校验结果并勾选需要导入的行。</li>
  <li>支持标题、类型、描述、优先级、负责人、标签、模块、迭代、发布、开始日期、截止日期、父工作项等字段。</li>
  <li>需求项支持多列映射，导入后自动合并为 HTML 表格写入工作项描述。</li>
  <li>导入前逐行校验数据合法性，区分通过与不通过行，仅导入勾选的合法数据。</li>
</ul>

<h3>Xmind 文件预览 · 新功能</h3>
<ul>
  <li>项目文件页新增 Xmind 文件预览，点击 .xmind 文件即可在弹窗中查看思维导图。</li>
  <li>支持在新标签页独立打开预览，便于大屏浏览与分享。</li>
  <li>支持节点搜索与关键词高亮，快速定位目标内容。</li>
  <li>支持展开深度控制，平衡预览完整度与加载性能。</li>
</ul>

<h3>体验优化</h3>
<ul>
  <li>Xmind 预览窗口支持缩放自适应，拖拽与调整大小时响应更流畅。</li>
  <li>优化可视区域外节点的渲染策略，降低大图谱预览时的性能开销。</li>
  <li>精简导入模板字段，移除旧版「估点」列，降低模板理解成本。</li>
</ul>

<h3>破坏性变更</h3>
<ul>
  <li>旧版 <code>issue-import</code> 同步导入接口已下线，请使用新的分步导入流程。</li>
</ul>

<h3>适合哪些场景</h3>
<ul>
  <li>需要从 Excel 或外部系统批量迁移、录入工作项的项目团队。</li>
  <li>项目资料中包含 Xmind 思维导图，希望在系统内直接预览而无需下载打开。</li>
  <li>需要在导入前校验数据、按需勾选部分行导入的管理场景。</li>
</ul>
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "工作项 Excel 导入全面升级，文件页新增 Xmind 预览与搜索高亮",
            "description": content,
            "content": content,
            "update_type": "added",
            "tags": ["工作项", "导入", "文件", "Xmind", "预览"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(2026, 5, 25, 2, 0, tzinfo=dt_timezone.utc),
            "is_pinned": False,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_issue_import_xmind_preview_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("license", "0013_add_filestore_page_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_issue_import_xmind_preview_changelog,
            delete_issue_import_xmind_preview_changelog,
        ),
    ]
