from django.db import migrations


PERMISSION_ROWS = """
workspace.settings.view|查看工作区信息、基础配置|workspace|settings|view|工作区设置|1
workspace.settings.edit|修改工作区名称、时区、基础设置|workspace|settings|edit|工作区设置|2
workspace.settings.delete|删除工作区|workspace|settings|delete|工作区设置|3
workspace.member.view|查看工作区成员列表与成员详情|workspace|member|view|工作区成员|1
workspace.member.invite|邀请工作区成员|workspace|member|invite|工作区成员|2
workspace.member.edit|修改工作区成员角色与信息|workspace|member|edit|工作区成员|3
workspace.member.remove|移除工作区成员|workspace|member|remove|工作区成员|4
workspace.role.view|查看工作区角色模板列表与详情|workspace|role|view|工作区角色模板|1
workspace.role.create|创建工作区角色模板|workspace|role|create|工作区角色模板|2
workspace.role.edit|编辑工作区角色模板|workspace|role|edit|工作区角色模板|3
workspace.role.delete|删除工作区角色模板|workspace|role|delete|工作区角色模板|4
workspace.role.assign_group|为工作区组绑定默认角色模板|workspace|role|assign_group|工作区角色模板|5
workspace.role.import_to_project|将工作区角色模板导入项目角色|workspace|role|import_to_project|工作区角色模板|6
workspace.group.view|查看工作区用户组列表与详情|workspace|group|view|工作区用户组|1
workspace.group.create|创建工作区用户组|workspace|group|create|工作区用户组|2
workspace.group.edit|编辑工作区用户组名称/描述|workspace|group|edit|工作区用户组|3
workspace.group.delete|删除工作区用户组|workspace|group|delete|工作区用户组|4
workspace.group.manage_member|管理工作区组成员|workspace|group|manage_member|工作区用户组|5
workspace.group.manage_role|管理工作区组默认角色模板|workspace|group|manage_role|工作区用户组|6
workspace.project.view|查看工作区内项目列表/概览|workspace|project|view|工作区项目管理|1
workspace.project.create|创建项目|workspace|project|create|工作区项目管理|2
workspace.user_profile.view|查看成员画像页|workspace|user_profile|view|工作区用户资料与画像|1
workspace.user_profile.export|导出成员画像相关数据|workspace|user_profile|export|工作区用户资料与画像|2
workspace.analytics.view|查看工作区分析看板|workspace|analytics|view|工作区分析|1
workspace.analytics.manage_saved_view|管理分析视图定义|workspace|analytics|manage_saved_view|工作区分析|2
workspace.analytics.export|导出分析数据|workspace|analytics|export|工作区分析|3
project.settings.view|查看项目详情、设置、基础统计|project|project.settings|view|项目设置|1
project.settings.edit|编辑项目设置|project|project.settings|edit|项目设置|2
project.archive|归档项目|project|project|archive|项目设置|3
project.unarchive|恢复项目|project|project|unarchive|项目设置|4
project.delete|删除项目|project|project|delete|项目设置|5
project.member.view|查看项目成员列表、角色、继承来源|project|project.member|view|项目成员|1
project.member.invite|邀请项目成员|project|project.member|invite|项目成员|2
project.member.edit|修改项目成员属性|project|project.member|edit|项目成员|3
project.member.remove|移除项目成员|project|project.member|remove|项目成员|4
project.member.leave|主动退出项目|project|project.member|leave|项目成员|5
project.member.bind_role|给成员直接绑定/移除项目角色|project|project.member|bind_role|项目成员|6
project.role.view|查看项目角色列表与详情|project|project.role|view|项目角色|1
project.role.create|创建项目角色|project|project.role|create|项目角色|2
project.role.edit|编辑项目角色|project|project.role|edit|项目角色|3
project.role.delete|删除项目角色|project|project.role|delete|项目角色|4
project.group_grant.view|查看项目中各工作区组的授权情况|project|project.group_grant|view|工作区组在项目中的授权|1
project.group_grant.create|给工作区组授予项目角色|project|project.group_grant|create|工作区组在项目中的授权|2
project.group_grant.edit|修改组的项目授权|project|project.group_grant|edit|工作区组在项目中的授权|3
project.group_grant.delete|删除组的项目授权|project|project.group_grant|delete|工作区组在项目中的授权|4
project.publish.view|查看项目发布配置与公开链接|project|project.publish|view|项目发布与公告|1
project.publish.create|发布项目|project|project.publish|create|项目发布与公告|2
project.publish.edit|编辑项目发布配置|project|project.publish|edit|项目发布与公告|3
project.publish.delete|取消发布项目|project|project.publish|delete|项目发布与公告|4
project.announcement.view|查看项目公告|project|project.announcement|view|项目发布与公告|5
project.announcement.edit|发布/编辑/删除项目公告|project|project.announcement|edit|项目发布与公告|6
issue.create|创建工作项|project|issue|create|工作项主体|1
issue.edit|编辑工作项|project|issue|edit|工作项主体|2
issue.delete|删除工作项|project|issue|delete|工作项主体|3
issue.archive|归档工作项|project|issue|archive|工作项主体|4
issue.unarchive|恢复工作项|project|issue|unarchive|工作项主体|5
issue.defect.create|创建缺陷类型工作项|project|issue.defect|create|缺陷工作项|1
issue.defect.edit|编辑缺陷类型工作项|project|issue.defect|edit|缺陷工作项|2
issue.defect.delete|删除缺陷类型工作项|project|issue.defect|delete|缺陷工作项|3
issue.comment.create|创建评论|project|issue.comment|create|工作项评论与互动|1
issue.comment.edit|编辑评论|project|issue.comment|edit|工作项评论与互动|2
issue.comment.delete|删除评论|project|issue.comment|delete|工作项评论与互动|3
issue.link.view|查看外部链接|project|issue.link|view|工作项关系与附件|1
issue.link.manage|新增、编辑、删除外部链接|project|issue.link|manage|工作项关系与附件|2
issue.relation.view|查看事项关联|project|issue.relation|view|工作项关系与附件|3
issue.relation.manage|新增、删除事项关联|project|issue.relation|manage|工作项关系与附件|4
issue.attachment.view|查看附件|project|issue.attachment|view|工作项关系与附件|5
issue.attachment.upload|上传附件|project|issue.attachment|upload|工作项关系与附件|6
issue.attachment.delete|删除附件|project|issue.attachment|delete|工作项关系与附件|7
issue.label.manage|绑定/解绑标签|project|issue.label|manage|工作项关系与附件|8
sprints.view|查看冲刺列表与详情|project|sprints|view|冲刺|1
sprints.create|创建冲刺|project|sprints|create|冲刺|2
sprints.edit|编辑冲刺及其基础配置|project|sprints|edit|冲刺|3
sprints.delete|删除冲刺|project|sprints|delete|冲刺|4
sprints.archive|归档/恢复冲刺|project|sprints|archive|冲刺|5
sprints.issue.manage|添加、调整、迁移、移除冲刺工作项|project|sprints.issue|manage|冲刺|6
releases.view|查看发布列表与详情|project|releases|view|发布|1
releases.create|创建发布|project|releases|create|发布|2
releases.edit|编辑发布及其基础内容|project|releases|edit|发布|3
releases.delete|删除发布|project|releases|delete|发布|4
releases.issue.manage|添加、调整、移除发布工作项|project|releases.issue|manage|发布|5
releases.sprints.manage|关联或取消关联发布与冲刺|project|releases.sprints|manage|发布|6
page.view|查看页面列表与详情|project|page|view|页面|1
page.create|创建页面|project|page|create|页面|2
page.edit|编辑页面|project|page|edit|页面|3
page.delete|删除页面|project|page|delete|页面|4
page.archive|归档/恢复页面|project|page|archive|页面|5
page.lock|锁定/解锁页面|project|page|lock|页面|6
page.access.manage|修改页面公开/私有访问设置|project|page.access|manage|页面|7
page.version.view|查看页面历史版本|project|page.version|view|页面|8
view.view|查看视图列表与详情|project|view|view|视图/筛选|1
view.create|创建视图|project|view|create|视图/筛选|2
view.edit|编辑视图|project|view|edit|视图/筛选|3
view.delete|删除视图|project|view|delete|视图/筛选|4
state.view|查看状态列表|project|state|view|状态、标签、估算、里程碑|1
state.create|创建状态|project|state|create|状态、标签、估算、里程碑|2
state.edit|编辑状态|project|state|edit|状态、标签、估算、里程碑|3
state.delete|删除状态|project|state|delete|状态、标签、估算、里程碑|4
state.mark_default|设为默认状态|project|state|mark_default|状态、标签、估算、里程碑|5
label.view|查看标签列表|project|label|view|状态、标签、估算、里程碑|6
label.create|创建标签|project|label|create|状态、标签、估算、里程碑|7
label.edit|编辑标签|project|label|edit|状态、标签、估算、里程碑|8
label.delete|删除标签|project|label|delete|状态、标签、估算、里程碑|9
estimate.view|查看估算|project|estimate|view|状态、标签、估算、里程碑|10
estimate.create|创建估算点|project|estimate|create|状态、标签、估算、里程碑|11
estimate.edit|编辑估算点|project|estimate|edit|状态、标签、估算、里程碑|12
estimate.delete|删除估算点|project|estimate|delete|状态、标签、估算、里程碑|13
milestone.view|查看里程碑列表与详情|project|milestone|view|状态、标签、估算、里程碑|14
milestone.create|创建里程碑|project|milestone|create|状态、标签、估算、里程碑|15
milestone.edit|编辑里程碑|project|milestone|edit|状态、标签、估算、里程碑|16
milestone.delete|删除里程碑|project|milestone|delete|状态、标签、估算、里程碑|17
milestone.issue.view|查看里程碑关联工作项|project|milestone.issue|view|状态、标签、估算、里程碑|18
milestone.issue.add|关联工作项到里程碑|project|milestone.issue|add|状态、标签、估算、里程碑|19
milestone.issue.remove|从里程碑移除工作项|project|milestone.issue|remove|状态、标签、估算、里程碑|20
intake.view|查看 Intake 列表与详情|project|intake|view|Intake|1
intake.create|创建 Intake|project|intake|create|Intake|2
intake.edit|编辑 Intake|project|intake|edit|Intake|3
intake.delete|删除 Intake|project|intake|delete|Intake|4
intake.issue.view|查看 Intake 工作项|project|intake.issue|view|Intake|5
intake.issue.create|创建 Intake 工作项|project|intake.issue|create|Intake|6
intake.issue.edit|编辑 Intake 工作项|project|intake.issue|edit|Intake|7
intake.issue.delete|删除 Intake 工作项|project|intake.issue|delete|Intake|8
intake.description_version.view|查看 Intake 描述版本|project|intake.description_version|view|Intake|9
workflow.view|查看工作流列表与详情|project|workflow|view|Workflow / 审批|1
workflow.create|创建工作流|project|workflow|create|Workflow / 审批|2
workflow.edit|编辑工作流|project|workflow|edit|Workflow / 审批|3
workflow.delete|删除工作流|project|workflow|delete|Workflow / 审批|4
workflow.transition.view|查看流转定义|project|workflow.transition|view|Workflow / 审批|5
workflow.transition.create|创建流转|project|workflow.transition|create|Workflow / 审批|6
workflow.transition.edit|编辑流转|project|workflow.transition|edit|Workflow / 审批|7
workflow.transition.delete|删除流转|project|workflow.transition|delete|Workflow / 审批|8
workflow.approval.view|查看我的审批/审批记录|project|workflow.approval|view|Workflow / 审批|9
workflow.approval.action|审批通过、拒绝、处理审批动作|project|workflow.approval|action|Workflow / 审批|10
workflow.transition_record.view|查看工作项流转记录|project|workflow.transition_record|view|Workflow / 审批|11
project.analytics.view|查看项目统计|project|project.analytics|view|Analytics / Search / Asset / Filestore|1
project.analytics.advanced_view|查看项目高级分析|project|project.analytics|advanced_view|Analytics / Search / Asset / Filestore|2
search.issue.view|搜索项目工作项|project|search.issue|view|Analytics / Search / Asset / Filestore|3
project.asset.view|查看项目资产|project|project.asset|view|Analytics / Search / Asset / Filestore|4
project.asset.upload|上传项目资产|project|project.asset|upload|Analytics / Search / Asset / Filestore|5
project.asset.edit|编辑项目资产|project|project.asset|edit|Analytics / Search / Asset / Filestore|6
project.asset.delete|删除项目资产|project|project.asset|delete|Analytics / Search / Asset / Filestore|7
project.asset.download|下载项目资产|project|project.asset|download|Analytics / Search / Asset / Filestore|8
filestore.view|查看项目文件库|project|filestore|view|Analytics / Search / Asset / Filestore|9
filestore.upload|上传文件库文件|project|filestore|upload|Analytics / Search / Asset / Filestore|10
filestore.edit|编辑文件库文件|project|filestore|edit|Analytics / Search / Asset / Filestore|11
filestore.delete|删除文件库文件|project|filestore|delete|Analytics / Search / Asset / Filestore|12
filestore.download|下载文件库文件|project|filestore|download|Analytics / Search / Asset / Filestore|13
filestore.restore_version|恢复历史版本|project|filestore|restore_version|Analytics / Search / Asset / Filestore|14
qa.case.view|查看测试用例|project|qa.case|view|QA|1
qa.case.create|创建测试用例|project|qa.case|create|QA|2
qa.case.edit|编辑测试用例|project|qa.case|edit|QA|3
qa.case.delete|删除测试用例|project|qa.case|delete|QA|4
qa.case.import_export|导入/导出测试用例|project|qa.case|import_export|QA|5
qa.plan.view|查看测试计划|project|qa.plan|view|QA|6
qa.plan.create|创建测试计划|project|qa.plan|create|QA|7
qa.plan.edit|编辑测试计划|project|qa.plan|edit|QA|8
qa.plan.delete|删除测试计划|project|qa.plan|delete|QA|9
qa.plan.execute|执行测试计划|project|qa.plan|execute|QA|10
qa.review.view|查看测试评审|project|qa.review|view|QA|11
qa.review.create|创建测试评审|project|qa.review|create|QA|12
qa.review.edit|编辑测试评审|project|qa.review|edit|QA|13
qa.review.delete|删除测试评审|project|qa.review|delete|QA|14
qa.review.review|执行评审|project|qa.review|review|QA|15
qa.review.confirm|确认评审结果|project|qa.review|confirm|QA|16
qa.mindmap.view|查看 QA 脑图|project|qa.mindmap|view|QA|17
qa.mindmap.edit|编辑 QA 脑图|project|qa.mindmap|edit|QA|18
qa.mindmap.asset_upload|上传 QA 脑图相关资产|project|qa.mindmap|asset_upload|QA|19
""".strip().splitlines()


def parse_permission_rows():
    permissions = []
    for row in PERMISSION_ROWS:
        key, name, scope, module, action, category, sort_order = row.split("|")
        permissions.append(
            {
                "key": key,
                "name": name,
                "description": name,
                "scope": scope,
                "module": module,
                "action": action,
                "category": category,
                "sort_order": int(sort_order),
                "is_active": True,
            }
        )
    return permissions


def seed_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")

    for permission in parse_permission_rows():
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["description"],
                "scope": permission["scope"],
                "module": permission["module"],
                "action": permission["action"],
                "category": permission["category"],
                "sort_order": permission["sort_order"],
                "is_active": permission["is_active"],
            },
        )


def unseed_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    Permission.objects.filter(
        key__in=[permission["key"] for permission in parse_permission_rows()]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0204_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
