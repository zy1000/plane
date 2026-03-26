## 三、权限落库规范

这份文档的目标不是只做讨论清单，而是作为后续录入 `Permission` 表的来源文档。建议所有权限键都按统一规则整理后再入库。

### 1. `Permission` 表字段映射

当前模型字段如下：

- `key`：权限唯一键，例如 `workspace.role.view`
- `name`：权限名称，建议填写简短中文名，例如“查看工作区角色”
- `description`：权限说明，建议直接复用本清单中的说明文字
- `scope`：权限作用域，只允许 `workspace` 或 `project`
- `module`：模块名，例如 `role`、`member`、`issue.comment`
- `action`：动作名，例如 `view`、`create`、`edit`
- `category`：页面或业务分组，例如“工作区设置”“项目成员”“工作项主体”
- `sort_order`：同一分类下的排序值，建议按文档顺序递增
- `is_active`：是否启用，默认 `true`

### 2. 命名规则

- `key` 必须使用小写英文和点分格式
- `workspace` 前缀的权限，`scope` 固定为 `workspace`
- `project`、`issue`、`cycle`、`module`、`page`、`view`、`state`、`label`、`estimate`、`milestone`、`intake`、`workflow`、`search`、`filestore`、`qa` 前缀的权限，`scope` 固定为 `project`
- `module` 字段建议取 `key` 去掉最后一个动作段后的部分，例如 `workspace.role.view -> role`，`issue.comment.edit -> issue.comment`
- `action` 字段建议取 `key` 最后一段，例如 `view`、`edit`、`assign_group`

### 3. 分类建议

- 工作区侧分类：工作区设置、工作区成员、工作区角色模板、工作区用户组、工作区项目管理、工作区用户资料与画像、工作区分析
- 项目侧分类：项目设置、项目成员、项目角色、工作区组在项目中的授权、项目发布板与公告、工作项主体、工作项评论与互动、工作项关系与附件、工作项版本与元数据、迭代、模块、页面、视图/筛选、状态/标签/估算/里程碑、Intake、Workflow/审批、Analytics/Search/Asset/Filestore、QA

### 4. 推荐导入示例

| key | name | scope | module | action | category |
| --- | --- | --- | --- | --- | --- |
| `workspace.role.view` | 查看工作区角色 | `workspace` | `role` | `view` | 工作区角色模板 |
| `project.member.bind_role` | 绑定项目角色 | `project` | `member` | `bind_role` | 项目成员 |
| `issue.comment.edit` | 编辑评论 | `project` | `issue.comment` | `edit` | 工作项评论与互动 |

## 四、各模块权限键清单

下面的清单是在原清单基础上扩充后的版本，重点补上 `workspace` 作用域、项目内遗漏模块，以及目前代码里已经存在但原方案未覆盖的动作。

### A. Workspace 级权限键

#### 工作区设置（workspace.settings）

- `workspace.settings.view` — 查看工作区信息、基础配置
- `workspace.settings.edit` — 修改工作区名称、时区、基础设置
- `workspace.settings.delete` — 删除工作区

#### 工作区成员（workspace.member）

- `workspace.member.view` — 查看工作区成员列表与成员详情
- `workspace.member.invite` — 邀请工作区成员
- `workspace.member.edit` — 修改工作区成员角色与信息
- `workspace.member.remove` — 移除工作区成员

#### 工作区角色模板（workspace.role）

- `workspace.role.view` — 查看工作区角色模板列表与详情
- `workspace.role.create` — 创建工作区角色模板
- `workspace.role.edit` — 编辑工作区角色模板
- `workspace.role.delete` — 删除工作区角色模板
- `workspace.role.assign_group` — 为工作区组绑定默认角色模板
- `workspace.role.import_to_project` — 将工作区角色模板导入项目角色

#### 工作区用户组（workspace.group）

- `workspace.group.view` — 查看工作区用户组列表与详情
- `workspace.group.create` — 创建工作区用户组
- `workspace.group.edit` — 编辑工作区用户组名称/描述
- `workspace.group.delete` — 删除工作区用户组
- `workspace.group.manage_member` — 管理工作区组成员
- `workspace.group.manage_role` — 管理工作区组默认角色模板

