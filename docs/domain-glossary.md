# 领域词汇表（自研模块）

> **给 AI 的前置说明**：本仓库是 Plane 的 fork。下面这些模块**上游 Plane 完全不存在**，对 "Plane" 的通用认知在这里一律不适用，不要拿上游的 Issue/Cycle/Module 心智去套。动这些模块前先读本文对应小节。
>
> 原生概念（workspace / project / issue(work item) / cycle / module / view / page / state）见 `AGENTS.md` 的 Common Terms。

## 模块总览

| 模块 | 一句话 | 作用域 | 后端 views | 前端 |
|---|---|---|---|---|
| requirement 需求 | 类型化字段 + 版本 + 变更单 + 审批 + 基线 | product / project / library | `requirement/` | `components/requirements/` |
| product 产品 | 需求的顶层容器，**与 project 无外键关系** | workspace | `product/` | `components/products/` |
| data_dictionary 数据字典 | 工作区级枚举值维护：10 个系统字典（6 产品 + 4 项目）由代码预置，可自建；产品的阶段/类别/状态/研发等级、项目的所属BU/状态/类型引用其值，项目代号按 label 取自 `project_code` | workspace | `data_dictionary.py`（单文件） | `components/workspace/settings/data-dictionaries/` |
| release 发布 | 发布单，Cycle 的克隆放大版 | project | `release/` | `components/releases/` |
| qa 测试 | TestHub：用例/计划/执行/评审/报表（体量最大） | 混合，见下 | `qa/` | `components/qa/` |
| timesheet 工时 | 工时填报与报表 | project + workspace | `timesheet/` | `components/timesheets/` |
| milestone 里程碑 | 最轻量，1 个 model | project | `milestone/` | **无组件目录**，内联在路由页 |
| workflow 工作流审批 | 状态流转审批，**与 requirement 审批完全是两套机制** | project | `workflow/` | `components/project-workflows/` |
| changelog 更新公告 | 后端叫 changelog，**前端叫 releasenote** | instance 全局 | `changelog.py`（单文件） | `core/modules/releasenote/` |
| custom | 不是业务模块，是四个定制端点的杂物抽屉 | — | `custom/` | — |
| integrations 第三方集成 | 与外部系统的拉取 / 推送同步（目前 1 个：简道云项目代号 → 数据字典 `project_code`），设置页「开发者 → 第三方集成」 | workspace | `external_integration.py`（业务在 `plane/integrations/`） | `components/workspace/settings/integrations/` |

**三条一眼易错的命名/位置陷阱：**
- changelog（后端）= releasenote（前端），且前端在 `core/modules/` 而不是 `core/components/`。
- timesheet 的 service 在 `core/services/issue/timesheet.service.ts`，**不在 services 根目录**。
- QA 的 URL 里 `plan` 全部拼成了 `plane`（`test/plane/`、`test/plane-assignee/`），已是既成 API 契约，别"顺手修好"。

---

## requirement（需求）

后端全部集中在单文件 `apps/api/plane/db/models/requirement.py`（11 个 model + 10 个 TextChoices）。该文件顶部 118-153 行有一段权威设计注释，**改动前必读**。

### 六个核心概念

- **Requirement** — 需求条目本身，**就是唯一的可变副本**。没有影子表 / 工作副本表，人直接改它。三种归属共用一张表：`product` / `project` / `library` 三选一（CheckConstraint 强制）。
- **RequirementType** — 字段定义源，**工作区级**。条目通过外键实时引用字段定义；字段结构变更**立即生效、不走审批**。
  - **字段回收站（2026-08-28）= `RequirementField.is_active=false`**，没有独立的表或标记。编辑器里「移入回收站」只翻标志位（值原样留在 `Requirement.data`，所有录入/网格/详情面本来就过滤 `is_active`），「永久删除」才是从配置 PUT 里省略该字段 → 后端 `sync_requirement_type_fields` 清值 + 409 `REQUIREMENT_SCHEMA_DATA_LOSS` 确认。前端顺序不变量：停用根字段恒在 items 尾部、停用子字段恒在 children 尾部（`components/requirements/requirement-builder-items.ts`）。配置 GET/PUT 响应多带只读 `field_value_counts`（字段 id → 有非空值的需求数，`utils/requirement.py::count_requirement_field_values`）。后端字段同名校验把停用字段也算在内，前端保存前先查。
- **RequirementVersion** — 每条需求各自的版本链（v1, v2…），**只在审批通过时写入**。
- **approval** — **没有产品级的审批配置**（2026-08-25 改造，迁移 `0345` 删掉了 `RequirementApprovalPolicy` / `RequirementApprover`）。评审人名单与通过规则（`none` 无需评审 / `any` / `all` / `n_of_m`）由提交人在**每次提交评审时**给定，只对那一张变更单有效，直接落在 `RequirementChangeRequest.approval_type/required_count` 与 `RequirementChangeApproval` 行上。`none` 提交即通过（不建审批行、不锁行、不发通知，直接走 `_apply_approved_items`）。
- **change**（`RequirementChangeRequest` + `RequirementChangeItem`）— **唯一的审批载体**。一张单覆盖 1..N 条需求，同批通过 / 同批驳回。审批单位是**变更单**，不是条目。
- **baseline**（`RequirementBaseline` + `Entry`）— 一组 (需求, 版本) 的不可变命名快照，**语义等同 git tag**。没有状态、不参与审批、创建后内容不可改（只有 name/description 能改）。

