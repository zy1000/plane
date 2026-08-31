from datetime import datetime, timezone as dt_timezone

from django.db import migrations


CHANGELOG_TITLE = "v1.15.0 — 产品需求管理 & 模板管理"
CHANGELOG_VERSION = "1.15.0"


def create_requirement_template_library_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")

    content = """
## 亮点

- **产品需求管理**：自定义字段 + 变更单评审 + 版本基线，需求全程可追溯
- **模板管理**：标准需求库与测试用例库沉淀可复用资产，一键导入项目

## 新功能 · Added
- 新增产品管理，支持成员与角色权限 —— 产品管理
- 需求类型支持自定义字段与可重复表单 —— 设置 → 需求类型
- 需求网格支持批量录入与编辑 —— 产品 → 需求
- 提交评审时自选评审人与通过规则
- 新增待我审批收件箱，集中处理变更单
- 需求支持版本历史与回滚到指定版本
- 新增需求基线快照与基线对比
- 需求支持 Excel 批量导入导出
- 需求可按模块树组织并批量移动
- 需求可关联项目、迭代、发布与工作项
- 需求可关联测试用例以验证覆盖
- 项目内引用产品需求并跟踪交付状态 —— 项目 → 需求
- 个人主页新增「我的需求」视图
- 新增「模板管理」工作区入口 —— 模板管理
- 新建标准需求库并绑定需求类型
- 标准库条目支持表格批量编辑与编号
- 标准库条目支持 Excel 导入导出
- 支持从标准库导入条目到产品需求
- 新增工作区级测试用例模板库
- 模板用例支持模块树、详情页与附件
- 项目用例库支持从模板批量导入用例
- 导入用例时按源模块路径自动建模块

## 优化 · Improved
- 需求搜索支持按编号或标题匹配
- 关联需求弹窗支持跨产品批量全选
- 需求模块侧栏支持折叠与宽度记忆
- 需求详情页新增评审状态与操作条
- 字段配置展示各字段已录入数据量
- 需求类型页迁至工作区设置，旧链接自动跳转
- 统一需求网格表格样式与列宽

## 修复 · Fixed
- 需求字段空值缺少占位显示
- 子表单区列宽导致的表格错位
- 需求表头高度与对齐异常
""".strip()

    ChangeLog.objects.update_or_create(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
        defaults={
            "summary": "上线产品需求管理与模板管理，覆盖字段配置、评审、版本基线与模板复用",
            "description": content,
            "content": content,
            "update_type": "added",
            "tags": ["需求", "产品", "模板管理", "测试用例", "审批"],
            "links": [],
            "screenshots": [],
            "release_date": datetime(
                2026,
                8,
                31,
                0,
                0,
                tzinfo=dt_timezone.utc,
            ),
            "is_pinned": True,
            "is_active": True,
            "is_release_candidate": False,
        },
    )


def delete_requirement_template_library_changelog(apps, schema_editor):
    ChangeLog = apps.get_model("license", "ChangeLog")
    ChangeLog.objects.filter(
        title=CHANGELOG_TITLE,
        version=CHANGELOG_VERSION,
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0020_add_team_role_inheritance_changelog"),
    ]

    operations = [
        migrations.RunPython(
            create_requirement_template_library_changelog,
            delete_requirement_template_library_changelog,
        ),
    ]
