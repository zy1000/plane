# 领域词汇表（自研模块）

> **给 AI 的前置说明**：本仓库是 Plane 的 fork。下面这些模块**上游 Plane 完全不存在**，对 "Plane" 的通用认知在这里一律不适用，不要拿上游的 Issue/Cycle/Module 心智去套。动这些模块前先读本文对应小节。
>
> 原生概念（workspace / project / issue(work item) / cycle / module / view / page / state）见 `AGENTS.md` 的 Common Terms。

## 模块总览

| 模块 | 一句话 | 作用域 | 后端 views | 前端 |
|---|---|---|---|---|
| requirement 需求 | 类型化字段 + 版本 + 变更单 + 审批 + 基线 | product / project / library | `requirement/` | `components/requirements/` |
| product 产品 | 需求的顶层容器，**与 project 无外键关系** | workspace | `product/` | `components/products/` |
| release 发布 | 发布单，Cycle 的克隆放大版 | project | `release/` | `components/releases/` |
| qa 测试 | TestHub：用例/计划/执行/评审/报表（体量最大） | 混合，见下 | `qa/` | `components/qa/` |
| timesheet 工时 | 工时填报与报表 | project + workspace | `timesheet/` | `components/timesheets/` |
| milestone 里程碑 | 最轻量，1 个 model | project | `milestone/` | **无组件目录**，内联在路由页 |
| workflow 工作流审批 | 状态流转审批，**与 requirement 审批完全是两套机制** | project | `workflow/` | `components/project-workflows/` |
| changelog 更新公告 | 后端叫 changelog，**前端叫 releasenote** | instance 全局 | `changelog.py`（单文件） | `core/modules/releasenote/` |
| custom | 不是业务模块，是四个定制端点的杂物抽屉 | — | `custom/` | — |

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
- **RequirementVersion** — 每条需求各自的版本链（v1, v2…），**只在审批通过时写入**。
- **approval** — `RequirementApprovalPolicy`（规则：any / all / n_of_m）+ `RequirementApprover`（名单）。Policy 只管规则，**不持有状态**，每作用域唯一一条、惰性创建。
- **change**（`RequirementChangeRequest` + `RequirementChangeItem`）— **唯一的审批载体**。一张单覆盖 1..N 条需求，同批通过 / 同批驳回。审批单位是**变更单**，不是条目。
- **baseline**（`RequirementBaseline` + `Entry`）— 一组 (需求, 版本) 的不可变命名快照，**语义等同 git tag**。没有状态、不参与审批、创建后内容不可改（只有 name/description 能改）。

### 三根正交的状态轴 —— 最容易搞混的地方

**轴 A：`Requirement.status`（落库，交付进度）**
`draft → confirmed → (implemented | obsolete)`
- 整列**只由系统写**，写序列化器根本不收它。
- 首次审批通过时置 `confirmed`，此后回不到 draft（CheckConstraint `req_draft_status_iff_never_approved` 钉死）。
- `implemented` **对称派生**（`utils/requirement_project.py::recalculate_requirement_status`）：所有关联项目的 `RequirementProject.stage` 均为 `released` 且至少有一条关联行 → 置 `implemented`；条件失效 → 退回 `confirmed`。零关联行的需求不参与判定。`obsolete` 仍是人为动作，不派生。
- `status` 不算内容，不触发评审、不被回滚倒推。

**轴 B：`Requirement.approval_state`（不落库，派生 property，`requirement.py:667`）**
由 `approved_version` / `approved_row_version` / `pending_change_item` 三列派生，判定按序：

1. `pending_change_item` 非空且 change_type=delete → `pending_deletion`
2. `pending_change_item` 非空 → `in_review`
3. `approved_version IS NULL` → `draft`
4. `version != approved_row_version` → `modified`（已通过后又改）
5. else → `approved`

> 设计动机（原注释）：「存成字符串就会多出第四个可以和这三列对不上的事实来源；派生则不可能不一致。」
> **不要试图把 approval_state 落库或缓存。**

**轴 C：`RequirementProject.stage`（落库在关联行上，每 (需求, 项目) 一份，纯关联事实派生）**
阶梯 `linked`(已立项) → `planned`(已排期) → `pending_verification`(待验证) → `released`(已发布)，按现存有效事实取最高档重算（`recalculate_stage`）；`in_progress` / `done` 枚举保留给工作项派生（P3）。零关联行时前端展示「未开始」，不落库。

| 事实 | 阶段 |
|---|---|
| 关联到项目 | `linked` |
| 关联该项目未取消的迭代（`RequirementCycle`） | `planned` |
| 关联该项目在途发布单（`RequirementRelease`，未拒绝/终止） | `pending_verification` |
| 关联的发布单已发布 | `released` |

- **手动改 stage 已退役**：项目侧 PATCH 只收 `sort_order`，payload 带 stage 报 400 `REQUIREMENT_STAGE_DERIVED`。
- 迭代完成不改阶段（时间盒到期不是进度事实，列表注解 `carryover` 做 UI 标记）；降档留痕写 `RequirementProjectActivity`。
- 与轴 A 的唯一联动即上面 `implemented` 的对称派生；需求阶段**永不**进入迭代/发布状态流转的门槛条件（只做软提示）。
- 完整规则见 `docs/project-requirement-link-requirements.md` §4.4。

### 生命周期