### 两根正交的状态轴 —— 最容易搞混的地方

> 2026-08-17 改造：原先的三根轴（系统写的 `Requirement.status` + 每 (需求,项目) 一份的派生阶段 `RequirementProject.stage` + 审批态）合并成两根。派生引擎（`recalculate_stage` / 地板规则 / 降档锁 / 双轨制）、`RequirementProject.stage`、`RequirementProjectActivity` 全部删除（迁移 `0334`）。`docs/project-requirement-link-requirements.md` §决策 2 / §4.4 与 `docs/requirement-issue-requirements.md` 描述的是改造**之前**的模型，以本节为准。

**轴 A：`Requirement.status`（落库，需求级交付状态，跨项目共享一份，人工维护）**
五值：`not_started`(未开始) → `projected`(已立项) → `in_progress`(进行中) → `released`(已发布)；`closed`(已关闭) 在阶梯之外。

- **人工写**，任意方向可改。写入口两个，共用 `utils/requirement_project.py::set_requirement_status`（条件化 `.update()`，不 bump `version`、不碰 `approved_row_version`）：产品侧 `PATCH .../products/{pid}/requirements/{rid}/status/`（权限 `can_edit_product_requirements`）、项目侧 `PATCH .../projects/{pid}/requirements/{rid}/` 带 `{status}`（权限 `PROJECT_REQUIREMENT_LINK_MANAGE`）。同一条需求两侧权限不同：项目成员改了状态产品侧立刻可见（含置 closed 冻结产品成员的内容编辑，产品成员可重开）。
- **只有两条只升不降的自动推进**（`promote_on_project_link` / `promote_to_released` / `promote_on_release_completed`）：
  1. 需求被关联进项目 → `not_started → projected`（重复关联同一项目也算事件，曾人工降回 not_started 的会再升）；
  2. 发布单变为 `completed` → 该单关联需求 `not_started/projected/in_progress → released`；把需求补挂进一张已 completed 的发布单只推**本批**。
  发布单驳回/取消/删除/改回测试中、解除关联、删除项目、迭代任何变化、工作项任何变化——**一律不改状态**。重开后的需求也不会被补推（只在事件发生的那一刻推进一次）。
- **不算内容**（`NON_CONTENT_BUILTIN_COLUMNS`）：内容 PATCH / bulk-save 的写集合是 `CONTENT_BUILTIN_COLUMNS`，根本不写这一列；不进变更单 diff、不被回滚倒推；审批中的行也能改状态（两根轴正交）。
- **`closed`**：内容只读（后端 409 `REQUIREMENT_CLOSED`：内容 PATCH / bulk-save updates / 用户发起的回滚 / 提交**内容类**变更单 / 新指派为父项 / 新增迭代-发布-工作项关联），从迭代/发布/工作项关联选择器过滤（列表 `?exclude_closed=true`）。**项目关联是例外**：候选池 `linkable_requirements_queryset` 不设评审门槛也不排 closed，唯一排除条件是「已关联进本项目」（2026-08-24 放开，两个方向的写入口同步放开）。已有关联保留、解除关联仍允许。**closed 保护内容不保护删除**：草稿直删；已通过的走删除评审，delete 类型变更单不拦（含父项删除时展开出的 closed 后代）。in_review 行的内容写入命中 `REQUIREMENT_IN_REVIEW`（锁优先于 closed）。行上唯一可写的是 `status`：改成任意非 closed 值即重开，不存「关闭前状态」。组合矩阵：`draft+closed` 可直删、可重开；`in_review+closed` 审批通过后仍 closed、驳回还原内容 closed 保留；`modified+closed` 提不了评审也回滚不了，只能重开；`approved+closed` 直接申请删除，删除评审被驳回则行留在原状态。
- 标准库条目恒 `not_started`（`LIBRARY_HIDDEN_BUILTIN_COLUMNS`，不开状态写入口）；新建 / 导入恒 `not_started`。
- 统计口径：项目需求页分面 `facets.by_status`、产品「关联项目」`status_counts`（同一条需求进了几个项目就在几个 bucket 各计一次——需求级状态在"某个项目下"不再有独立含义）。需求 ↔ 工作项是**多对多**（`RequirementIssue` (requirement, issue) 复合唯一）：一条工作项分别计入它所挂每条需求的完成率（`issue_count / completed_issue_count / cancelled_issue_count` 按单条需求算，不重复）；产品「关联项目」的 `issue_total / issue_completed / issue_cancelled` 按 `issue_id` 去重，一条工作项挂同产品多条需求只算一个。

**轴 B：`Requirement.approval_state`（不落库，派生 property）**
由 `approved_version` / `approved_row_version` / `pending_change_item` 三列派生，判定按序：

1. `pending_change_item` 非空且 change_type=delete → `pending_deletion`
2. `pending_change_item` 非空 → `in_review`
3. `approved_version IS NULL` → `draft`
4. `version != approved_row_version` → `modified`（已通过后又改）
5. else → `approved`

> 设计动机（原注释）：「存成字符串就会多出第四个可以和这三列对不上的事实来源；派生则不可能不一致。」
> **不要试图把 approval_state 落库或缓存。**

关联表 `RequirementProject`（引用 + 项目内排序）/ `RequirementCycle` / `RequirementRelease` / `RequirementIssue` 只圈定范围、供工作项数与完成率统计，**不再是任何状态的事实来源**。

### 生命周期