#### 工作区项目管理（workspace.project）

- `workspace.project.view` — 查看工作区内项目列表/概览
- `workspace.project.create` — 创建项目


#### 工作区用户资料与画像（workspace.user_profile）

- `workspace.user_profile.view` — 查看成员画像页
- `workspace.user_profile.export` — 导出成员画像相关数据


#### 工作区分析（workspace.analytics）

- `workspace.analytics.view` — 查看工作区分析看板
- `workspace.analytics.manage_saved_view` — 管理分析视图定义
- `workspace.analytics.export` — 导出分析数据

### B. Project 级权限键

#### 项目设置（project.settings）

- `project.settings.view` — 查看项目详情、设置、基础统计
- `project.settings.edit` — 编辑项目设置
- `project.archive` — 归档项目
- `project.unarchive` — 恢复项目
- `project.delete` — 删除项目

#### 项目成员（project.member）

- `project.member.view` — 查看项目成员列表、角色、继承来源
- `project.member.invite` — 邀请项目成员
- `project.member.edit` — 修改项目成员属性
- `project.member.remove` — 移除项目成员
- `project.member.leave` — 主动退出项目
- `project.member.bind_role` — 给成员直接绑定/移除项目角色

#### 项目角色（project.role）

- `project.role.view` — 查看项目角色列表与详情
- `project.role.create` — 创建项目角色
- `project.role.edit` — 编辑项目角色
- `project.role.delete` — 删除项目角色

#### 工作区组在项目中的授权（project.group_grant）

- `project.group_grant.view` — 查看项目中各工作区组的授权情况
- `project.group_grant.create` — 给工作区组授予项目角色
- `project.group_grant.edit` — 修改组的项目授权
- `project.group_grant.delete` — 删除组的项目授权

#### 项目发布与公告（project.misc）

- `project.publish.view` — 查看项目发布配置与公开链接
- `project.publish.create` — 发布项目
- `project.publish.edit` — 编辑项目发布配置
- `project.publish.delete` — 取消发布项目
- `project.announcement.view` — 查看项目公告
- `project.announcement.edit` — 发布/编辑/删除项目公告

#### 工作项主体（issue）
- `issue.create` — 创建工作项
- `issue.edit` — 编辑工作项
- `issue.delete` — 删除工作项
- `issue.archive` — 归档工作项
- `issue.unarchive` — 恢复工作项

#### 缺陷工作项（issue.defect）
- `issue.defect.create` — 创建缺陷类型工作项
- `issue.defect.edit` — 编辑缺陷类型工作项
- `issue.defect.delete` — 删除缺陷类型工作项

#### 工作项评论与互动
- `issue.comment.create` — 创建评论
- `issue.comment.edit` — 编辑评论
- `issue.comment.delete` — 删除评论

#### 工作项关系与附件

- `issue.link.view` — 查看外部链接
- `issue.link.manage` — 新增、编辑、删除外部链接
- `issue.relation.view` — 查看事项关联
- `issue.relation.manage` — 新增、删除事项关联
- `issue.attachment.view` — 查看附件
- `issue.attachment.upload` — 上传附件
- `issue.attachment.delete` — 删除附件
- `issue.label.manage` — 绑定/解绑标签


#### 冲刺（sprints）

- `sprints.view` — 查看冲刺列表与详情
- `sprints.create` — 创建冲刺
- `sprints.edit` — 编辑冲刺及其基础配置
- `sprints.delete` — 删除冲刺
- `sprints.archive` — 归档/恢复冲刺
- `sprints.issue.manage` — 添加、调整、迁移、移除冲刺工作项

#### 发布（releases）

- `releases.view` — 查看发布列表与详情
- `releases.create` — 创建发布
- `releases.edit` — 编辑发布及其基础内容
- `releases.delete` — 删除发布
- `releases.issue.manage` — 添加、调整、移除发布工作项
- `releases.sprints.manage` — 关联或取消关联发布与冲刺

#### 页面（page）