```
新建 draft ──编辑自由──▶ 提交变更单 ──▶ pending_change_item 置位，行只读
                                          │
              ┌───────────────────────────┼──────────────────────┐
           reject                       cancel                通过规则
      清指针，内容原样                清指针，内容原样        _apply_approved_items:
   (revert=True 才退回上一版)                                 draft→confirmed
                                                             写 RequirementVersion
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
- 提交时冻结三样东西进单：`schema_revision`（字段结构）、`approval_type`/`required_count`（规则快照）、`RequirementChangeApproval` 行（名单快照）。**在途的单不受后续配置修改影响。**
- update 类型做字段级 diff，无实质变化的行直接跳过；全部无变化则删掉空单并抛 `REQUIREMENT_NO_CHANGES`。
- **回滚 `rollback_requirement_to_version()` 不是撤销审批**：版本链一条不动，`approved_version` 也不变，它只是一次写在活行上的**普通编辑**（`version += 1`）。只恢复内容列（`parent_id` 不回滚，避免 FK 悬挂）。恢复的 `data` 必须按**当前**字段结构裁剪（`prune_requirement_data_to_fields`）。
- **标准库条目是旁路**：`RequirementLibrary` 内的条目永不走审批，永远停在 `draft`，由 CheckConstraint `req_library_item_never_approved` 硬保证。
- 基线只收录 `approved_version` 非空的需求；评审中/已改动的按**上一个已通过版本**收录并标 `stale`；从未通过的 `skipped`。`collect_baseline_entries()` 不写库，**创建与 dry-run 预览共用同一份判定**。
- `compare_baselines()` 产出的 diff item 形状**与 RequirementChangeItem 一致**，前端 diff 组件可直接复用。
- **模型层 product / project 双作用域都建了约束，但 URL 层目前只暴露 product 作用域**的变更单 / 基线 / 配置入口。project 是模型预留，不要以为有对应 API。
- `can_manage_policy` 权限**比写权限更窄**（`views/requirement/mixins.py`），防止提交者自改审批人。

### 文件落点

| 层 | 路径 |
|---|---|
| Model | `apps/api/plane/db/models/requirement.py`（单文件集中，含关联表 `RequirementProject` / `RequirementCycle` / `RequirementRelease` 与阶段留痕表 `RequirementProjectActivity`），导出在 `__init__.py` |
| Views | `apps/api/plane/app/views/requirement/`：`base.py` / `row_base.py`（产品与库共享行读写基类） / `change.py`（变更单+版本+轨迹+基线+收件箱） / `type.py` / `library.py` / `library_item.py` / `mixins.py` / `project.py`（项目侧关联/排序） / `container.py`（迭代/发布关联需求） |
| Serializers | `serializers/requirement.py`(1222行) / `requirement_change.py` / `requirement_type.py` / `requirement_library.py` / `requirement_project.py` |
| Utils | `utils/requirement.py`(领域核心) / `requirement_change.py`(提交审批驳回撤回回滚) / `requirement_project.py`(阶段重算 + status 对称回写) / `requirement_baseline.py` / `requirement_schema.py` / `requirement_notification.py` |
| URLs | `apps/api/plane/app/urls/requirement.py` |
| 迁移 | `0302`–`0323`（`0319` drop baseline approval、`0320` 审批下沉到条目 是两次关键转向） |
| 前端类型 | `packages/types/src/requirement.ts`、`requirement-type.ts` |
| 前端 service | `apps/web/core/services/requirement.service.ts`、`requirement-type.service.ts` |
| 前端 hook | `core/hooks/store/use-requirement-*.ts`、`use-product-requirements.ts`（**走局部 state，不进 MobX root store**） |
| 前端组件 | `core/components/requirements/`、`core/components/products/requirements/` |

---

## product（产品）

`db/models/product.py`（140 行）。`Product` / `ProductMember` / `ProductRole` / `ProductMemberRole`。

- **workspace 级**，路由 `workspaces/<slug>/products/...`，**完全不经过 Project**。
- 自带**一套平行于 Project 的成员与角色体系**（`ProductMember` + `ProductRole.permissions` JSON），**不复用** Plane 的 ProjectMember / WorkspaceMember 权限。改产品权限时不要去动原生权限体系。
- `ProductMember` 主键是 AutoField，不是 UUID。
- **product 和 project 之间没有直接外键**，但已有 `ProductProject` 关联表（`db/models/product.py`）表达「项目引用了哪些产品」——它是项目侧关联需求的候选池前提。`Project.product_type` 只是 CharField，与该关联表无关。
- 产品导航有 5 个 tab（dashboard / requirements / plans / projects / releases，见 `components/products/navigation.ts`），**只有 requirements 是实装的**，其余渲染 `ProductFeaturePage` 空态占位。后端无对应模型。

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
  └─FK── Requirement / ChangeRequest / Baseline / Version
              （requirement 的 product | project | library 三选一作用域）

Project (原生)
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
- **需求 ↔ Issue 仍无关联**（工作项派生留给 P3，`requirement.py` 里 grep 不到 Issue / Module）。需求 ↔ Cycle / Release 已由 `RequirementCycle` / `RequirementRelease` 关联表打通，驱动 `RequirementProject.stage` 推导（见 requirement 节轴 C）。`RequirementBaseline` 的 docstring 说它「用于发版留痕」，但与 Release 表仍无外键关系，只能人工对应。
- **product 和 project 之间没有直接外键**，关系走 `ProductProject` 关联表（见上）。
- milestone 与除 Issue / Project 外的一切无关联。
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