```
新建 draft ──编辑自由──▶ 提交变更单 ──▶ pending_change_item 置位，行只读
                                          │
              ┌───────────────────────────┼──────────────────────┐
           reject                       cancel                通过规则
      清指针，内容原样                清指针，内容原样        _apply_approved_items:
   (revert=True 才退回上一版)                                 写 RequirementVersion
                                                             回填 approved_version
                                                             + approved_row_version
                                                             清 pending_change_item
                                                                  │
                                                      approved ──编辑──▶ modified ──▶ 再提交
                                                                  │
                                                              打基线 ──▶ BaselineEntry 引用该 Version
```

一句话概括审批的实现：**不是把工作副本物化回正式表，而是写一条版本行、改两个整数、清一个指针。**

### 必须记住的不变量与陷阱

- **「一条需求同时最多在一张待审单里」** 由 `Requirement.pending_change_item` 这个**单值外键**保证。不需要额外唯一索引，也不要在提交路径上加 EXISTS 查询。
- **不追随删除的表一律用裸 `UUIDField` 而非外键**（`requirement.py:150-153`）：`ChangeItem.target_id`、`Version.target_id`、`BaselineEntry.requirement_id`。原因是仓库的 `soft_delete_related_objects` 会把 PROTECT 当 CASCADE 处理。**新增需要活过需求删除的表时照此办理。**
- **提交时客户端只发指针不发快照**，服务端自己读当前行内容 —— 否则一个陈旧的网格可以用旧内容开出一张新单。
- **`change_type` 由服务端定**，客户端只能表达「我要删」的意图。
- 提交时写进单里的：`schema_revision`（字段结构快照）、`approval_type`/`required_count` 与 `RequirementChangeApproval` 行（**本次提交给定的**规则与名单，不是任何配置的快照）。评审人资格（产品成员 / 工作区管理员）在 `submit_change_request` 里查，产品侧与项目侧两个提单入口共用（409 `REQUIREMENT_APPROVER_INVALID`）；形状校验（none 不带名单、n_of_m 人数区间）在 `RequirementChangeApprovalSpecSerializer`。
- update 类型做字段级 diff，无实质变化的行直接跳过；全部无变化则删掉空单并抛 `REQUIREMENT_NO_CHANGES`。
- **回滚 `rollback_requirement_to_version()` 不是撤销审批**：版本链一条不动，`approved_version` 也不变，它只是一次写在活行上的**普通编辑**（`version += 1`）。只恢复内容列（`parent_id` 不回滚，避免 FK 悬挂）。恢复的 `data` 必须按**当前**字段结构裁剪（`prune_requirement_data_to_fields`）。
- **标准库条目是旁路**：`RequirementLibrary` 内的条目永不走审批（approval_state 永远 `draft`，status 恒 `not_started`），由 CheckConstraint `req_library_item_never_approved` 硬保证。
- 基线只收录 `approved_version` 非空的需求；评审中/已改动的按**上一个已通过版本**收录并标 `stale`；从未通过的 `skipped`。`collect_baseline_entries()` 不写库，**创建与 dry-run 预览共用同一份判定**。
- `compare_baselines()` 产出的 diff item 形状**与 RequirementChangeItem 一致**，前端 diff 组件可直接复用。
- **模型层 product / project 双作用域都建了约束，但 URL 层目前只暴露 product 作用域**的变更单 / 基线 / 配置入口。project 是模型预留，不要以为有对应 API。
- **作用域句柄是 `RequirementScopeHandle`**（`utils/requirement.py`，product / project 二选一），产品级的取号写锁就是 `Product` 行（`get_requirement_scope(for_update=True)` → `select_for_update`）。以前这两个角色由 policy 行兼任，别再找 `get_scoped_policy` / `can_manage_policy`。提交人可以把自己列为评审人（产品决策：既然有 `none`，限制自审没有实际防护意义）。

### 文件落点

| 层 | 路径 |
|---|---|
| Model | `apps/api/plane/db/models/requirement.py`（单文件集中，含关联表 `RequirementProject` / `RequirementCycle` / `RequirementRelease` / `RequirementIssue`），导出在 `__init__.py` |
| Views | `apps/api/plane/app/views/requirement/`：`base.py` / `row_base.py`（产品与库共享行读写基类） / `change.py`（变更单+版本+轨迹+基线+收件箱） / `type.py` / `library.py` / `library_item.py` / `mixins.py` / `project.py`（项目侧关联/排序） / `container.py`（迭代/发布关联需求） |
| Serializers | `serializers/requirement.py`(1222行) / `requirement_change.py` / `requirement_type.py` / `requirement_library.py` / `requirement_project.py` |
| Utils | `utils/requirement.py`(领域核心) / `requirement_change.py`(提交审批驳回撤回回滚) / `requirement_project.py`(项目侧关联 + 需求状态写入口与自动推进) / `requirement_baseline.py` / `requirement_schema.py` / `requirement_notification.py` |
| URLs | `apps/api/plane/app/urls/requirement.py` |
| 迁移 | `0302`–`0323`（`0319` drop baseline approval、`0320` 审批下沉到条目 是两次关键转向）、`0345`（删产品级审批配置，规则加 `none`） |
| 前端类型 | `packages/types/src/requirement.ts`、`requirement-type.ts` |
| 前端 service | `apps/web/core/services/requirement.service.ts`、`requirement-type.service.ts` |
| 前端 hook | `core/hooks/store/use-requirement-*.ts`、`use-product-requirements.ts`（**走局部 state，不进 MobX root store**） |
| 前端组件 | `core/components/requirements/`、`core/components/products/requirements/` |