- `page.view` — 查看页面列表与详情
- `page.create` — 创建页面
- `page.edit` — 编辑页面
- `page.delete` — 删除页面
- `page.archive` — 归档/恢复页面
- `page.lock` — 锁定/解锁页面
- `page.access.manage` — 修改页面公开/私有访问设置
- `page.version.view` — 查看页面历史版本

#### 视图/筛选（view）

- `view.view` — 查看视图列表与详情
- `view.create` — 创建视图
- `view.edit` — 编辑视图
- `view.delete` — 删除视图

#### 状态、标签、估算、里程碑

- `state.view` — 查看状态列表
- `state.create` — 创建状态
- `state.edit` — 编辑状态
- `state.delete` — 删除状态
- `state.mark_default` — 设为默认状态
- `label.view` — 查看标签列表
- `label.create` — 创建标签
- `label.edit` — 编辑标签
- `label.delete` — 删除标签
- `estimate.view` — 查看估算
- `estimate.create` — 创建估算点
- `estimate.edit` — 编辑估算点
- `estimate.delete` — 删除估算点
- `milestone.view` — 查看里程碑列表与详情
- `milestone.create` — 创建里程碑
- `milestone.edit` — 编辑里程碑
- `milestone.delete` — 删除里程碑
- `milestone.issue.view` — 查看里程碑关联工作项
- `milestone.issue.add` — 关联工作项到里程碑
- `milestone.issue.remove` — 从里程碑移除工作项

#### Intake

- `intake.view` — 查看 Intake 列表与详情
- `intake.create` — 创建 Intake
- `intake.edit` — 编辑 Intake
- `intake.delete` — 删除 Intake
- `intake.issue.view` — 查看 Intake 工作项
- `intake.issue.create` — 创建 Intake 工作项
- `intake.issue.edit` — 编辑 Intake 工作项
- `intake.issue.delete` — 删除 Intake 工作项
- `intake.description_version.view` — 查看 Intake 描述版本

#### Workflow / 审批

- `workflow.view` — 查看工作流列表与详情
- `workflow.create` — 创建工作流
- `workflow.edit` — 编辑工作流
- `workflow.delete` — 删除工作流
- `workflow.transition.view` — 查看流转定义
- `workflow.transition.create` — 创建流转
- `workflow.transition.edit` — 编辑流转
- `workflow.transition.delete` — 删除流转
- `workflow.approval.view` — 查看我的审批/审批记录
- `workflow.approval.action` — 审批通过、拒绝、处理审批动作
- `workflow.transition_record.view` — 查看工作项流转记录

#### Analytics / Search / Asset / Filestore

- `project.analytics.view` — 查看项目统计
- `project.analytics.advanced_view` — 查看项目高级分析
- `search.issue.view` — 搜索项目工作项
- `project.asset.view` — 查看项目资产
- `project.asset.upload` — 上传项目资产
- `project.asset.edit` — 编辑项目资产
- `project.asset.delete` — 删除项目资产
- `project.asset.download` — 下载项目资产
- `filestore.view` — 查看项目文件库
- `filestore.upload` — 上传文件库文件
- `filestore.edit` — 编辑文件库文件
- `filestore.delete` — 删除文件库文件
- `filestore.download` — 下载文件库文件
- `filestore.restore_version` — 恢复历史版本

#### QA

- `qa.case.view` — 查看测试用例
- `qa.case.create` — 创建测试用例
- `qa.case.edit` — 编辑测试用例
- `qa.case.delete` — 删除测试用例
- `qa.case.import_export` — 导入/导出测试用例
- `qa.plan.view` — 查看测试计划
- `qa.plan.create` — 创建测试计划
- `qa.plan.edit` — 编辑测试计划
- `qa.plan.delete` — 删除测试计划
- `qa.plan.execute` — 执行测试计划
- `qa.review.view` — 查看测试评审
- `qa.review.create` — 创建测试评审
- `qa.review.edit` — 编辑测试评审
- `qa.review.delete` — 删除测试评审
- `qa.review.review` — 执行评审
- `qa.review.confirm` — 确认评审结果
- `qa.mindmap.view` — 查看 QA 脑图
- `qa.mindmap.edit` — 编辑 QA 脑图
- `qa.mindmap.asset_upload` — 上传 QA 脑图相关资产
