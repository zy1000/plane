from django.db import migrations


PERMISSION_ROWS = """
workspace.settings.view|查看工作区信息、基础配置|workspace|settings|view|设置|1|1
workspace.settings.edit|修改工作区名称、时区、基础设置|workspace|settings|edit|设置|2|1
workspace.settings.delete|删除工作区|workspace|settings|delete|设置|3|1
workspace.member.view|查看工作区成员列表与成员详情|workspace|member|view|成员|1|1
workspace.member.invite|邀请工作区成员|workspace|member|invite|成员|2|1
workspace.member.edit|修改工作区成员角色与信息|workspace|member|edit|成员|3|1
workspace.member.remove|移除工作区成员|workspace|member|remove|成员|4|1
workspace.role.view|查看工作区角色模板列表与详情|workspace|role|view|角色模板|1|1
workspace.role.create|创建工作区角色模板|workspace|role|create|角色模板|2|1
workspace.role.edit|编辑工作区角色模板|workspace|role|edit|角色模板|3|1
workspace.role.delete|删除工作区角色模板|workspace|role|delete|角色模板|4|1
workspace.role.assign_group|为工作区组绑定默认角色模板|workspace|role|assign_group|角色模板|5|1
workspace.role.import_to_project|将工作区角色模板导入项目角色|workspace|role|import_to_project|角色模板|6|1
workspace.group.view|查看工作区用户组列表与详情|workspace|group|view|用户组|1|1
workspace.group.create|创建工作区用户组|workspace|group|create|用户组|2|1
workspace.group.edit|编辑工作区用户组名称/描述|workspace|group|edit|用户组|3|1
workspace.group.delete|删除工作区用户组|workspace|group|delete|用户组|4|1
workspace.group.manage_member|管理工作区组成员|workspace|group|manage_member|用户组|5|1
workspace.group.manage_role|管理工作区组默认角色模板|workspace|group|manage_role|用户组|6|1
workspace.project.view|查看工作区内项目列表/概览|workspace|project|view|项目管理|1|1
workspace.project.create|创建项目|workspace|project|create|项目管理|2|1
workspace.user_profile.view|查看成员画像页|workspace|user_profile|view|用户资料与画像|1|1
workspace.user_profile.export|导出成员画像相关数据|workspace|user_profile|export|用户资料与画像|2|1
workspace.analytics.view|查看工作区分析看板|workspace|analytics|view|分析|1|1
workspace.analytics.manage_saved_view|管理分析视图定义|workspace|analytics|manage_saved_view|分析|2|1
workspace.analytics.export|导出分析数据|workspace|analytics|export|分析|3|1
project.settings.view|查看项目设置|project|project.settings|view|项目设置|1|1
project.settings.edit|编辑项目设置|project|project.settings|edit|项目设置|2|1
project.archive|归档项目|project|project|archive|项目设置|3|1
project.unarchive|恢复项目|project|project|unarchive|项目设置|4|1
project.delete|删除项目|project|project|delete|项目设置|5|1
project.member.view|查看项目成员列表、角色、继承来源|project|project.member|view|项目成员|1|1
project.member.invite|邀请项目成员|project|project.member|invite|项目成员|2|1
project.member.remove|移除项目成员|project|project.member|remove|项目成员|4|1
project.member.leave|主动退出项目|project|project.member|leave|项目成员|5|1
project.member.bind_role|给成员直接绑定/移除项目角色|project|project.member|bind_role|项目成员|6|1
project.role.view|查看项目角色列表与详情|project|project.role|view|项目角色|1|1
project.role.create|创建项目角色|project|project.role|create|项目角色|2|1
project.role.edit|编辑项目角色及权限|project|project.role|edit|项目角色|3|1
project.role.delete|删除项目角色|project|project.role|delete|项目角色|4|1
project.group_grant.view|查看项目中各工作区组的授权情况|project|project.group_grant|view|工作区组在项目中的授权|1|0
project.group_grant.create|给工作区组授予项目角色|project|project.group_grant|create|工作区组在项目中的授权|2|0
project.group_grant.edit|修改组的项目授权|project|project.group_grant|edit|工作区组在项目中的授权|3|0
project.group_grant.delete|删除组的项目授权|project|project.group_grant|delete|工作区组在项目中的授权|4|0
project.publish.view|查看项目发布配置与公开链接|project|project.publish|view|项目发布|1|1
project.publish.create|发布项目|project|project.publish|create|项目发布|2|1
project.publish.edit|编辑项目发布配置|project|project.publish|edit|项目发布|3|1
project.publish.delete|取消发布项目|project|project.publish|delete|项目发布|4|1
project.announcement.edit|发布/编辑/删除项目公告|project|project.announcement|edit|项目公告|2|1
issue.defect.create|创建缺陷类型工作项|project|issue.defect|create|缺陷工作项|1|1
issue.defect.edit|编辑缺陷类型工作项|project|issue.defect|edit|缺陷工作项|2|1
issue.defect.delete|删除缺陷类型工作项|project|issue.defect|delete|缺陷工作项|3|1
issue.defect.archive|归档缺陷类型工作项|project|issue.defect|archive|缺陷工作项|4|1
issue.defect.unarchive|恢复缺陷类型工作项|project|issue.defect|unarchive|缺陷工作项|5|1
issue.requirement.create|创建需求类型工作项|project|issue.requirement|create|需求工作项|1|1
issue.requirement.edit|编辑需求类型工作项|project|issue.requirement|edit|需求工作项|2|1
issue.requirement.delete|删除需求类型工作项|project|issue.requirement|delete|需求工作项|3|1
issue.requirement.archive|归档需求类型工作项|project|issue.requirement|archive|需求工作项|4|1
issue.requirement.unarchive|恢复需求类型工作项|project|issue.requirement|unarchive|需求工作项|5|1
issue.task.create|创建任务类型工作项|project|issue.task|create|任务工作项|1|1
issue.task.edit|编辑任务类型工作项|project|issue.task|edit|任务工作项|2|1
issue.task.delete|删除任务类型工作项|project|issue.task|delete|任务工作项|3|1
issue.task.archive|归档任务类型工作项|project|issue.task|archive|任务工作项|4|1
issue.task.unarchive|恢复任务类型工作项|project|issue.task|unarchive|任务工作项|5|1
issue.comment.create|创建评论|project|issue.comment|create|工作项评论|1|1
issue.comment.edit|编辑评论|project|issue.comment|edit|工作项评论|2|1
issue.comment.delete|删除评论|project|issue.comment|delete|工作项评论|3|1
issue.link.manage|新增、编辑、删除外部链接|project|issue.link|manage|工作项外部链接|2|1
issue.relation.manage|新增、删除事项关联|project|issue.relation|manage|工作项关联|2|1
issue.attachment.download|下载附件|project|issue.attachment|view|工作项附件|1|1
issue.attachment.upload|上传附件|project|issue.attachment|upload|工作项附件|2|1
issue.attachment.delete|删除附件|project|issue.attachment|delete|工作项附件|3|1
sprints.view|查看迭代列表与详情|project|sprints|view|迭代|1|1
sprints.create|创建迭代|project|sprints|create|迭代|2|1
sprints.edit|编辑迭代|project|sprints|edit|迭代|3|1
sprints.delete|删除迭代|project|sprints|delete|迭代|4|1
sprints.archive|归档/恢复迭代|project|sprints|archive|迭代|5|1
sprints.issue.manage|添加、调整、迁移、移除迭代工作项|project|sprints.issue|manage|迭代|6|1
sprints.file.upload|迭代文件上传|project|sprints.file|upload|迭代|7|1
sprints.file.delete|迭代文件删除|project|sprints.file|delete|迭代|8|1
sprints.file.download|迭代文件下载|project|sprints.file|download|迭代|9|1
releases.view|查看发布|project|releases|view|发布|1|1
releases.create|创建发布|project|releases|create|发布|2|1
releases.edit|编辑发布|project|releases|edit|发布|3|1
releases.delete|删除发布|project|releases|delete|发布|4|1
releases.issue.manage|添加、调整、移除发布工作项|project|releases.issue|manage|发布|5|1
releases.file.upload|发布文件上传|project|releases.file|upload|发布|6|1
releases.file.delete|发布文件删除|project|releases.file|delete|发布|7|1
releases.file.download|发布文件下载|project|releases.file|download|发布|8|1
releases.archive|归档/恢复发布|project|releases|archive|发布|9|1
releases.comment.create|创建发布评论|project|releases.comment|create|发布|10|1
view.view|查看视图列表与详情|project|view|view|视图|1|1
view.create|创建视图|project|view|create|视图|2|1
view.edit|编辑视图|project|view|edit|视图|3|1
view.delete|删除视图|project|view|delete|视图|4|1
state.view|查看状态列表|project|state|view|项目状态|1|1
state.create|创建状态|project|state|create|项目状态|2|1
state.edit|编辑状态|project|state|edit|项目状态|3|1
state.delete|删除状态|project|state|delete|项目状态|4|1
state.mark_default|设为默认状态|project|state|mark_default|项目状态|5|1
label.view|查看标签列表|project|label|view|项目标签|1|1
label.create|创建标签|project|label|create|项目标签|2|1
label.edit|编辑标签|project|label|edit|项目标签|3|1
label.delete|删除标签|project|label|delete|项目标签|4|1
estimate.view|查看估算|project|estimate|view|项目估算|1|1
estimate.create|创建估算点|project|estimate|create|项目估算|2|1
estimate.edit|编辑估算点|project|estimate|edit|项目估算|3|1
estimate.delete|删除估算点|project|estimate|delete|项目估算|4|1
milestone.view|查看里程碑列表与详情|project|milestone|view|项目里程碑|1|1
milestone.create|创建里程碑|project|milestone|create|项目里程碑|2|1
milestone.edit|编辑里程碑|project|milestone|edit|项目里程碑|3|1
milestone.delete|删除里程碑|project|milestone|delete|项目里程碑|4|1
milestone.issue.view|查看里程碑关联工作项|project|milestone.issue|view|项目里程碑|5|1
milestone.issue.add|关联工作项到里程碑|project|milestone.issue|add|项目里程碑|6|1
milestone.issue.remove|从里程碑移除工作项|project|milestone.issue|remove|项目里程碑|7|1
intake.view|查看需求收集列表与详情|project|intake|view|需求收集|1|0
intake.create|创建需求收集|project|intake|create|需求收集|2|0
intake.edit|编辑需求收集|project|intake|edit|需求收集|3|0
intake.delete|删除需求收集|project|intake|delete|需求收集|4|0
intake.issue.view|查看需求收集工作项|project|intake.issue|view|需求收集|5|0
intake.issue.create|创建需求收集工作项|project|intake.issue|create|需求收集|6|0
intake.issue.edit|编辑需求收集工作项|project|intake.issue|edit|需求收集|7|0
intake.issue.delete|删除需求收集工作项|project|intake.issue|delete|需求收集|8|0
intake.description_version.view|查看需求收集描述版本|project|intake.description_version|view|需求收集|9|0
workflow.view|查看工作流列表与详情|project|workflow|view|工作流|1|1
workflow.create|创建工作流|project|workflow|create|工作流|2|1
workflow.edit|编辑工作流|project|workflow|edit|工作流|3|1
workflow.delete|删除工作流|project|workflow|delete|工作流|4|1
workflow.config|配置工作流|project|workflow|config|工作流|5|1
project.analytics.view|查看项目统计|project|project.analytics|view|项目分析|1|1
project.asset.view|查看项目资产|project|project.asset|view|项目资产|1|1
project.asset.upload|上传项目资产|project|project.asset|upload|项目资产|2|1
project.asset.delete|删除项目资产|project|project.asset|delete|项目资产|4|1
project.asset.download|下载项目资产|project|project.asset|download|项目资产|5|1
qa.case.view|查看测试用例|project|qa.case|view|测试管理|1|1
qa.case.create|创建测试用例|project|qa.case|create|测试管理|2|1
qa.case.edit|编辑测试用例|project|qa.case|edit|测试管理|3|1
qa.case.delete|删除测试用例|project|qa.case|delete|测试管理|4|1
qa.case.import_export|导入/导出测试用例|project|qa.case|import_export|测试管理|5|1
qa.plan.view|查看测试计划|project|qa.plan|view|测试管理|6|1
qa.plan.create|创建测试计划|project|qa.plan|create|测试管理|7|1
qa.plan.edit|编辑测试计划|project|qa.plan|edit|测试管理|8|1
qa.plan.delete|删除测试计划|project|qa.plan|delete|测试管理|9|1
qa.review.view|查看测试评审|project|qa.review|view|测试管理|11|1
qa.review.create|创建测试评审|project|qa.review|create|测试管理|12|1
qa.review.edit|编辑测试评审|project|qa.review|edit|测试管理|13|1
qa.review.delete|删除测试评审|project|qa.review|delete|测试管理|14|1
qa.mindmap.view|查看用例脑图|project|qa.mindmap|view|测试管理|17|1
qa.mindmap.edit|编辑用例脑图|project|qa.mindmap|edit|测试管理|18|1
""".strip().splitlines()


def parse_permission_rows():
    permissions = []
    for row in PERMISSION_ROWS:
        key, name, scope, module, action, category, sort_order, is_active_str = row.split(
            "|"
        )
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
                "is_active": is_active_str.strip() == "1",
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