---

## product（产品）

`db/models/product.py`。`Product` / `ProductMember` / `ProductRole` / `ProductMemberRole` / `ProductProject`。

- **workspace 级**，路由 `workspaces/<slug>/products/...`，**完全不经过 Project**。
- **字段（2026-08-26 扩展，迁移 `0347`）**：
  - `identifier`：需求编号前缀（`KF01A008-1`），后端语义不变；**前端 label 叫「开发编号」**（`workspace_products.fields.identifier`）。
  - `code` 产品代号：工作区内条件唯一 + 非空 CheckConstraint；迁移回填自 `name`；`Product.save()` 在 code 为空时回落 name（只为 ORM 直建/测试兜底，API 层必填）。
  - 6 个字典 FK `stage / category / status / hardware_level / structure_level / software_level` → `DataDictionaryItem`，`on_delete=RESTRICT`，**DB 可空 / API 必填**：存量产品迁移后为空，前端在编辑时强制补齐。`ProductSerializer.validate` 校验值属于本工作区且 `dictionary.key` 与字段对应（`PRODUCT_DICTIONARY_FIELD_KEYS`，错误码 `PRODUCT_DICTIONARY_ITEM_INVALID`）。
  - `start_date`（回填 `created_at` 日期）；`project_lead` / `test_lead`（`SET_NULL`，回填 owner，**只要求工作区活跃成员、不要求产品成员** —— 与 owner 不同）；可选 `model_number / external_model / o_phase_close_date / v_phase_close_date`；`reviewers` 沿用（私有产品可见性判定仍看它）。
  - 陷阱：必填字段在 serializer 里显式声明 `required=True`（模型列 `null=True`，不声明会被自动生成成可空）。**PATCH 可省略必填字段，但显式 `null` 会 400；PUT 现在必须带全。**
- 自带**一套平行于 Project 的成员与角色体系**（`ProductMember` + `ProductRole.permissions` JSON），**不复用** Plane 的 ProjectMember / WorkspaceMember 权限。改产品权限时不要去动原生权限体系。
- `ProductMember` 主键是 AutoField，不是 UUID。
- **product 和 project 之间没有直接外键**，但已有 `ProductProject` 关联表（`db/models/product.py`）表达「项目引用了哪些产品」——它是项目侧关联需求的候选池前提。`Project.product_type` 只是 CharField，与该关联表无关。两侧各有一个管理页：产品侧「关联项目」tab（`components/products/projects/`，`GET/POST .../products/{pid}/projects/`）、项目侧「产品」子菜单页（`/projects/{pid}/products`，`components/projects/products/`，`GET/POST .../projects/{pid}/products/`）；两个 list 都由 `utils/requirement_project.py` 的 `status_counts_by_project / status_counts_by_product` 喂需求数与状态分布，序列化器 `ProductProjectSerializer` 按 `context["status_counts_by"]` 取桶。项目需求页左栏只做产品筛选，不再有关联入口。
- **Project 在 2026-08-26 加了与 Product 同构的扩展字段**（迁移 `0348` 字段 + 回填、`0349` 约束）：`code` 项目代号（工作区内条件唯一 + 非空 check，回填自 `name`，`save()` 空时回落 name → identifier）；3 个字典 FK `business_unit / status / project_type` → `DataDictionaryItem`（`RESTRICT`，DB 可空 / API 上 status、project_type 必填、business_unit 选填；存量项目为空，前端编辑时强制补齐）；`product_manager` 研发产品经理（`SET_NULL`，回填自 `project_lead`，**只要求工作区活跃成员、不进 ProjectMember** —— 与会被加成管理员的 `project_lead` 不同）；`start_date / end_date`（回填为迁移当天）。`ProjectSerializer.validate` 校验字典值属于本工作区且 `dictionary.key` 对应（`PROJECT_DICTIONARY_FIELD_KEYS`）；错误码 `PROJECT_CODE_ALREADY_EXIST / PROJECT_DICTIONARY_ITEM_INVALID / PROJECT_PRODUCT_MANAGER_NOT_WORKSPACE_MEMBER / PROJECT_END_DATE_BEFORE_START_DATE`（完成日期不早于开始日期在 `validate()` 里查，PATCH 只带一个时与实例上的另一个比）。`product_manager` 值未变时不再查成员资格（PM 事后被移出工作区的项目仍可改其它字段）；迁移回填也只抄仍是活跃成员的 `project_lead`。只读 `*_detail` 由 `ProjectExtendedDetailMixin` 提供，挂在 `ProjectSerializer` 与 `ProjectListSerializer` 上；`ProjectViewSet.list()` 的 `.values()` 白名单只出裸 id。**`Project.product_type`（产品类型：电表/PLC…，CharField choices）与字典 `project_type`（项目类型：开拓/交付/预研/维护）是两个概念，都保留。** **2026-09-03：项目等级 `grade` 已彻底删除（迁移 `0354`）；`product_type` 后端保留但前端全部隐藏（创建 / 设置 / 列表 / 概览都不再展示）；项目封面前端不再展示（创建弹窗、设置页、卡片都无封面），后端 `cover_image` / `cover_image_asset` 字段保留。创建弹窗与设置页「通用」表单都是无分区的两列平铺，中段字段由 `components/project/form-fields/shared-fields.tsx` 的 `ProjectSharedFields` 共用。** **2026-09-03：项目代号 `code` 改为从系统字典 `project_code` 里选（迁移 `0355` 只建字典头、无预置值、不回填存量代号）。列仍是字符串，存的是字典值的 label 而非 id，所以不进 `PROJECT_DICTIONARY_FIELD_KEYS`、删字典值也不做引用检查；`validate_code` 在查重之后按 label 精确匹配（`is_project_code_in_dictionary`），值未变时不查，存量代号照旧可保存；错误码 `PROJECT_CODE_NOT_IN_DICTIONARY`。前端 `ProjectCodeField` 复用 `DictionaryItemSelect`（id ↔ label 换算，存量代号用 fallbackItem 原样显示），字典 key 走 `PROJECT_FORM_DICTIONARY_KEYS`（FK 三个 + code），测试用 `factories.project_code_label` 先把代号写进字典。**
- 产品导航有 5 个 tab（dashboard / requirements / plans / projects / releases，见 `components/products/navigation.ts`），**只有 requirements 是实装的**，其余渲染 `ProductFeaturePage` 空态占位。后端无对应模型。

