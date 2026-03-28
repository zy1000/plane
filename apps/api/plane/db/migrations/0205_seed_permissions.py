from django.db import migrations


PERMISSION_ROWS = """
workspace.settings.view|查看工作区信息、基础配置|workspace|settings|view|设置|1
workspace.settings.edit|修改工作区名称、时区、基础设置|workspace|settings|edit|设置|2
workspace.settings.delete|删除工作区|workspace|settings|delete|设置|3
workspace.member.view|查看工作区成员列表与成员详情|workspace|member|view|成员|1
workspace.member.invite|邀请工作区成员|workspace|member|invite|成员|2
workspace.member.edit|修改工作区成员角色与信息|workspace|member|edit|成员|3
workspace.member.remove|移除工作区成员|workspace|member|remove|成员|4
workspace.role.view|查看工作区角色模板列表与详情|workspace|role|view|角色模板|1
workspace.role.create|创建工作区角色模板|workspace|role|create|角色模板|2
workspace.role.edit|编辑工作区角色模板|workspace|role|edit|角色模板|3
workspace.role.delete|删除工作区角色模板|workspace|role|delete|角色模板|4
workspace.role.assign_group|为工作区组绑定默认角色模板|workspace|role|assign_group|角色模板|5
workspace.role.import_to_project|将工作区角色模板导入项目角色|workspace|role|import_to_project|角色模板|6
workspace.group.view|查看工作区用户组列表与详情|workspace|group|view|用户组|1
workspace.group.create|创建工作区用户组|workspace|group|create|用户组|2
workspace.group.edit|编辑工作区用户组名称/描述|workspace|group|edit|用户组|3
workspace.group.delete|删除工作区用户组|workspace|group|delete|用户组|4
workspace.group.manage_member|管理工作区组成员|workspace|group|manage_member|用户组|5
workspace.group.manage_role|管理工作区组默认角色模板|workspace|group|manage_role|用户组|6
workspace.project.view|查看工作区内项目列表/概览|workspace|project|view|项目管理|1
workspace.project.create|创建项目|workspace|project|create|项目管理|2
workspace.user_profile.view|查看成员画像页|workspace|user_profile|view|用户资料与画像|1
workspace.user_profile.export|导出成员画像相关数据|workspace|user_profile|export|用户资料与画像|2
workspace.analytics.view|查看工作区分析看板|workspace|analytics|view|分析|1
workspace.analytics.manage_saved_view|管理分析视图定义|workspace|analytics|manage_saved_view|分析|2
workspace.analytics.export|导出分析数据|workspace|analytics|export|分析|3
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
project.publish.view|查看项目发布配置与公开链接|project|project.publish|view|项目发布|1
project.publish.create|发布项目|project|project.publish|create|项目发布|2
project.publish.edit|编辑项目发布配置|project|project.publish|edit|项目发布|3
project.publish.delete|取消发布项目|project|project.publish|delete|项目发布|4
project.announcement.view|查看项目公告|project|project.announcement|view|项目公告|1
project.announcement.edit|发布/编辑/删除项目公告|project|project.announcement|edit|项目公告|2
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
issue.link.manage|新增、编辑、删除外部链接|project|issue.link|manage|工作项外部链接|2
issue.relation.manage|新增、删除事项关联|project|issue.relation|manage|工作项关联|2
issue.attachment.download|下载附件|project|issue.attachment|view|工作项附件|1
issue.attachment.upload|上传附件|project|issue.attachment|upload|工作项附件|2
issue.attachment.delete|删除附件|project|issue.attachment|delete|工作项附件|3
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
view.view|查看视图列表与详情|project|view|view|视图/筛选|1
view.create|创建视图|project|view|create|视图/筛选|2
view.edit|编辑视图|project|view|edit|视图/筛选|3
view.delete|删除视图|project|view|delete|视图/筛选|4
state.view|查看状态列表|project|state|view|项目状态|1
state.create|创建状态|project|state|create|项目状态|2
state.edit|编辑状态|project|state|edit|项目状态|3
state.delete|删除状态|project|state|delete|项目状态|4
state.mark_default|设为默认状态|project|state|mark_default|项目状态|5
label.view|查看标签列表|project|label|view|项目标签|1
label.create|创建标签|project|label|create|项目标签|2
label.edit|编辑标签|project|label|edit|项目标签|3
label.delete|删除标签|project|label|delete|项目标签|4
estimate.view|查看估算|project|estimate|view|项目估算|1
estimate.create|创建估算点|project|estimate|create|项目估算|2
estimate.edit|编辑估算点|project|estimate|edit|项目估算|3
estimate.delete|删除估算点|project|estimate|delete|项目估算|4
milestone.view|查看里程碑列表与详情|project|milestone|view|项目里程碑|1
milestone.create|创建里程碑|project|milestone|create|项目里程碑|2
milestone.edit|编辑里程碑|project|milestone|edit|项目里程碑|3
milestone.delete|删除里程碑|project|milestone|delete|项目里程碑|4
milestone.issue.view|查看里程碑关联工作项|project|milestone.issue|view|项目里程碑|5
milestone.issue.add|关联工作项到里程碑|project|milestone.issue|add|项目里程碑|6
milestone.issue.remove|从里程碑移除工作项|project|milestone.issue|remove|项目里程碑|7
intake.view|查看需求收集列表与详情|project|intake|view|需求收集|1
intake.create|创建需求收集|project|intake|create|需求收集|2
intake.edit|编辑需求收集|project|intake|edit|需求收集|3
intake.delete|删除需求收集|project|intake|delete|需求收集|4
intake.issue.view|查看需求收集工作项|project|intake.issue|view|需求收集|5
intake.issue.create|创建需求收集工作项|project|intake.issue|create|需求收集|6
intake.issue.edit|编辑需求收集工作项|project|intake.issue|edit|需求收集|7
intake.issue.delete|删除需求收集工作项|project|intake.issue|delete|需求收集|8
intake.description_version.view|查看需求收集描述版本|project|intake.description_version|view|需求收集|9
workflow.view|查看工作流列表与详情|project|workflow|view|工作流|1
workflow.create|创建工作流|project|workflow|create|工作流|2
workflow.edit|编辑工作流|project|workflow|edit|工作流|3
workflow.delete|删除工作流|project|workflow|delete|工作流|4
workflow.transition.view|查看流转定义|project|workflow.transition|view|工作流流转|1
workflow.transition.create|创建流转|project|workflow.transition|create|工作流流转|2
workflow.transition.edit|编辑流转|project|workflow.transition|edit|工作流流转|3
workflow.transition.delete|删除流转|project|workflow.transition|delete|工作流流转|4
workflow.approval.view|查看我的审批/审批记录|project|workflow.approval|view|工作流审批|1
workflow.approval.action|审批通过、拒绝、处理审批动作|project|workflow.approval|action|工作流审批|2
workflow.transition_record.view|查看工作项流转记录|project|workflow.transition_record|view|工作流流转记录|1
project.analytics.view|查看项目统计|project|project.analytics|view|项目分析|1
project.analytics.advanced_view|查看项目高级分析|project|project.analytics|advanced_view|项目分析|2
search.issue.view|搜索项目工作项|project|search.issue|view|项目搜索|1
project.asset.view|查看项目资产|project|project.asset|view|项目资产|1
project.asset.upload|上传项目资产|project|project.asset|upload|项目资产|2
project.asset.edit|编辑项目资产|project|project.asset|edit|项目资产|3
project.asset.delete|删除项目资产|project|project.asset|delete|项目资产|4
project.asset.download|下载项目资产|project|project.asset|download|项目资产|5
filestore.view|查看项目文件库|project|filestore|view|项目文件库|1
filestore.upload|上传文件库文件|project|filestore|upload|项目文件库|2
filestore.edit|编辑文件库文件|project|filestore|edit|项目文件库|3
filestore.delete|删除文件库文件|project|filestore|delete|项目文件库|4
filestore.download|下载文件库文件|project|filestore|download|项目文件库|5
filestore.restore_version|恢复历史版本|project|filestore|restore_version|项目文件库|6
qa.case.view|查看测试用例|project|qa.case|view|测试|1
qa.case.create|创建测试用例|project|qa.case|create|测试|2
qa.case.edit|编辑测试用例|project|qa.case|edit|测试|3
qa.case.delete|删除测试用例|project|qa.case|delete|测试|4
qa.case.import_export|导入/导出测试用例|project|qa.case|import_export|测试|5
qa.plan.view|查看测试计划|project|qa.plan|view|测试|6
qa.plan.create|创建测试计划|project|qa.plan|create|测试|7
qa.plan.edit|编辑测试计划|project|qa.plan|edit|测试|8
qa.plan.delete|删除测试计划|project|qa.plan|delete|测试|9
qa.plan.execute|执行测试计划|project|qa.plan|execute|测试|10
qa.review.view|查看测试评审|project|qa.review|view|测试|11
qa.review.create|创建测试评审|project|qa.review|create|测试|12
qa.review.edit|编辑测试评审|project|qa.review|edit|测试|13
qa.review.delete|删除测试评审|project|qa.review|delete|测试|14
qa.review.review|执行评审|project|qa.review|review|测试|15
qa.review.confirm|确认评审结果|project|qa.review|confirm|测试|16
qa.mindmap.view|查看用例脑图|project|qa.mindmap|view|测试|17
qa.mindmap.edit|编辑用例脑图|project|qa.mindmap|edit|测试|18
qa.mindmap.asset_upload|上传用例脑图相关资产|project|qa.mindmap|asset_upload|测试|19
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
