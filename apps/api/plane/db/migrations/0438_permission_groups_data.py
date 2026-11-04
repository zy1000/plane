# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""权限重构数据迁移（docs/permission-refactor/）。

1. 权限字典换成新的 127 个 key（删掉旧 key 与按类型衍生的 key）
2. 项目方案里的类型指回类型库（IssueType.library_type）
3. 权限组 JSON：旧 key → 新 key；按类型衍生的 key → 工作项 / 缺陷模块 key + 类型排除清单
4. 每个工作区建四个系统组（管理员沿用原「管理员」，其余新建，原「成员」保留为普通组）
5. 整数角色 20 的工作区 / 项目成员绑定管理员组
6. 项目里与模板一致的权限组改成引用，有额外 key 的脱离
7. 角色字典（job_role）+ 成员角色回填 + 审批人改按角色 + 产品研发矩阵

本迁移不 import 运行时代码，新 key 表与旧→新映射是当时的副本。回滚请用备份
（/data/backups/plane/plane_20261103_pre_permission_refactor.dump）。
"""

from collections import defaultdict

from django.db import migrations

NEW_PERMISSIONS = (
    ('workspace.settings.edit', 'workspace', '管理', 'workspace.settings', 'edit', '编辑工作区', 1),
    ('workspace.member.view', 'workspace', '管理', 'workspace.member', 'view', '查看成员', 2),
    ('workspace.member.manage', 'workspace', '管理', 'workspace.member', 'manage', '管理成员', 3),
    ('workspace.department.manage', 'workspace', '管理', 'workspace.department', 'manage', '管理部门', 4),
    ('workspace.team.manage', 'workspace', '管理', 'workspace.team', 'manage', '管理团队', 5),
    ('workspace.permission_group.view', 'workspace', '管理', 'workspace.permission_group', 'view', '查看权限组', 6),
    ('workspace.permission_group.manage', 'workspace', '管理', 'workspace.permission_group', 'manage', '管理权限组', 7),
    ('workspace.project.create', 'workspace', '项目与产品', 'workspace.project', 'create', '新建项目', 8),
    ('workspace.project.access_all', 'workspace', '项目与产品', 'workspace.project', 'access_all', '访问全部项目项目', 9),
    ('workspace.product.view', 'workspace', '项目与产品', 'workspace.product', 'view', '查看产品', 10),
    ('workspace.product.create', 'workspace', '项目与产品', 'workspace.product', 'create', '新建产品', 11),
    ('workspace.product.edit', 'workspace', '项目与产品', 'workspace.product', 'edit', '编辑产品', 12),
    ('workspace.product.delete', 'workspace', '项目与产品', 'workspace.product', 'delete', '删除产品', 13),
    ('workspace.requirement_library.view', 'workspace', '模板', 'workspace.requirement_library', 'view', '查看需求标准库', 14),
    ('workspace.requirement_library.manage', 'workspace', '模板', 'workspace.requirement_library', 'manage', '管理需求标准库', 15),
    ('workspace.case_template.view', 'workspace', '模板', 'workspace.case_template', 'view', '查看用例模板库', 16),
    ('workspace.case_template.manage', 'workspace', '模板', 'workspace.case_template', 'manage', '管理用例模板库', 17),
    ('workspace.review_template.view', 'workspace', '模板', 'workspace.review_template', 'view', '查看评审模板', 18),
    ('workspace.review_template.manage', 'workspace', '模板', 'workspace.review_template', 'manage', '管理评审模板', 19),
    ('workspace.dev_mode.view', 'workspace', '模板', 'workspace.dev_mode', 'view', '查看研发模式', 20),
    ('workspace.dev_mode.manage', 'workspace', '模板', 'workspace.dev_mode', 'manage', '管理研发模式', 21),
    ('workspace.issue_scheme.view', 'workspace', '模板', 'workspace.issue_scheme', 'view', '查看工作项方案', 22),
    ('workspace.issue_scheme.manage', 'workspace', '模板', 'workspace.issue_scheme', 'manage', '管理工作项方案', 23),
    ('workspace.data_dictionary.manage', 'workspace', '配置', 'workspace.data_dictionary', 'manage', '管理数据字典', 24),
    ('workspace.stage_type.manage', 'workspace', '配置', 'workspace.stage_type', 'manage', '管理阶段类型', 25),
    ('workspace.requirement_type.manage', 'workspace', '配置', 'workspace.requirement_type', 'manage', '管理需求类型', 26),
    ('workspace.timesheet.view_all', 'workspace', '数据', 'workspace.timesheet', 'view_all', '查看全员工时工时', 27),
    ('workspace.timesheet.manage', 'workspace', '数据', 'workspace.timesheet', 'manage', '管理工时', 28),
    ('workspace.analytics.view', 'workspace', '数据', 'workspace.analytics', 'view', '查看分析', 29),
    ('workspace.export.manage', 'workspace', '数据', 'workspace.export', 'manage', '管理导出', 30),
    ('workspace.view.manage', 'workspace', '数据', 'workspace.view', 'manage', '管理公共视图工作区视图', 31),
    ('workspace.webhook.manage', 'workspace', '开发者', 'workspace.webhook', 'manage', '管理Webhooks', 32),
    ('workspace.integration.manage', 'workspace', '开发者', 'workspace.integration', 'manage', '管理集成', 33),
    ('workspace.changelog.manage', 'workspace', '开发者', 'workspace.changelog', 'manage', '管理更新公告', 34),
    ('project.settings.edit', 'project', '项目管理', 'project.settings', 'edit', '编辑项目设置', 1),
    ('project.settings.archive', 'project', '项目管理', 'project.settings', 'archive', '归档项目设置', 2),
    ('project.settings.delete', 'project', '项目管理', 'project.settings', 'delete', '删除项目设置', 3),
    ('project.member.manage', 'project', '项目管理', 'project.member', 'manage', '管理项目成员', 4),
    ('project.permission_group.manage', 'project', '项目管理', 'project.permission_group', 'manage', '管理项目权限组', 5),
    ('project.product.manage', 'project', '项目管理', 'project.product', 'manage', '管理研发产品', 6),
    ('project.announcement.manage', 'project', '项目管理', 'project.announcement', 'manage', '管理公告', 7),
    ('project.issue.view', 'project', '工作项', 'project.issue', 'view', '查看工作项', 8),
    ('project.issue.create', 'project', '工作项', 'project.issue', 'create', '新建工作项', 9),
    ('project.issue.edit', 'project', '工作项', 'project.issue', 'edit', '编辑工作项', 10),
    ('project.issue.delete', 'project', '工作项', 'project.issue', 'delete', '删除工作项', 11),
    ('project.issue.archive', 'project', '工作项', 'project.issue', 'archive', '归档工作项', 12),
    ('project.issue.import', 'project', '工作项', 'project.issue', 'import', '导入工作项', 13),
    ('project.issue.export', 'project', '工作项', 'project.issue', 'export', '导出工作项', 14),
    ('project.defect.view', 'project', '工作项', 'project.defect', 'view', '查看缺陷', 15),
    ('project.defect.create', 'project', '工作项', 'project.defect', 'create', '新建缺陷', 16),
    ('project.defect.edit', 'project', '工作项', 'project.defect', 'edit', '编辑缺陷', 17),
    ('project.defect.delete', 'project', '工作项', 'project.defect', 'delete', '删除缺陷', 18),
    ('project.intake.view', 'project', '工作项', 'project.intake', 'view', '查看收件箱', 19),
    ('project.intake.manage', 'project', '工作项', 'project.intake', 'manage', '管理收件箱', 20),
    ('project.requirement.view', 'project', '需求', 'project.requirement', 'view', '查看需求', 21),
    ('project.requirement.create', 'project', '需求', 'project.requirement', 'create', '新建需求', 22),
    ('project.requirement.edit', 'project', '需求', 'project.requirement', 'edit', '编辑需求', 23),
    ('project.requirement.delete', 'project', '需求', 'project.requirement', 'delete', '删除需求', 24),
    ('project.requirement.submit', 'project', '需求', 'project.requirement', 'submit', '提交评审需求', 25),
    ('project.requirement.review', 'project', '需求', 'project.requirement', 'review', '评审需求', 26),
    ('project.requirement.import', 'project', '需求', 'project.requirement', 'import', '导入需求', 27),
    ('project.requirement.export', 'project', '需求', 'project.requirement', 'export', '导出需求', 28),
    ('project.requirement_module.manage', 'project', '需求', 'project.requirement_module', 'manage', '管理需求模块', 29),
    ('project.requirement_baseline.manage', 'project', '需求', 'project.requirement_baseline', 'manage', '管理基线', 30),
    ('project.change_request.create', 'project', '需求', 'project.change_request', 'create', '发起变更单', 31),
    ('project.change_request.approve', 'project', '需求', 'project.change_request', 'approve', '审批变更单', 32),
    ('project.cycle.view', 'project', '计划', 'project.cycle', 'view', '查看迭代', 33),
    ('project.cycle.create', 'project', '计划', 'project.cycle', 'create', '新建迭代', 34),
    ('project.cycle.edit', 'project', '计划', 'project.cycle', 'edit', '编辑迭代', 35),
    ('project.cycle.delete', 'project', '计划', 'project.cycle', 'delete', '删除迭代', 36),
    ('project.cycle.archive', 'project', '计划', 'project.cycle', 'archive', '归档迭代', 37),
    ('project.module.view', 'project', '计划', 'project.module', 'view', '查看模块', 38),
    ('project.module.create', 'project', '计划', 'project.module', 'create', '新建模块', 39),
    ('project.module.edit', 'project', '计划', 'project.module', 'edit', '编辑模块', 40),
    ('project.module.delete', 'project', '计划', 'project.module', 'delete', '删除模块', 41),
    ('project.module.archive', 'project', '计划', 'project.module', 'archive', '归档模块', 42),
    ('project.release.view', 'project', '计划', 'project.release', 'view', '查看发布', 43),
    ('project.release.create', 'project', '计划', 'project.release', 'create', '新建发布', 44),
    ('project.release.edit', 'project', '计划', 'project.release', 'edit', '编辑发布', 45),
    ('project.release.delete', 'project', '计划', 'project.release', 'delete', '删除发布', 46),
    ('project.release.archive', 'project', '计划', 'project.release', 'archive', '归档发布', 47),
    ('project.stage.view', 'project', '计划', 'project.stage', 'view', '查看阶段', 48),
    ('project.stage.manage', 'project', '计划', 'project.stage', 'manage', '管理阶段', 49),
    ('project.review_tailoring.view', 'project', '评审', 'project.review_tailoring', 'view', '查看裁剪表', 50),
    ('project.review_tailoring.create', 'project', '评审', 'project.review_tailoring', 'create', '新建裁剪表', 51),
    ('project.review_tailoring.edit', 'project', '评审', 'project.review_tailoring', 'edit', '编辑裁剪表', 52),
    ('project.review_tailoring.delete', 'project', '评审', 'project.review_tailoring', 'delete', '删除裁剪表', 53),
    ('project.review_tailoring.submit', 'project', '评审', 'project.review_tailoring', 'submit', '提交签批裁剪表', 54),
    ('project.stage_review.view', 'project', '评审', 'project.stage_review', 'view', '查看阶段评审', 55),
    ('project.stage_review.edit', 'project', '评审', 'project.stage_review', 'edit', '编辑阶段评审', 56),
    ('project.stage_review.export', 'project', '评审', 'project.stage_review', 'export', '导出阶段评审', 57),
    ('project.risk.view', 'project', '风险', 'project.risk', 'view', '查看风险', 58),
    ('project.risk.create', 'project', '风险', 'project.risk', 'create', '新建风险', 59),
    ('project.risk.edit', 'project', '风险', 'project.risk', 'edit', '编辑风险', 60),
    ('project.risk.delete', 'project', '风险', 'project.risk', 'delete', '删除风险', 61),
    ('project.test_plan.view', 'project', '测试', 'project.test_plan', 'view', '查看测试计划', 62),
    ('project.test_plan.create', 'project', '测试', 'project.test_plan', 'create', '新建测试计划', 63),
    ('project.test_plan.edit', 'project', '测试', 'project.test_plan', 'edit', '编辑测试计划', 64),
    ('project.test_plan.delete', 'project', '测试', 'project.test_plan', 'delete', '删除测试计划', 65),
    ('project.test_plan.execute', 'project', '测试', 'project.test_plan', 'execute', '执行测试计划', 66),
    ('project.test_report.view', 'project', '测试', 'project.test_report', 'view', '查看测试报告', 67),
    ('project.test_report.create', 'project', '测试', 'project.test_report', 'create', '新建测试报告', 68),
    ('project.test_report.edit', 'project', '测试', 'project.test_report', 'edit', '编辑测试报告', 69),
    ('project.test_report.delete', 'project', '测试', 'project.test_report', 'delete', '删除测试报告', 70),
    ('project.test_case.view', 'project', '测试', 'project.test_case', 'view', '查看用例', 71),
    ('project.test_case.create', 'project', '测试', 'project.test_case', 'create', '新建用例', 72),
    ('project.test_case.edit', 'project', '测试', 'project.test_case', 'edit', '编辑用例', 73),
    ('project.test_case.delete', 'project', '测试', 'project.test_case', 'delete', '删除用例', 74),
    ('project.test_case.import', 'project', '测试', 'project.test_case', 'import', '导入用例', 75),
    ('project.test_case.export', 'project', '测试', 'project.test_case', 'export', '导出用例', 76),
    ('project.case_review.view', 'project', '测试', 'project.case_review', 'view', '查看用例评审', 77),
    ('project.case_review.create', 'project', '测试', 'project.case_review', 'create', '新建用例评审', 78),
    ('project.case_review.edit', 'project', '测试', 'project.case_review', 'edit', '编辑用例评审', 79),
    ('project.case_review.delete', 'project', '测试', 'project.case_review', 'delete', '删除用例评审', 80),
    ('project.page.view', 'project', '协作', 'project.page', 'view', '查看页面', 81),
    ('project.page.create', 'project', '协作', 'project.page', 'create', '新建页面', 82),
    ('project.page.edit', 'project', '协作', 'project.page', 'edit', '编辑页面', 83),
    ('project.page.delete', 'project', '协作', 'project.page', 'delete', '删除页面', 84),
    ('project.view.manage', 'project', '协作', 'project.view', 'manage', '管理公共视图视图', 85),
    ('project.filestore.view', 'project', '协作', 'project.filestore', 'view', '查看文件库', 86),
    ('project.filestore.edit', 'project', '协作', 'project.filestore', 'edit', '编辑文件库', 87),
    ('project.filestore.delete', 'project', '协作', 'project.filestore', 'delete', '删除文件库', 88),
    ('project.state.manage', 'project', '配置', 'project.state', 'manage', '管理状态', 89),
    ('project.label.manage', 'project', '配置', 'project.label', 'manage', '管理标签', 90),
    ('project.issue_type.manage', 'project', '配置', 'project.issue_type', 'manage', '管理工作项类型', 91),
    ('project.estimate.manage', 'project', '配置', 'project.estimate', 'manage', '管理估算', 92),
    ('project.workflow.manage', 'project', '配置', 'project.workflow', 'manage', '管理工作流', 93),
)

JSON_MAP = {
    'workspace.settings.view': (),
    'workspace.settings.edit': ('workspace.settings.edit',),
    'workspace.settings.delete': (),
    'workspace.member.view': ('workspace.member.view',),
    'workspace.member.invite': ('workspace.member.manage',),
    'workspace.member.edit': ('workspace.member.manage',),
    'workspace.member.remove': ('workspace.member.manage',),
    'workspace.member.leave': (),
    'workspace.role.view': ('workspace.permission_group.view',),
    'workspace.role.create': ('workspace.permission_group.manage',),
    'workspace.role.edit': ('workspace.permission_group.manage',),
    'workspace.role.delete': ('workspace.permission_group.manage',),
    'workspace.group.view': (),
    'workspace.group.create': ('workspace.team.manage',),
    'workspace.group.edit': ('workspace.team.manage',),
    'workspace.group.delete': ('workspace.team.manage',),
    'workspace.group.manage_member': ('workspace.team.manage',),
    'workspace.group.manage_role': ('workspace.permission_group.manage',),
    'workspace.project.view': (),
    'workspace.project.create': ('workspace.project.create',),
    'workspace.user_profile.view': ('workspace.member.view',),
    'workspace.user_profile.export': ('workspace.member.view',),
    'workspace.analytics.view': ('workspace.analytics.view',),
    'workspace.analytics.manage_saved_view': ('workspace.analytics.view',),
    'workspace.analytics.export': ('workspace.analytics.view',),
    'workspace.requirement_library.view': ('workspace.requirement_library.view',),
    'workspace.requirement_library.manage': ('workspace.requirement_library.manage',),
    'workspace.requirement_library.import_export': ('workspace.requirement_library.manage',),
    'workspace.case_template.view': ('workspace.case_template.view',),
    'workspace.case_template.manage': ('workspace.case_template.manage',),
    'workspace.case_template.import_export': ('workspace.case_template.manage',),
    'workspace.review_template.view': ('workspace.review_template.view',),
    'workspace.review_template.manage': ('workspace.review_template.manage',),
    'workspace.dev_mode.view': ('workspace.dev_mode.view', 'workspace.issue_scheme.view'),
    'workspace.dev_mode.manage': ('workspace.dev_mode.manage', 'workspace.issue_scheme.manage'),
    'project.settings.view': (),
    'project.settings.edit': ('project.settings.edit',),
    'project.archive': ('project.settings.archive',),
    'project.unarchive': ('project.settings.archive',),
    'project.delete': ('project.settings.delete',),
    'project.member.view': (),
    'project.member.invite': ('project.member.manage',),
    'project.member.remove': ('project.member.manage',),
    'project.member.leave': (),
    'project.member.bind_role': ('project.member.manage',),
    'project.role.view': (),
    'project.role.create': ('project.permission_group.manage',),
    'project.role.edit': ('project.permission_group.manage',),
    'project.role.delete': ('project.permission_group.manage',),
    'project.group_grant.view': (),
    'project.group_grant.edit': ('project.member.manage',),
    'project.publish.view': (),
    'project.publish.create': ('project.settings.edit',),
    'project.publish.edit': ('project.settings.edit',),
    'project.publish.delete': ('project.settings.edit',),
    'project.announcement.create': ('project.announcement.manage',),
    'project.announcement.delete': ('project.announcement.manage',),
    'project.work_items.view': ('project.issue.view',),
    'project.requirements.view': ('project.requirement.view',),
    'project.defects.view': ('project.defect.view',),
    'project.requirement_link.view': ('project.requirement.view',),
    'project.requirement_link.manage': ('project.requirement.edit',),
    'project.product_link.manage': ('project.product.manage',),
    'project.review_tailoring.view': ('project.review_tailoring.view',),
    'project.review_tailoring.manage': ('project.review_tailoring.create', 'project.review_tailoring.edit', 'project.review_tailoring.delete', 'project.review_tailoring.submit'),
    'project.stage_review.view': ('project.stage_review.view',),
    'project.stage_review.manage': ('project.stage_review.edit', 'project.stage_review.export'),
    'project.stage.view': ('project.stage.view',),
    'project.stage.manage': ('project.stage.manage',),
    'issue.comment.create': (),
    'issue.comment.edit': (),
    'issue.comment.delete': (),
    'issue.link.manage': (),
    'issue.relation.manage': (),
    'issue.attachment.download': (),
    'issue.attachment.upload': (),
    'issue.attachment.delete': (),
    'issue.import_export': ('project.issue.import', 'project.issue.export'),
    'sprints.view': ('project.cycle.view',),
    'sprints.create': ('project.cycle.create',),
    'sprints.edit': ('project.cycle.edit',),
    'sprints.delete': ('project.cycle.delete',),
    'sprints.archive': ('project.cycle.archive',),
    'sprints.file.upload': ('project.cycle.edit',),
    'sprints.file.delete': ('project.cycle.edit',),
    'sprints.file.download': ('project.cycle.view',),
    'sprints.issue.manage': ('project.cycle.edit',),
    'sprints.plan.manage': ('project.cycle.edit',),
    'sprints.comment.create': ('project.cycle.view',),
    'releases.view': ('project.release.view',),
    'releases.create': ('project.release.create',),
    'releases.edit': ('project.release.edit',),
    'releases.delete': ('project.release.delete',),
    'releases.archive': ('project.release.archive',),
    'releases.issue.manage': ('project.release.edit',),
    'releases.cycle.manage': ('project.release.edit',),
    'releases.plan.manage': ('project.release.edit',),
    'releases.file.upload': ('project.release.edit',),
    'releases.file.delete': ('project.release.edit',),
    'releases.file.download': ('project.release.view',),
    'releases.comment.create': ('project.release.view',),
    'modules.view': ('project.module.view',),
    'modules.create': ('project.module.create',),
    'modules.edit': ('project.module.edit',),
    'modules.delete': ('project.module.delete',),
    'modules.issue.manage': ('project.module.edit',),
    'modules.archive': ('project.module.archive',),
    'note.view': ('project.page.view',),
    'note.create': ('project.page.create',),
    'note.edit': ('project.page.edit',),
    'note.delete': ('project.page.delete',),
    'note.archive': ('project.page.edit',),
    'note.lock': ('project.page.edit',),
    'note.access.manage': ('project.page.edit',),
    'note.version.view': ('project.page.view',),
    'view.view': (),
    'view.create': ('project.view.manage',),
    'view.edit': ('project.view.manage',),
    'view.delete': ('project.view.manage',),
    'state.view': (),
    'state.create': ('project.state.manage',),
    'state.edit': ('project.state.manage',),
    'state.delete': ('project.state.manage',),
    'state.mark_default': ('project.state.manage',),
    'label.view': (),
    'label.create': ('project.label.manage',),
    'label.edit': ('project.label.manage',),
    'label.delete': ('project.label.manage',),
    'estimate.view': (),
    'estimate.create': ('project.estimate.manage',),
    'estimate.edit': ('project.estimate.manage',),
    'estimate.delete': ('project.estimate.manage',),
    'intake.view': ('project.intake.view',),
    'intake.create': ('project.intake.manage',),
    'intake.edit': ('project.intake.manage',),
    'intake.delete': ('project.intake.manage',),
    'intake.issue.view': ('project.intake.view',),
    'intake.issue.create': ('project.intake.view',),
    'intake.issue.edit': ('project.intake.manage',),
    'intake.issue.delete': ('project.intake.manage',),
    'intake.description_version.view': ('project.intake.view',),
    'workflow.view': (),
    'workflow.create': ('project.workflow.manage',),
    'workflow.edit': ('project.workflow.manage',),
    'workflow.delete': ('project.workflow.manage',),
    'workflow.config': ('project.workflow.manage',),
    'project.analytics.view': (),
    'project.asset.view': (),
    'project.asset.upload': (),
    'project.asset.edit': (),
    'project.asset.delete': (),
    'project.asset.download': (),
    'qa.case.view': ('project.test_case.view',),
    'qa.case.create': ('project.test_case.create',),
    'qa.case.edit': ('project.test_case.edit',),
    'qa.case.delete': ('project.test_case.delete',),
    'qa.case.import_export': ('project.test_case.import', 'project.test_case.export'),
    'qa.plan.view': ('project.test_plan.view',),
    'qa.plan.create': ('project.test_plan.create',),
    'qa.plan.edit': ('project.test_plan.edit', 'project.test_plan.execute'),
    'qa.plan.delete': ('project.test_plan.delete',),
    'qa.review.view': ('project.case_review.view',),
    'qa.review.create': ('project.case_review.create',),
    'qa.review.edit': ('project.case_review.edit',),
    'qa.review.delete': ('project.case_review.delete',),
    'qa.report.view': ('project.test_report.view',),
    'qa.report.create': ('project.test_report.create',),
    'qa.report.edit': ('project.test_report.edit',),
    'qa.report.delete': ('project.test_report.delete',),
    'qa.report.export': ('project.test_report.view',),
    'qa.mindmap.view': ('project.test_case.view',),
    'qa.mindmap.edit': ('project.test_case.edit',),
    'product.settings.edit': ('workspace.product.edit',),
    'product.settings.delete': ('workspace.product.delete',),
    'product.member.invite': (),
    'product.member.remove': (),
    'product.member.bind_role': (),
    'product.role.manage': (),
    'product.requirement.create': ('project.requirement.create',),
    'product.requirement.edit': ('project.requirement.edit',),
    'product.requirement.delete': ('project.requirement.delete',),
    'product.requirement_module.manage': ('project.requirement_module.manage',),
    'product.change_request.submit': ('project.change_request.create',),
    'product.baseline.manage': ('project.requirement_baseline.manage',),
    'product.project_link.manage': ('workspace.product.edit',),
    'product.test_case_link.manage': ('project.requirement.edit',),
}


#: 「工作区成员」系统组默认 key（permission-keys.md §5）
WORKSPACE_MEMBER_DEFAULT_KEYS = (
    "workspace.member.view",
    "workspace.requirement_library.view",
    "workspace.case_template.view",
    "workspace.review_template.view",
    "workspace.dev_mode.view",
    "workspace.issue_scheme.view",
    "workspace.product.view",
    "workspace.analytics.view",
)

#: 「项目成员」系统模板默认 key：所有模块的查看 + 日常写操作
PROJECT_MEMBER_DEFAULT_KEYS = tuple(
    [row[0] for row in NEW_PERMISSIONS if row[1] == "project" and row[4] == "view"]
    + [
        "project.issue.create",
        "project.issue.edit",
        "project.defect.create",
        "project.defect.edit",
        "project.requirement.create",
        "project.requirement.edit",
        "project.requirement.submit",
        "project.risk.create",
        "project.risk.edit",
        "project.test_plan.execute",
        "project.page.create",
        "project.page.edit",
        "project.filestore.edit",
    ]
)

NEW_KEYS = frozenset(row[0] for row in NEW_PERMISSIONS)
WORKSPACE_KEYS = frozenset(row[0] for row in NEW_PERMISSIONS if row[1] == "workspace")
PROJECT_KEYS = frozenset(row[0] for row in NEW_PERMISSIONS if row[1] == "project")

TYPE_KEY_PREFIX = "project.issue_type."
TEMPLATE_TYPE_KEY_PREFIX = "project.issue_type_template."
TEMPLATE_DESCRIPTOR_KEY = "issue_type_permission_templates"
DEFECT_CATEGORY_NAME = "缺陷"
LIMITABLE_ACTIONS = ("create", "edit", "delete")

SYSTEM_WORKSPACE_ADMIN = "workspace_admin"
SYSTEM_WORKSPACE_MEMBER = "workspace_member"
SYSTEM_PROJECT_ADMIN = "project_admin"
SYSTEM_PROJECT_MEMBER = "project_member"

JOB_ROLE_DICTIONARY_KEY = "job_role"
JOB_ROLE_DICTIONARY_NAME = "角色"
PRODUCT_DEFAULT_ROLE_NAMES = {"产品管理员", "产品成员"}
SORT_STEP = 10000


def _log(message):
    print(f"  [0438] {message}")


# ---------------------------------------------------------------------------
# 1. 权限字典
# ---------------------------------------------------------------------------


def step_permissions(M):
    Permission = M("Permission")
    deleted, _ = Permission._base_manager.exclude(key__in=NEW_KEYS).delete()
    existing = {row.key: row for row in Permission._base_manager.filter(key__in=NEW_KEYS)}
    created, updated = [], []
    for key, scope, group, module, action, name, order in NEW_PERMISSIONS:
        values = {
            "name": name,
            "description": name,
            "scope": scope,
            "module": module,
            "action": action,
            "category": group,
            "sort_order": order,
        }
        row = existing.get(key)
        if row is None:
            created.append(Permission(key=key, is_active=True, **values))
        else:
            for field, value in values.items():
                setattr(row, field, value)
            row.deleted_at = None
            updated.append(row)
    Permission._base_manager.bulk_create(created, batch_size=200)
    Permission._base_manager.bulk_update(
        updated, ["name", "description", "scope", "module", "action", "category", "sort_order", "deleted_at"]
    )
    _log(f"permissions: 删 {deleted} 行旧 key（含按类型衍生的），新建 {len(created)}，更新 {len(updated)}")


# ---------------------------------------------------------------------------
# 2. 类型库指向
# ---------------------------------------------------------------------------


def step_library_types(M):
    IssueType = M("IssueType")
    IssueScheme = M("IssueScheme")
    library_by_workspace = dict(
        IssueScheme._base_manager.filter(project__isnull=True, deleted_at__isnull=True).values_list(
            "workspace_id", "id"
        )
    )
    by_system_key, by_name = {}, {}
    for row in IssueType._base_manager.filter(
        scheme_id__in=list(library_by_workspace.values()), deleted_at__isnull=True
    ).values("id", "workspace_id", "name", "system_key"):
        if row["system_key"]:
            by_system_key[(row["workspace_id"], row["system_key"])] = row["id"]
        by_name.setdefault((row["workspace_id"], (row["name"] or "").strip()), row["id"])
    changed = []
    for issue_type in IssueType._base_manager.filter(scheme__project__isnull=False, library_type__isnull=True):
        target = None
        if issue_type.system_key:
            target = by_system_key.get((issue_type.workspace_id, issue_type.system_key))
        if target is None:
            target = by_name.get((issue_type.workspace_id, (issue_type.name or "").strip()))
        if target is not None:
            issue_type.library_type_id = target
            changed.append(issue_type)
    IssueType._base_manager.bulk_update(changed, ["library_type"], batch_size=1000)
    _log(f"library_type: {len(changed)} 个项目方案类型指回类型库")


# ---------------------------------------------------------------------------
# 3. 权限组 JSON 改写（旧 key → 新 key，按类型衍生的 key → 模块 key + 类型排除清单）
# ---------------------------------------------------------------------------


class _TypeUniverse:
    """一组类型：(类型 id, 模块, 用于排除清单的库类型 id, 名字, system_key)。"""

    def __init__(self, rows):
        self.rows = rows
        self.by_hex = {str(row[0]).replace("-", ""): row for row in rows}


def _type_universes(M):
    IssueType = M("IssueType")
    by_scheme = defaultdict(list)
    library_by_workspace = {}
    for row in IssueType._base_manager.filter(deleted_at__isnull=True).values(
        "id", "scheme_id", "scheme__project_id", "workspace_id", "category__name", "library_type_id", "name", "system_key"
    ):
        module = "defect" if row["category__name"] == DEFECT_CATEGORY_NAME else "issue"
        lib_id = row["library_type_id"] or row["id"]
        entry = (row["id"], module, str(lib_id), (row["name"] or "").strip(), row["system_key"])
        by_scheme[row["scheme_id"]].append(entry)
        if row["scheme__project_id"] is None:
            library_by_workspace.setdefault(row["workspace_id"], []).append(entry)
    return (
        {scheme_id: _TypeUniverse(rows) for scheme_id, rows in by_scheme.items()},
        {workspace_id: _TypeUniverse(rows) for workspace_id, rows in library_by_workspace.items()},
    )


def _fold_type_grants(granted, universe, keys, limits):
    """granted: {动作: {类型 id}} → 往 keys / limits 里加模块级 key 与排除清单。"""
    if universe is None:
        return
    for action in LIMITABLE_ACTIONS:
        allowed_ids = granted.get(action, set())
        if not allowed_ids:
            continue
        for module in ("issue", "defect"):
            module_rows = [row for row in universe.rows if row[1] == module]
            granted_libs = {row[2] for row in module_rows if row[0] in allowed_ids}
            if not granted_libs:
                continue
            key = f"project.{module}.{action}"
            keys.add(key)
            excluded = sorted({row[2] for row in module_rows if row[2] not in granted_libs})
            if excluded:
                limits[key] = sorted(set(limits.get(key, [])) | set(excluded)) if key in limits else excluded
    if granted.get("archive") or granted.get("unarchive"):
        keys.add("project.issue.archive")


def rewrite_payload(permissions, scope_keys, universe):
    perms = permissions if isinstance(permissions, dict) else {}
    old_keys = [key for key in perms.get("permission_keys", []) if isinstance(key, str)]
    descriptors = perms.get(TEMPLATE_DESCRIPTOR_KEY) or {}
    keys, limits = set(), {}
    granted = defaultdict(set)
    for key in old_keys:
        if key in NEW_KEYS:
            keys.add(key)
        elif key in JSON_MAP:
            keys.update(JSON_MAP[key])
        elif key.startswith(TYPE_KEY_PREFIX) and universe is not None:
            rest = key[len(TYPE_KEY_PREFIX):]
            if "." in rest:
                type_hex, action = rest.rsplit(".", 1)
                row = universe.by_hex.get(type_hex)
                if row is not None:
                    granted[action].add(row[0])
        elif key.startswith(TEMPLATE_TYPE_KEY_PREFIX) and universe is not None:
            descriptor = descriptors.get(key)
            if not isinstance(descriptor, dict):
                continue
            action = descriptor.get("action")
            system_key = descriptor.get("system_key")
            name = (descriptor.get("name") or "").strip()
            for row in universe.rows:
                if (system_key and row[4] == system_key) or (not system_key and row[3] == name):
                    granted[action].add(row[0])
    _fold_type_grants(granted, universe, keys, limits)
    old_limits = perms.get("type_limits")
    if isinstance(old_limits, dict):
        for key, ids in old_limits.items():
            if key in keys and isinstance(ids, list):
                limits.setdefault(key, sorted({str(i) for i in ids}))
    keys &= scope_keys
    limits = {key: ids for key, ids in limits.items() if key in keys}
    payload = {"permission_keys": sorted(keys)}
    if limits:
        payload["type_limits"] = limits
    return payload


def step_rewrite_roles(M):
    WorkspaceRole = M("WorkspaceRole")
    ProjectRole = M("ProjectRole")
    Project = M("Project")
    scheme_universes, library_universes = _type_universes(M)
    project_scheme = dict(Project._base_manager.values_list("id", "issue_scheme_id"))

    workspace_roles = list(WorkspaceRole._base_manager.filter(deleted_at__isnull=True))
    for role in workspace_roles:
        if role.type == "project_template":
            role.permissions = rewrite_payload(role.permissions, PROJECT_KEYS, library_universes.get(role.workspace_id))
        else:
            role.permissions = rewrite_payload(role.permissions, WORKSPACE_KEYS | PROJECT_KEYS, None)
    WorkspaceRole._base_manager.bulk_update(workspace_roles, ["permissions"], batch_size=500)

    project_roles = list(ProjectRole._base_manager.filter(deleted_at__isnull=True))
    for role in project_roles:
        universe = scheme_universes.get(project_scheme.get(role.project_id))
        role.permissions = rewrite_payload(role.permissions, PROJECT_KEYS, universe)
    ProjectRole._base_manager.bulk_update(project_roles, ["permissions"], batch_size=1000)
    _log(f"权限组改写：工作区级 {len(workspace_roles)} 个，项目级 {len(project_roles)} 个")


# ---------------------------------------------------------------------------
# 4. 系统权限组
# ---------------------------------------------------------------------------


def _unique_name(taken, name):
    if name not in taken:
        return name
    candidate = f"{name}（系统）"
    index = 2
    while candidate in taken:
        candidate = f"{name}（系统{index}）"
        index += 1
    return candidate


def step_system_groups(M):
    Workspace = M("Workspace")
    WorkspaceRole = M("WorkspaceRole")
    systems = {}
    for workspace in Workspace._base_manager.filter(deleted_at__isnull=True):
        roles = list(WorkspaceRole._base_manager.filter(workspace=workspace, deleted_at__isnull=True))
        taken = {role.name for role in roles}
        by_system = {role.system_key: role for role in roles if role.system_key}

        def ensure(system_key, role_type, name, description, keys, adopt_name=None):
            role = by_system.get(system_key)
            if role is None and adopt_name:
                role = next(
                    (r for r in roles if r.name == adopt_name and r.type == role_type and not r.system_key),
                    None,
                )
                if role is not None:
                    role.system_key = system_key
                    role.save(update_fields=["system_key"])
            if role is None:
                role = WorkspaceRole._base_manager.create(
                    workspace=workspace,
                    name=_unique_name(taken, name),
                    description=description,
                    type=role_type,
                    system_key=system_key,
                    permissions={"permission_keys": sorted(keys)},
                )
                taken.add(role.name)
            return role

        systems[workspace.id] = {
            SYSTEM_WORKSPACE_ADMIN: ensure(
                SYSTEM_WORKSPACE_ADMIN, "workspace", "管理员", "工作区与全部项目的全部权限。", (), adopt_name="管理员"
            ),
            SYSTEM_WORKSPACE_MEMBER: ensure(
                SYSTEM_WORKSPACE_MEMBER,
                "workspace",
                "工作区成员",
                "每个工作区成员都有的默认权限。",
                WORKSPACE_MEMBER_DEFAULT_KEYS,
            ),
            SYSTEM_PROJECT_ADMIN: ensure(
                SYSTEM_PROJECT_ADMIN, "project_template", "项目管理员", "项目里的全部权限。", ()
            ),
            SYSTEM_PROJECT_MEMBER: ensure(
                SYSTEM_PROJECT_MEMBER,
                "project_template",
                "项目成员",
                "每个项目成员都有的默认权限。",
                PROJECT_MEMBER_DEFAULT_KEYS,
            ),
        }
    _log(f"系统权限组：{len(systems)} 个工作区各 4 个")
    return systems


# ---------------------------------------------------------------------------
# 5. 整数角色 20 → 管理员组
# ---------------------------------------------------------------------------


def _project_admin_reference_row(M, project, template, cache):
    ProjectRole = M("ProjectRole")
    if project.id in cache:
        return cache[project.id]
    row = ProjectRole._base_manager.filter(
        project_id=project.id, source_template_id=template.id, deleted_at__isnull=True
    ).first()
    if row is None:
        taken = set(
            ProjectRole._base_manager.filter(project_id=project.id, deleted_at__isnull=True).values_list(
                "name", flat=True
            )
        )
        row = ProjectRole._base_manager.create(
            project_id=project.id,
            workspace_id=project.workspace_id,
            name=_unique_name(taken, template.name),
            description=template.description,
            permissions={},
            source_template_id=template.id,
        )
    cache[project.id] = row
    return row


def step_admin_bindings(M, systems):
    WorkspaceMember = M("WorkspaceMember")
    WorkspaceMemberRole = M("WorkspaceMemberRole")
    ProjectMember = M("ProjectMember")
    ProjectMemberRole = M("ProjectMemberRole")
    Project = M("Project")

    bound_ws = set(
        WorkspaceMemberRole._base_manager.filter(deleted_at__isnull=True).values_list("member_id", "role_id")
    )
    new_ws = []
    for member in WorkspaceMember._base_manager.filter(role=20, is_active=True, deleted_at__isnull=True):
        group = systems.get(member.workspace_id, {}).get(SYSTEM_WORKSPACE_ADMIN)
        if group and (member.id, group.id) not in bound_ws:
            new_ws.append(WorkspaceMemberRole(workspace_id=member.workspace_id, member_id=member.id, role_id=group.id))
            bound_ws.add((member.id, group.id))
    WorkspaceMemberRole._base_manager.bulk_create(new_ws, batch_size=500)

    bound_pm = set(
        ProjectMemberRole._base_manager.filter(deleted_at__isnull=True).values_list("member_id", "role_id")
    )
    projects = {p.id: p for p in Project._base_manager.filter(deleted_at__isnull=True)}
    row_cache, new_pm = {}, []
    for member in ProjectMember._base_manager.filter(role=20, is_active=True, deleted_at__isnull=True):
        project = projects.get(member.project_id)
        template = systems.get(member.workspace_id, {}).get(SYSTEM_PROJECT_ADMIN)
        if project is None or template is None:
            continue
        row = _project_admin_reference_row(M, project, template, row_cache)
        if (member.id, row.id) not in bound_pm:
            new_pm.append(
                ProjectMemberRole(
                    project_id=project.id, workspace_id=project.workspace_id, member_id=member.id, role_id=row.id
                )
            )
            bound_pm.add((member.id, row.id))
    ProjectMemberRole._base_manager.bulk_create(new_pm, batch_size=1000)
    _log(f"管理员绑定：工作区 {len(new_ws)} 人，项目 {len(new_pm)} 人（{len(row_cache)} 个项目建了项目管理员引用行）")


# ---------------------------------------------------------------------------
# 6. 项目权限组引用化：与模板一致或是模板子集 → 引用；有模板之外的 key → 脱离
# ---------------------------------------------------------------------------


def _effective_grants(payload, universe):
    """一个权限组在某项目里实际能做什么：普通 key 照抄；工作项 / 缺陷的新建、编辑、删除展开成
    (key, 类型 id)，扣掉类型限定排除的类型。用来判断项目组能不能改成引用模板而不丢权限。"""
    keys = set((payload or {}).get("permission_keys", []))
    limits = (payload or {}).get("type_limits") or {}
    grants = set()
    for key in keys:
        module, action = key.split(".")[1], key.rsplit(".", 1)[-1]
        if module not in ("issue", "defect") or action not in LIMITABLE_ACTIONS or universe is None:
            grants.add(key)
            continue
        excluded = set(limits.get(key, []))
        for type_row in universe.rows:
            if type_row[1] == module and str(type_row[0]) not in excluded and type_row[2] not in excluded:
                grants.add((key, type_row[0]))
    return grants


def step_reference_rows(M):
    WorkspaceRole = M("WorkspaceRole")
    ProjectRole = M("ProjectRole")
    Project = M("Project")
    scheme_universes, _ = _type_universes(M)
    project_scheme = dict(Project._base_manager.values_list("id", "issue_scheme_id"))
    templates = {}
    by_name = {}
    for template in WorkspaceRole._base_manager.filter(
        type="project_template", deleted_at__isnull=True, system_key__isnull=True
    ):
        templates[template.id] = template
        by_name[(template.workspace_id, template.name)] = template
    referenced, detached = 0, []
    rows = list(
        ProjectRole._base_manager.filter(deleted_at__isnull=True).exclude(
            source_template__system_key__isnull=False
        )
    )
    changed = []
    for row in rows:
        template = templates.get(row.source_template_id) or by_name.get((row.workspace_id, row.name))
        if template is None:
            if row.source_template_id is not None:
                row.source_template_id = None
                changed.append(row)
            continue
        # 本行实际能做的 ⊆ 模板能做的才改成引用（模板多出来的算补齐，计划 §9-3）。
        # 要按类型比：key 一样、类型限定不同时，直接引用会让本行丢掉原来允许的类型。
        universe = scheme_universes.get(project_scheme.get(row.project_id))
        row_grants = _effective_grants(row.permissions, universe)
        template_grants = _effective_grants(template.permissions, universe)
        row_keys = set((row.permissions or {}).get("permission_keys", []))
        template_keys = set((template.permissions or {}).get("permission_keys", []))
        if row_grants <= template_grants:
            row.permissions = {}
            row.source_template_id = template.id
            referenced += 1
        else:
            row.source_template_id = None
            type_only = len([g for g in row_grants - template_grants if isinstance(g, tuple)])
            detached.append(f"{row.project_id}:{row.name} +{sorted(row_keys - template_keys)[:4]} 类型差异 {type_only} 处")
        changed.append(row)
    ProjectRole._base_manager.bulk_update(changed, ["permissions", "source_template"], batch_size=1000)
    _log(f"项目权限组引用化：引用 {referenced} 个，脱离 {len(detached)} 个")
    for line in detached[:30]:
        _log(f"    脱离 {line}")


# ---------------------------------------------------------------------------
# 7. 角色字典、成员角色、审批人、研发矩阵
# ---------------------------------------------------------------------------


def _role_display_name(role, templates_by_id):
    template = templates_by_id.get(role.source_template_id)
    return template.name if template is not None else role.name


def step_job_roles(M, systems):
    Workspace = M("Workspace")
    WorkspaceRole = M("WorkspaceRole")
    DataDictionary = M("DataDictionary")
    DataDictionaryItem = M("DataDictionaryItem")
    ProjectRole = M("ProjectRole")
    ProjectMember = M("ProjectMember")
    ProjectMemberRole = M("ProjectMemberRole")
    ProjectMemberJobRole = M("ProjectMemberJobRole")
    WorkspaceMember = M("WorkspaceMember")
    WorkspaceMemberJobRole = M("WorkspaceMemberJobRole")
    ProjectGroupRole = M("ProjectGroupRole")
    WorkspaceGroupMember = M("WorkspaceGroupMember")
    Principal = M("WorkflowTransitionPrincipal")
    StageReview = M("StageReview")
    StageReviewTemplate = M("StageReviewTemplate")
    ProductRole = M("ProductRole")
    ProductMember = M("ProductMember")
    ProductProject = M("ProductProject")
    ProductTeamAssignment = M("ProductTeamAssignment")

    templates_by_id = {
        t.id: t for t in WorkspaceRole._base_manager.filter(type="project_template", deleted_at__isnull=True)
    }
    # 审批人可能还指着已软删的模板（旧数据），解析审批人时要连它们一起认
    principal_templates_by_id = {t.id: t for t in WorkspaceRole._base_manager.filter(type="project_template")}

    # 每个工作区要有哪些角色
    names = defaultdict(list)

    def add(workspace_id, name):
        name = (name or "").strip()
        if name and name not in names[workspace_id]:
            names[workspace_id].append(name)

    for template in sorted(templates_by_id.values(), key=lambda t: t.name):
        if not template.system_key:
            add(template.workspace_id, template.name)
    for model in (StageReviewTemplate, StageReview):
        for row in model._base_manager.filter(deleted_at__isnull=True).values(
            "workspace_id", "initiator_role", "leader_role", "auditor_role"
        ):
            for field in ("initiator_role", "leader_role", "auditor_role"):
                add(row["workspace_id"], row[field])
    for role in ProductRole._base_manager.select_related("product").all():
        if role.name not in PRODUCT_DEFAULT_ROLE_NAMES:
            add(role.product.workspace_id, role.name)
    role_by_id = {r.id: r for r in ProjectRole._base_manager.all()}
    # 只为还在用的审批人补角色名；已软删的审批人解析不到就删掉，不为它造字典值
    for principal in Principal._base_manager.filter(kind="role", deleted_at__isnull=True).values(
        "role_id", "workspace_role_id"
    ):
        if principal["role_id"] and principal["role_id"] in role_by_id:
            role = role_by_id[principal["role_id"]]
            add(role.workspace_id, _role_display_name(role, principal_templates_by_id))
        elif principal["workspace_role_id"] in principal_templates_by_id:
            template = principal_templates_by_id[principal["workspace_role_id"]]
            add(template.workspace_id, template.name)

    # 字典与值
    item_by_name = {}
    for workspace in Workspace._base_manager.filter(deleted_at__isnull=True):
        dictionary = DataDictionary._base_manager.filter(
            workspace=workspace, key=JOB_ROLE_DICTIONARY_KEY, deleted_at__isnull=True
        ).first()
        if dictionary is None:
            taken = set(
                DataDictionary._base_manager.filter(workspace=workspace, deleted_at__isnull=True).values_list(
                    "name", flat=True
                )
            )
            dictionary = DataDictionary._base_manager.create(
                workspace=workspace,
                key=JOB_ROLE_DICTIONARY_KEY,
                name=_unique_name(taken, JOB_ROLE_DICTIONARY_NAME),
                description="成员是干什么的。审批人、评审负责人按角色找人，与权限组无关。",
                is_system=True,
                is_colored=False,
            )
        existing = {
            item.label: item
            for item in DataDictionaryItem._base_manager.filter(dictionary=dictionary, deleted_at__isnull=True)
        }
        order = max([item.sort_order for item in existing.values()] or [0])
        for name in names.get(workspace.id, []):
            if name not in existing:
                order += SORT_STEP
                existing[name] = DataDictionaryItem._base_manager.create(
                    dictionary=dictionary, workspace=workspace, label=name, color="", sort_order=order
                )
        for label, item in existing.items():
            item_by_name[(workspace.id, label)] = item
    _log(f"角色字典：共 {len(item_by_name)} 个角色")

    # 项目成员的角色：来自直绑与团队授权的权限组名（引用行取模板名）
    member_jobs = defaultdict(set)  # project_member_id -> {item_id}
    pm_workspace = {}
    for binding in ProjectMemberRole._base_manager.filter(
        deleted_at__isnull=True, role__deleted_at__isnull=True, member__is_active=True
    ).values("member_id", "role_id", "workspace_id"):
        role = role_by_id.get(binding["role_id"])
        if role is None:
            continue
        item = item_by_name.get((binding["workspace_id"], _role_display_name(role, templates_by_id)))
        if item is not None:
            member_jobs[binding["member_id"]].add(item.id)
            pm_workspace[binding["member_id"]] = binding["workspace_id"]
    project_member_lookup = {
        (row["project_id"], row["member_id"]): row["id"]
        for row in ProjectMember._base_manager.filter(is_active=True, deleted_at__isnull=True).values(
            "id", "project_id", "member_id"
        )
    }
    for grant in ProjectGroupRole._base_manager.filter(deleted_at__isnull=True, role__deleted_at__isnull=True):
        role = role_by_id.get(grant.role_id)
        if role is None:
            continue
        item = item_by_name.get((grant.workspace_id, _role_display_name(role, templates_by_id)))
        if item is None:
            continue
        for user_id in WorkspaceGroupMember._base_manager.filter(
            group_id=grant.group_id, deleted_at__isnull=True
        ).values_list("member__member_id", flat=True):
            pm_id = project_member_lookup.get((grant.project_id, user_id))
            if pm_id:
                member_jobs[pm_id].add(item.id)
                pm_workspace[pm_id] = grant.workspace_id

    # 研发矩阵：产品自定义角色（非默认两项）→ 关联项目里的这个人
    team_rows, orphan_product_members = [], []
    for product_member in ProductMember._base_manager.select_related("product").all():
        custom = [
            name
            for name in ProductRole._base_manager.filter(
                role_member_entries__member_id=product_member.id
            ).values_list("name", flat=True)
            if name not in PRODUCT_DEFAULT_ROLE_NAMES
        ]
        project_ids = list(
            ProductProject._base_manager.filter(
                product_id=product_member.product_id, deleted_at__isnull=True
            ).values_list("project_id", flat=True)
        )
        member_project_ids = [
            pid for pid in project_ids if (pid, product_member.member_id) in project_member_lookup
        ]
        if not member_project_ids:
            orphan_product_members.append(f"{product_member.product.name}:{product_member.member_id}")
        for name in custom:
            item = item_by_name.get((product_member.product.workspace_id, name))
            if item is None:
                continue
            for project_id in member_project_ids:
                team_rows.append((project_id, product_member.product_id, item.id, product_member.member_id))
                member_jobs[project_member_lookup[(project_id, product_member.member_id)]].add(item.id)
                pm_workspace[project_member_lookup[(project_id, product_member.member_id)]] = (
                    product_member.product.workspace_id
                )

    existing_links = set(
        ProjectMemberJobRole._base_manager.filter(deleted_at__isnull=True).values_list("member_id", "job_role_id")
    )
    pm_project = dict(ProjectMember._base_manager.values_list("id", "project_id"))
    new_links = []
    for pm_id, item_ids in member_jobs.items():
        for item_id in item_ids:
            if (pm_id, item_id) not in existing_links:
                new_links.append(
                    ProjectMemberJobRole(
                        project_id=pm_project[pm_id],
                        workspace_id=pm_workspace[pm_id],
                        member_id=pm_id,
                        job_role_id=item_id,
                    )
                )
    ProjectMemberJobRole._base_manager.bulk_create(new_links, batch_size=1000)

    # 工作区成员的角色 = 他在各项目里的角色并集
    pm_user = dict(ProjectMember._base_manager.values_list("id", "member_id"))
    ws_jobs = defaultdict(set)
    for pm_id, item_ids in member_jobs.items():
        ws_jobs[(pm_workspace[pm_id], pm_user[pm_id])] |= item_ids

    # 再加上：和某个角色同名的旧工作区权限组（如「DQA」「NPI主管」）直接绑的人、团队绑的人。
    # 原 resolve_role_candidates 第三级就是按这两条路径找人，不带上会让评审候选人退回到全体项目成员。
    WorkspaceMemberRole = M("WorkspaceMemberRole")
    WorkspaceGroupRole = M("WorkspaceGroupRole")
    WorkspaceGroupMember = M("WorkspaceGroupMember")
    ws_role_item = {}
    for role in WorkspaceRole._base_manager.filter(type="workspace", deleted_at__isnull=True, system_key__isnull=True):
        item = item_by_name.get((role.workspace_id, (role.name or "").strip()))
        if item is not None:
            ws_role_item[role.id] = item
    if ws_role_item:
        wm_info = {
            row["id"]: (row["workspace_id"], row["member_id"])
            for row in WorkspaceMember._base_manager.filter(deleted_at__isnull=True).values(
                "id", "workspace_id", "member_id"
            )
        }
        for wm_id, role_id in WorkspaceMemberRole._base_manager.filter(
            role_id__in=list(ws_role_item), deleted_at__isnull=True
        ).values_list("member_id", "role_id"):
            if wm_id in wm_info:
                ws_jobs[wm_info[wm_id]].add(ws_role_item[role_id].id)
        group_items = defaultdict(set)
        for group_id, role_id in WorkspaceGroupRole._base_manager.filter(
            role_id__in=list(ws_role_item), deleted_at__isnull=True
        ).values_list("group_id", "role_id"):
            group_items[group_id].add(ws_role_item[role_id].id)
        for group_id, wm_id in WorkspaceGroupMember._base_manager.filter(
            group_id__in=list(group_items), deleted_at__isnull=True
        ).values_list("group_id", "member_id"):
            if wm_id in wm_info:
                ws_jobs[wm_info[wm_id]] |= group_items[group_id]
        _log(f"工作区角色：{len(ws_role_item)} 个旧工作区权限组与角色同名，其持有人一并挂上对应角色")
    ws_member_lookup = {
        (row["workspace_id"], row["member_id"]): row["id"]
        for row in WorkspaceMember._base_manager.filter(deleted_at__isnull=True).values(
            "id", "workspace_id", "member_id"
        )
    }
    existing_ws_links = set(
        WorkspaceMemberJobRole._base_manager.filter(deleted_at__isnull=True).values_list("member_id", "job_role_id")
    )
    new_ws_links = []
    for (workspace_id, user_id), item_ids in ws_jobs.items():
        wm_id = ws_member_lookup.get((workspace_id, user_id))
        if wm_id is None:
            continue
        for item_id in item_ids:
            if (wm_id, item_id) not in existing_ws_links:
                new_ws_links.append(
                    WorkspaceMemberJobRole(workspace_id=workspace_id, member_id=wm_id, job_role_id=item_id)
                )
    WorkspaceMemberJobRole._base_manager.bulk_create(new_ws_links, batch_size=1000)
    _log(f"成员角色：项目成员 {len(new_links)} 条，工作区成员 {len(new_ws_links)} 条")

    existing_team = set(
        ProductTeamAssignment._base_manager.filter(deleted_at__isnull=True).values_list(
            "project_id", "product_id", "job_role_id", "member_id"
        )
    )
    projects_ws = dict(M("Project")._base_manager.values_list("id", "workspace_id"))
    team_objs = []
    for row in set(team_rows) - existing_team:
        team_objs.append(
            ProductTeamAssignment(
                project_id=row[0],
                workspace_id=projects_ws[row[0]],
                product_id=row[1],
                job_role_id=row[2],
                member_id=row[3],
            )
        )
    ProductTeamAssignment._base_manager.bulk_create(team_objs, batch_size=500)
    _log(f"研发矩阵：{len(team_objs)} 行；不在任何关联项目里的产品成员 {len(orphan_product_members)} 人")
    for line in orphan_product_members[:30]:
        _log(f"    产品成员未进关联项目 {line}")

    # 审批人：kind=role 的旧两列 → job_role
    principals = list(Principal._base_manager.filter(kind="role", job_role__isnull=True).select_related("transition"))
    seen = set(
        Principal._base_manager.filter(job_role__isnull=False, deleted_at__isnull=True).values_list(
            "transition_id", "dimension", "job_role_id"
        )
    )
    changed, duplicates, unresolved = [], [], []
    for principal in principals:
        if principal.role_id and principal.role_id in role_by_id:
            role = role_by_id[principal.role_id]
            item = item_by_name.get((role.workspace_id, _role_display_name(role, principal_templates_by_id)))
        elif principal.workspace_role_id in principal_templates_by_id:
            template = principal_templates_by_id[principal.workspace_role_id]
            item = item_by_name.get((template.workspace_id, template.name))
        else:
            item = None
        if item is None:
            # 找不到对应角色：旧引用已失效（指向的权限组 / 模板没了），按旧规则本来就解析不出人。
            # 0439 会要求 kind=role 必须有 job_role，留着会让升级失败，这里删掉并记日志。
            unresolved.append(principal)
            continue
        signature = (principal.transition_id, principal.dimension, item.id)
        if principal.deleted_at is None and signature in seen:
            duplicates.append(principal.id)
            continue
        if principal.deleted_at is None:
            seen.add(signature)
        principal.job_role_id = item.id
        principal.role_id = None
        principal.workspace_role_id = None
        changed.append(principal)
    Principal._base_manager.filter(id__in=duplicates).delete()
    Principal._base_manager.filter(id__in=[principal.id for principal in unresolved]).delete()
    Principal._base_manager.bulk_update(changed, ["job_role", "role", "workspace_role"], batch_size=1000)
    _log(
        f"审批人：{len(changed)} 条改为按角色，重复删 {len(duplicates)} 条，"
        f"找不到角色删 {len(unresolved)} 条（其中仍在用 {sum(1 for p in unresolved if p.deleted_at is None)} 条）"
    )
    for principal in [p for p in unresolved if p.deleted_at is None][:30]:
        _log(f"    删除失效审批人 transition={principal.transition_id} dimension={principal.dimension}")


def forward(apps, schema_editor):
    def M(name):
        return apps.get_model("db", name)

    step_permissions(M)
    step_library_types(M)
    step_rewrite_roles(M)
    systems = step_system_groups(M)
    step_admin_bindings(M, systems)
    step_reference_rows(M)
    step_job_roles(M, systems)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0437_permission_groups_schema"),
    ]

    operations = [
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]