## data_dictionary（数据字典）

`db/models/data_dictionary.py`：`DataDictionary`（字典头）+ `DataDictionaryItem`（字典值），都是 `BaseModel`、workspace 级。item 上冗余 `workspace` 由 `save()` 从 dictionary 传播；`sort_order` 追加式 `max+10000`（同 Label），拖拽排序前端算邻居中点后 PATCH。

- **10 个系统字典**（`is_system=True`，key 不可改、不可删，可改 name/description）：产品 6 个 `product_stage / product_category / product_status / product_hardware_level / product_structure_level / product_software_level`，项目 4 个 `project_business_unit / project_status / project_type / project_code`（`project_code` 无预置值，`Project.code` 是字符串列、按 label 引用它；值由第三方集成从简道云同步，只增不删，见 `## integrations`）。用户也可自建字典（key 规则 `^[a-z][a-z0-9_]{0,63}$`，创建后不可改）。
- **预置策略三段**：规格与幂等 `ensure_system_dictionaries(workspace)` 在 `utils/data_dictionary.py`（列表 / 创建接口每次先跑，只补缺失字典、不补值、不覆盖用户改动；用户已自建**同名**字典时系统字典的 name 加 `（key）` 后缀照建，见 `system_dictionary_name`）；迁移 `0346`（产品 6 个）/ `0348`（项目 3 个，seed 放在该迁移**最前**，反向时最后跑）/ `0355`（`project_code`）的 RunPython 给存量工作区 seed（**迁移内有规格副本，改规格要两处同步**）；没有 signal。测试跑 `--nomigrations`，所以 `tests/factories.py::product_required_payload / project_required_payload` 自己调 ensure。
- **删除语义（最容易踩）**：`soft_delete_related_objects` 把 RESTRICT/PROTECT 当 CASCADE 软删引用方，所以字典与字典值**只硬删**（模型 `delete()` 强制 `soft=False`）。删除前用 `Product.all_objects`（6 个 FK）与 `Project.all_objects`（3 个 FK，含模板项目与软删行）查引用（`is_item_in_use / is_dictionary_in_use`），被引用 409 `DATA_DICTIONARY_ITEM_IN_USE`；系统字典 409 `DATA_DICTIONARY_SYSTEM_PROTECTED`；DB 的 RESTRICT 兜并发。
- 权限：读写都是「活跃工作区成员」（复用 `views/requirement/type.py::is_workspace_member`）。
- 路由 `workspaces/<slug>/data-dictionaries/[<pk>/[items/[<pk>/]]]`；字段级错误码 `DATA_DICTIONARY_KEY_INVALID / _KEY_ALREADY_EXISTS / _NAME_ALREADY_EXISTS / _ITEM_ALREADY_EXISTS`。
- **颜色（2026-09-02）**：`DataDictionaryItem.color` 存预设色 key（`gray/red/orange/amber/green/teal/blue/indigo/purple/pink`，与 `packages/constants` 的 `DATA_DICTIONARY_COLOR_KEYS`、serializer 的同名常量一致）或 `#rrggbb` 小写，空串 = 未指定；非法值 400 `DATA_DICTIONARY_ITEM_COLOR_INVALID`。`DataDictionary.is_colored` 是字典级开关：关着时前端一律纯文本，开着时值渲染成「浅底 + 同色系深字」标签（未指定 = 灰）。`DataDictionaryItemLiteSerializer` 把 `color` 和 `dictionary.is_colored` 一起出给产品 / 项目的 `*_detail`，所以产品 / 项目 queryset 必须 `select_related("xxx__dictionary")`。前端统一走 `components/data-dictionaries/`（`resolveDictionaryItemColor` / `DictionaryValueTag` / `DictionaryColorDot`）；预设色的亮 / 暗值在 `apps/web/styles/globals.css` 的 `--dict-color-*`，自定义 hex 由 `.dict-color-custom` 按内联 h / s 派生；管理页色板在 `settings/data-dictionaries/dictionary-color-picker.tsx`（预设 + react-color `CustomPicker` 自定义取色）。
- 前端：`packages/types/src/data-dictionary.ts`（`EProductDictionaryKey`）、`core/services/data-dictionary.service.ts`、`core/hooks/store/use-data-dictionaries.ts`（局部 state，含乐观排序）、设置页 `settings/(workspace)/data-dictionaries/` + `components/workspace/settings/data-dictionaries/`；产品表单里的字典下拉在 `components/products/extended-fields/`（一次拉全部字典再分发给 6 个下拉）。

## integrations（第三方集成）

`apps/api/plane/integrations/`（纯 Python 包，无 models，不进 INSTALLED_APPS）：`base.py`（`IntegrationError` / `IntegrationSpec` / `run_integration` / 「上次同步」快照）、`jiandaoyun.py`（网关客户端）、`project_code.py`（简道云 `proj_no` → 字典 `project_code` 的同步 + `SPEC`）、`registry.py`（`INTEGRATIONS` 元组 + `describe_integration`）。**`__init__.py` 必须留空**：子模块 import 模型，包被导入时 apps 可能还没 ready。新增集成 = 新模块写一个 `IntegrationSpec`（`key / provider / direction pull|push / required_settings / run(workspace, actor) / target_dictionary_key / remote_info`）并追加到 `INTEGRATIONS`。

- **配置只走 env**（用户明确不要 InstanceConfiguration）：`settings/common.py` **与 `local_common.py` 两处**都有 `JIANDAOYUN_API_BASE_URL / JIANDAOYUN_API_TOKEN / JIANDAOYUN_APP_KEY / JIANDAOYUN_PROJECT_CODE_APP_ID / JIANDAOYUN_PROJECT_CODE_ENTRY_ID / JIANDAOYUN_TIMEOUT_SECONDS`；属性名 == env 名，`spec.missing_settings()` 直接回显给设置页。模板同步在 `apps/api/.env.example`、根 `.env.example`、`dev.env`、`apps/api/local.env`、两份 docker-compose 的 `x-public-env`（api / worker / beat 共用）。`load_dotenv` 不 override、runserver 不监听 `.env`，改完要重启。
- **简道云客户端**：`POST {base}/v5/app/entry/data/list`，`data_id` 游标分页；终止条件是「一页 < 100 条（官方上限）」而不是 `< PAGE_LIMIT(10000)`（网关若把 limit 钳到 100 会静默丢数据），另有游标不前进 / `MAX_PAGES=50` / 90s 总预算三道保护。`timeout=(5, JIANDAOYUN_TIMEOUT_SECONDS)`。上游 401/403 翻译成 `INTEGRATION_REMOTE_UNAUTHORIZED`（不透传 401，前端会当会话过期）。
- **同步语义（用户决定）**：只新增缺失 label，不删除、不改名；`normalize_labels` 做 strip / 去 NUL / 去空 / >255 跳过 / 按出现顺序去重，**不做大小写归一**（与字典唯一约束、`validate_label` 口径一致）。写入在 `transaction.atomic()` 内先 `ensure_system_dictionaries` 再 `select_for_update()` 锁字典头（并发串行化，`created` 才精确），`bulk_create(ignore_conflicts=True)` 且显式给 `workspace / sort_order / created_by_id`（绕过 `save()`）。HTTP 全在事务外。若工作区自建了 `key=project_code` 的字典，按 key 写进那本。汇总 `{remote_total, unique, created, existing, skipped_blank, skipped_too_long, local_only, pages}`。
- **快照不建表**（用户决定）：Redis cache `external_integration:last_sync:{workspace_id}:{key}`，`timeout=None`；`{status, finished_at, duration_ms, triggered_by{id,display_name}|null(定时), summary|null, error{code,detail}|null}`。未配置时抛 `INTEGRATION_NOT_CONFIGURED` 不写快照。
- 接口 `workspaces/<slug>/external-integrations/`（GET，`WORKSPACE_SETTINGS_VIEW`）与 `.../<key>/sync/`（POST，`WORKSPACE_SETTINGS_EDIT`，同步阻塞执行）。view 自己 catch `IntegrationError`（`BaseAPIView.handle_exception` 会把 requests 异常变成裸 500）：`ERROR_HTTP_STATUS` 映射 400 / 409 / 502 / 500，错误体 `{error, detail, missing_settings, integration}`（带回更新后的集成，前端就地刷新卡片）。Redis 防重入锁 `external_integration:lock:{ws}:{key}` 120s → 409 `INTEGRATION_SYNC_IN_PROGRESS`。
- 定时：`bgtasks/external_integration_sync_task.py::sync_external_integrations`（所有活跃工作区 × pull 型集成，逐个 `run_integration(spec, workspace)`，单个失败不中断），`CELERY_IMPORTS`（common 与 local_common 两处）+ `celery.py` beat `sync-external-integrations-daily`（UTC 21:00 = 北京 05:00）。
- 前端：`packages/types/src/external-integration.ts`、`core/services/external-integration.service.ts`、`core/hooks/store/use-external-integrations.ts`（局部 state；sync 失败体里的 `integration` 也就地替换）、页面 `settings/(workspace)/integrations/`（改写自上游遗留孤儿页，路由在 `app/routes/core.ts` 手动登记）、`components/workspace/settings/integrations/`。导航：`WORKSPACE_SETTINGS.integrations`（`permissionKeys: [workspace.settings.view]`）挂在已有的 `DEVELOPER` 分类下（与 webhooks 并列）；tab key 加进 `TWorkspaceSettingsTabs` 与 `sidebar/item-icon.tsx`（`Record<TWorkspaceSettingsTabs, …>` 漏了会 TS 报错）。已知集成的名称 / 描述走 i18n `workspace_settings.settings.integrations.catalog.<key>`，未知 key 回落后端文案。
- 域名 `gw-api.kaifametering.com` 解析到公网 IP 171.221.252.161，服务器网段到它的 8045 被防火墙丢包（80 通、8045 SYN 无响应）；网关内网地址 `10.32.232.60:8045` 可直连、不依赖 Host 头，`JIANDAOYUN_API_BASE_URL` 一律填内网地址。网关接受 `limit: 10000`（2026-09-03 实测 1053 条一页返回，第二页空）。离线验证 monkeypatch `plane.integrations.jiandaoyun.requests.post`。上游遗留的 `core/services/integrations/`、`core/components/integration/`、后端 `Integration` 模型与本模块无关，未动。

## release（发布）

`db/models/release.py`（344 行，全部 `ProjectBaseModel`）。

- **project 级**。整套是原生 `Cycle` 的克隆放大版：`ReleaseIssue` / `ReleaseMember` / `ReleaseLink` / `ReleaseUserProperties` / `ReleaseActivity` 一一对应 Cycle 的同名结构。本质是 project 下与 Cycle、Module 平级的第三种聚合容器。
- 特有：`test_handoff_date`（提测日）、`ReleaseOverdueRecord`（延期留痕，带 phase / trigger 枚举 + `snapshot_owner`）。
- `ReleaseComment` 支持 parent 自引用做楼中楼；`ReleaseActivity` 结构对齐 IssueActivity，系统触发时 actor 可空。
- 前端 release 域**走 MobX root store**（`core/store/release*.store.ts`）。

## qa（测试）

`db/models/qa.py`（668 行，16 个 model，全部 `BaseModel` 而非 `ProjectBaseModel`）。

**作用域是混合的，这是最容易搞错的点：**
- 用例侧（`TestCaseRepository` / `CaseModule` / `CaseLabel` / `TestCase`）走 **workspace 级**路由 `workspaces/<slug>/test/...`，且 `TestCaseRepository.project` **可为 null** —— 允许跨项目共享用例库。
- 计划 / 评审 / 报告走 **project 级**路由 `workspaces/<slug>/projects/<pid>/test/{case,plane,review,report}/`。

结构分四块：
- 用例：`TestCaseRepository`（根容器）→ `CaseModule`（目录树）/ `CaseLabel` → `TestCase` → `TestCaseVersion` / `TestCaseComment` / `TestCaseActivity`
- 计划执行：`PlanModule` → `TestPlan` →（through `PlanCase`）→ `PlanCaseRecord`（单次执行记录）
- 评审：`CaseReviewModule` → `CaseReview` →（through `CaseReviewThrough`）→ `CaseReviewRecord`
- 报告：`TestReport`，M2M plans，**统计实时算不落库**

`TestPlan` 是挂钩原生概念最密集的地方：一对一 FK `cycle`，M2M `modules`（原生 Module）、M2M `releases`。`TestCase.issues` 和 `PlanCase.issue` 双向连到 Issue。

## timesheet（工时）

`db/models/timesheet.py`（367 行）。`TimesheetCategory`（字典表，7 个预置 key）+ `TimeSheet`。

挂靠规则全写在 `clean()` 里，改之前先读：
- `issue` 与 `test_case` **至多填一个**（有 CheckConstraint 兜底），具体哪个必填由 `category.key` 决定。
- `project` 由 issue / test_case 自动回填。
- 同一成员同一天**时间段不可重叠**；只允许填报本月和上月。
- ⚠️ `ISSUE_TYPE_NAME_TO_CATEGORY_KEY` 按 `IssueType.name` 的**中文名**（史诗/特性/用户故事/任务/缺陷）路由到子类别。这是硬编码的中文字符串耦合 —— **重命名 issue type 会让工时归类静默回落到通用 ISSUE**。

## milestone（里程碑）

`db/models/milestone.py`（仅 77 行，1 个 model）。project 级，M2M 到 Issue，不碰 Cycle/Module/State。

- `state` 用**中文字符串作为枚举 value 直接落库**（`未开始/进行中/延期/已完成`），且 `TextChoices` 的 label 位被挪用来存颜色名（`'未开始', 'gray'`）。
- `update_state()` 按 start_date / end_date 自动推算状态，「已完成」**不可逆**。
- 前端**没有 components 目录**（`components/milestone/` 是空的），页面和弹窗全部内联在 `app/.../[projectId]/milestones/` 下。

## workflow（工作流审批）

`db/models/workflow.py`（510 行）。**与 requirement 的审批是两套完全独立的机制，不要互相参照实现。**

- 配置侧：`Workflow`（project + issue_type 维度，同组合同时只允许一个激活）→ `WorkflowTransition`（`from_state → to_state`，from_state 为 null 表示初始流转）→ `WorkflowTransitionPrincipal`（`dimension` initiator/assignee/approver × `kind` member/role/dynamic，三列恰好一列有值）+ `WorkflowTransitionRequiredField`。
- 运行侧：`IssueTransitionRecord`（无审批人时直接 approved 落状态，有审批人时 pending）→ `IssueTransitionApprovalRecord`。
- **对上游代码侵入性最强的模块** —— 它给原生的「随便改 state」加了一层审批闸门，会拦截原生写路径。
- ⚠️ `WorkflowTransitionRequiredField.workflow` 字段名有误导，它实际指向的是 `WorkflowTransition`。
- 详细改动指引见 `apps/api/plane/app/views/workflow/AGENTS.md`（自动加载）和 `plane-workflow-approval-e2e` skill。

## changelog / releasenote（更新公告）

- Model **不在 `db/models/`**，在 `plane/license/models/instance.py:86`：`ChangeLog` + `ChangeLogRead`。
- **instance 全局级**，无 workspace / project 外键。URL 是 `/api/changelog/`，没有 workspace 前缀。写权限靠 `InstanceAdmin` 判定。
- 前端叫 releasenote，在 `core/modules/releasenote/`（自成一个 module）。另有原生残留 `components/global/product-updates/`（上游的 GitHub releases 弹窗），别搞混。
- 生成公告内容见 `plane-release-changelog-format` skill。

## custom（杂物抽屉）

不是业务模块，无自己的 model，四个互不相关的定制端点：
- `project_analytics.py`（693 行）— 覆盖上游的项目高级分析 + 缺陷分析
- `ldap_sync.py` — LDAP 用户同步（配套 `db/models/ldap.py`）
- `no_auth_bug_export.py`（472 行）— ⚠️ **免鉴权**的缺陷报表导出，走 `app/urls/no_auth.py` 单独注册。改动前留意安全边界。
- `simple_api.py` — 探活 / 调试

---

## 模块间关系

```
Product (workspace 级，与 Project 无 FK)
  ├─FK×6(RESTRICT)── DataDictionaryItem ──FK── DataDictionary   （阶段/类别/状态/三个研发等级）
  └─FK── Requirement / ChangeRequest / Baseline / Version
              （requirement 的 product | project | library 三选一作用域）

Project (原生)
  ├─FK×3(RESTRICT)── DataDictionaryItem                （所属BU/项目状态/项目类型，0348）
  ├─FK(SET_NULL)── User (product_manager，不进 ProjectMember)
  ├── Release ──ReleaseIssue── Issue
  ├── Milestone ──M2M── Issue                     （完全孤立，不连 Release/Cycle/baseline）
  ├── TimeSheet ──FK── Issue | TestCase           （二选一，由 category 决定）
  ├── TestPlan ──FK── Cycle
  │      ├──M2M── Module (原生)
  │      └──M2M── Release                         ← QA 与 release 唯一的直接关联
  ├── TestCase ──M2M── Issue                      （用例覆盖工作项）
  │   PlanCase ──M2M── Issue                      （执行中提出的缺陷）
  └── Workflow ──FK── IssueType，Transition ──FK── State，审批人 ──FK── ProjectRole
      IssueTransitionRecord ──FK── Issue
```

**已知的断链（不要以为有关联而去找）：**
- 需求 ↔ Cycle / Release / Issue 已由 `RequirementCycle` / `RequirementRelease` / `RequirementIssue` 关联表打通，但它们只圈定范围、供计数，不派生需求状态（见 requirement 节轴 A）。`RequirementBaseline` 的 docstring 说它「用于发版留痕」，但与 Release 表仍无外键关系，只能人工对应。
- **product 和 project 之间没有直接外键**，关系走 `ProductProject` 关联表（见上）。
- milestone 与除 Issue / Project 外的一切无关联。
- 数据字典被 Product（6 个 FK）与 Project（3 个 FK）引用，与 requirement / issue 无关联。
- changelog 与所有模块零关联。

---

## 前端接线约定（apps/web）

### service
- 一律 `export class XxxService extends APIService`（`core/services/api.service.ts`），构造 `super(API_BASE_URL)`。
- **service 文件里不导出单例**，只导出 class；调用方在模块作用域 `const xxxService = new XxxService()`。
- 方法固定 `.then(res => res?.data).catch(err => { throw err?.response?.data })`。
- 通用领域类型放 `@plane/types`；局部请求/响应类型就地导出（qa、timesheet 就是这么干的）。

### 状态：两条路线并存，不要硬套
- **走 MobX root store**：release 域、test-case 域。`core/store/xxx.store.ts` → 在 `core/store/root.store.ts` constructor 注册 → `core/hooks/store/use-xxx.ts` 用 `useContext(StoreContext)` 取。
- **走局部 state hook**：requirements / products / timesheets / workflow。直接在 hook 里 `new XxxService()` + `useState` 维护 `list / isLoading / isMutating / error`。
- **自研模块没有「必须进 root store」的规定**，跟随目标模块现有路线即可。

### 路由 —— 这是 React Router v7 framework mode，不是 Next.js
- 目录里的括号分组 `(all)` / `(projects)` / `(detail)` **只是组织习惯，不参与 URL 推导**。
- 路由是**显式配置**的：`app/routes.ts` → `app/routes/core.ts`（`layout()` / `route()` / `index()` 嵌套）。
- **新增页面必须手动在 `app/routes/core.ts` 里追加一条，否则页面不生效。** 只建 `page.tsx` 没用。
- 参考写法：`routes/core.ts` 中 products(112-146) / timesheets(180-183) / 项目需求(217-220) / releases(277-292) / testhub(363-401)。

### packages/types
- 单一 barrel `src/index.ts`，全部 `export *`，消费方一律从 `@plane/types` 平铺引入。
- 主实体单文件 `requirement.ts`；元模型独立成 `xxx-type.ts`；多实体域拆目录（`release/`、`test-case/`）。
- 顶层单文件用**连字符**（`requirement-type.ts`），目录内文件用**下划线**（`release_activity.ts`）。
- 类型前缀统一 `T`（`TRequirementType`、`TCreateXxxPayload` / `TUpdateXxxPayload` / `TXxxsResponse`）；少量老代码用 `I`。
- **新增域必须在 `src/index.ts` 补 `export * from "./xxx"`**，否则 `@plane/types` 取不到。
