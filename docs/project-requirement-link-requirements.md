# 需求进入项目（项目 ↔ 需求关联）需求说明

## 1. 背景

目前「需求（Requirement）」只存在于 **产品（Product）** 作用域：创建、字段结构、变更单、审批、版本、基线全部闭环在 `workspaces/<slug>/products/<product_id>/...` 之下。

`docs/domain-glossary.md:216` 记录的断链至今成立：

> 需求既不能关联 Issue 也不能关联 Release，**需求到交付之间缺一环**。

本次改造补上这一环：让产品里已评审通过的需求能够**被项目引用**，在项目里可见、可跟踪交付进度、可发起变更，从而打通「产品定义需求 → 项目交付需求」的链路。

对标参考：禅道（ZenTao）的 `产品 → 需求 → 项目关联（zt_projectstory）→ 迭代 → 任务` 模型。本文档在其基础上修正了禅道的一个已知设计缺陷（阶段字段存在需求本体上，无法表达同一需求在不同项目里进度不同）。

---

## 2. 设计决策（已拍板）

### 决策 1：新建关联表，**不复用** `Requirement.project_id`

`Requirement` 上虽有 `project` 外键，但它是**排他归属**，由 CheckConstraint 钉死（`apps/api/plane/db/models/requirement.py:661`）：

```python
name="requirement_owner_exactly_one"   # product / project / library 三选一
```

用它做「需求进项目」会踩四个雷：

| 雷 | 说明 |
|---|---|
| 编号会变 | `req_unique_product_sequence` 刻意不带 `deleted_at` 条件（`requirement.py:704`），编号永不复用。搬作用域必须重新取号，`PRD-001` 变成别的号 |
| 历史分裂 | `RequirementVersion`(`:1139`) / `RequirementBaseline`(`:1221`) / `RequirementChangeRequest`(`:917`) 各自有 product/project 二选一约束，搬家后历史行作用域与活行不一致 |
| 审批人换人 | `RequirementApprovalPolicy` 按作用域唯一，搬过去等于换了一套审批名单 |
| 语义不对 | 一条需求可以同时被多个项目引用（禅道实测：同一条需求同时属于两个项目）。归属唯一，引用多个 |

**结论：`Requirement.project` 这条腿原样休眠不动**（它是「项目自建需求」的预留，与本次无关），项目侧一律走新建的关联表。

### 决策 2：阶段（stage）放在关联行上，不放在需求本体上

禅道把 `stage` 存在 `zt_story` 上，导致同一条需求在 A 项目已发布、B 项目还没开工时一个字段存不下。本次改为两层：

```
Requirement.status                  全局 / 粗粒度 / 枚举不变（4 值）
  draft → confirmed ⇄ implemented；obsolete 留给 P4 的人为关闭
  implemented 由「所有关联项目 stage 均为 released」对称回写（§4.4）

RequirementProject.stage            每个 (需求, 项目) 一份 / 细粒度
  linked → planned → pending_verification → released（关联事实驱动，§4.4）
  in_progress / done 两档保留给 P3 工作项派生
```

好处：不碰 `req_draft_status_iff_never_approved` 约束（`requirement.py:676`）、阶段列纯派生无第二事实来源。

> `Requirement.status` 的 `implemented` 已由 `recalculate_requirement_status` 对称派生（本次落地）；`obsolete` 仍无人可写，留给「需求关闭」（P4）。

### 决策 3：候选池只放已通过评审的需求

只有 `approved_version IS NOT NULL`（即 `approval_state ∈ {approved, modified}`）的需求可以被项目关联。未过评审的需求不进入交付链路。

副作用（正向）：因为被关联的需求必然有 `approved_version`，所以后续把 `status` 置为 `implemented` 不会违反 `req_draft_status_iff_never_approved` 约束。

### 决策 4：项目侧对需求**只读 + 可发起变更单**

Product 有一套独立的成员/角色体系（`ProductMember` + `ProductRole`），**完全不复用** `ProjectMember`。项目成员通常不是产品成员。

| 能力 | 项目成员 | 说明 |
|---|---|---|
| 查看关联进本项目的需求全文 | ✅ | 含自定义字段、附件、版本、变更轨迹 |
| 查看未关联的需求 | ❌ | 候选池只在「关联」弹窗里出现，且只给有 manage 权限的人 |
| 改 title / description / 自定义字段 | ❌ | 需求内容的唯一权威在产品 |
| 改 assignee / 日期 / priority | ❌ | 本期一并只读，避免两套写路径 |
| 改 `RequirementProject.stage` | ✅ | 这是项目自己的数据 |
| 发起变更单 | ✅ | 走产品现有的 `submit_change_request()`，但需要新的授权入口（见 6.2） |
| 评审 / 撤销评审 / 打基线 | ❌ | 产品侧专属，项目页不出现入口 |
| 关联 / 解除关联 | ✅ | 需 manage 权限 |

### 决策 5：新功能接管 `/projects/:projectId/requirements`

该 URL 目前被「按 issue type 类别 = `需求` 过滤的工作项列表」占用。那个页面**本质是工作项视图**，把 `requirements` 这个词让给真正的需求实体，语义更正。旧视图迁到 `/projects/:projectId/dev-requirements`（对应禅道的「研发需求」）。

详见 7.1，**这是本次改动风险最集中的地方**。

---

## 3. 现状盘点

### 3.1 可直接复用（不重建）

| 能力 | 落点 |
|---|---|
| 需求实体、字段结构、审批、版本、基线 | `apps/api/plane/db/models/requirement.py`（11 个 model） |
| 变更单提交/审批/驳回/撤回 | `apps/api/plane/utils/requirement_change.py` |
| 多对多中间表范式 | `ModuleIssue`(`module.py:148`)、`CycleIssue`(`cycle.py:247`) |
| 双向批量关联 API 范式 | `views/module/issue.py:207`（一个模块加多个工作项）、`:247`（一个工作项改多个模块） |
| 关联 id 数组回传范式 | `utils/grouper.py:63-96` 的 `ArrayAgg` 子查询 |
| 「选已有条目」弹窗 | `apps/web/core/components/core/modals/existing-issues-list-modal.tsx`（支持注入自定义搜索回调） |
| 多选 diff 范式 | `apps/web/core/components/issues/issue-detail/module-select.tsx:43-63`（`xor()` 求差集） |
| 需求网格 / 详情 / 轨迹 / 版本组件 | `apps/web/core/components/requirements/**`（已按 `entityKind` 做了作用域抽象） |

### 3.2 需要新增

| 项 | 类型 |
|---|---|
| `ProductProject` 关联表 | 新增模型 + migration |
| `RequirementProject` 关联表（含 `stage`） | 新增模型 + migration |
| 项目侧需求关联 API（双向批量） | 新增 view + url |
| 项目侧发起变更单的授权入口 | 新增 view + 权限函数 |
| 权限 key `project.requirement_link.view/manage` | 新增 |
| `entityKind` 扩展 `"project"` | 前端改造 |
| `RequirementService` 作用域化 | 前端改造 |
| `useProjectRequirements` hook | 新增 |
| 项目需求列表页 + 关联弹窗 | 新增 |
| 旧「研发需求」视图迁移到 `/dev-requirements` | 改造 |

### 3.3 考古警告

`apps/api/plane/db/migrations/__pycache__/` 里残留下列 `.pyc`，但对应 `.py` **已不存在**：

- `0294_product_productproject_product_projects_and_more`
- `0295_product_issue_scope`
- `0297_add_product_work_item_relations_and_preferences`

说明「产品↔项目关系」「产品工作项」这套东西**以前实现过又被整体回退**。开工前先确认当时回退的原因，如与本方案冲突需先调整。

---

## 4. 数据模型

当前迁移 leaf 为 `0326`，新增迁移从 `0327` 起。

### 4.1 `ProductProject` — 产品 ↔ 项目

放在 `apps/api/plane/db/models/product.py`。完全照抄 `ModuleIssue` 配方。

```python
class ProductProject(ProjectBaseModel):
    """产品与项目的关联。项目通过它确定自己能引用哪些产品的需求。"""

    product = models.ForeignKey(
        "db.Product", on_delete=models.CASCADE, related_name="product_projects", verbose_name="所属产品"
    )
    # project / workspace 由 ProjectBaseModel 提供

    class Meta:
        unique_together = ["product", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_project_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Product Project"
        verbose_name_plural = "Product Projects"
        db_table = "product_projects"
        ordering = ("-created_at",)
```

### 4.2 `RequirementProject` — 需求 ↔ 项目

放在 `apps/api/plane/db/models/requirement.py`（该模块所有 model 集中在单文件，遵循现状）。

```python
class RequirementProjectStage(models.TextChoices):
    """需求在某个项目内的交付阶段。与 Requirement.status（全局）正交。"""

    LINKED      = "linked",      "已立项"
    PLANNED     = "planned",     "已排期"
    IN_PROGRESS = "in_progress", "研发中"
    DONE        = "done",        "研发完毕"
    RELEASED    = "released",    "已发布"


class RequirementProject(ProjectBaseModel):
    """需求被项目引用的关联行。需求本体仍归属产品，此表只表达引用关系与项目内进度。"""

    requirement = models.ForeignKey(
        Requirement, on_delete=models.CASCADE, related_name="requirement_projects", verbose_name="关联需求"
    )
    stage = models.CharField(
        max_length=20,
        choices=RequirementProjectStage.choices,
        default=RequirementProjectStage.LINKED,
        db_index=True,
        verbose_name="项目内阶段",
    )
    sort_order = models.FloatField(default=65535, verbose_name="项目内排序")

    class Meta:
        unique_together = ["requirement", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="requirement_project_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Requirement Project"
        verbose_name_plural = "Requirement Projects"
        db_table = "requirement_projects"
        ordering = ("sort_order",)
```

导出：两个新模型都要补进 `apps/api/plane/db/models/__init__.py`（requirement 的导出块在 `:148-172`）。

### 4.3 `RequirementIssue` — 需求 ↔ 工作项（P3，本期不做，先定型）

```python
class RequirementIssue(ProjectBaseModel):
    """需求在项目里拆分出的工作项。stage 的自动推导依赖它。"""

    requirement = models.ForeignKey(Requirement, on_delete=models.CASCADE, related_name="requirement_issues")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="issue_requirements")

    class Meta:
        unique_together = ["requirement", "issue", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "issue"],
                condition=models.Q(deleted_at__isnull=True),
                name="requirement_issue_unique_when_deleted_at_null",
            )
        ]
        db_table = "requirement_issues"
```

### 4.4 关联驱动的阶段推导（已实装）

> 原方案把推导排在 P3（依赖尚不存在的需求↔工作项关联）。现已改为**纯关联事实驱动**：所有触发点（关联迭代/发布、发布单状态流转）都是显式人为动作，不依赖工作项即可全自动，本期已落地。工作项派生延后到 P3（见 §9）。

> ⚠️ **本节的阶段模型已于 2026-08-11 被替换（迁移 `0331`），以下内容仅存档。**
> 现行模型是「两端派生、研发段人工填」：`pending_verification`（待验证）整档删除，
> 关联发布单不再产生任何档位，`in_progress` / `done` 改为人工设置并受地板规则保护，
> 另有降档锁（原发布硬门槛已于 2026-08-12 移除）。权威描述见 `docs/domain-glossary.md` 的「轴 C」。

**阶段阶梯**（`STAGE_LADDER` 全序，按现存有效事实取最高档）：

| 事实 | 阶段 | 枚举值 |
|---|---|---|
| 未被任何项目引用 | 未开始 | 前端展示值，**不落库**（零关联行） |
| 关联到项目 | 已立项 | `linked` |
| 关联到该项目的**有效**迭代 | 已排期 | `planned` |
| 关联到该项目的**在途**发布单 | 待验证 | `pending_verification` |
| 关联的发布单**已发布** | 已发布 | `released` |

`in_progress` / `done` 两个枚举值保留但本期不产出，P3 工作项派生落地时插入 **已排期 → 待验证** 之间（全序已预留位置，无需重排）。

**有效事实判定**：

| 关联 | 算作有效事实的条件 |
|---|---|
| 迭代关联 → `planned` | 迭代未被取消（`Cycle.Status.CANCELLED` 之外均有效） |
| 发布单关联 → `pending_verification` | 发布单在途（未被拒绝 `rejected` / 终止 `cancelled`） |
| 发布单关联 → `released` | 发布单已实际发布（`completed`） |

**重算原则**（`utils/requirement_project.py::recalculate_stage(requirement_id, project_id, *, trigger)`）：

- 每次事实变动按**现存有效事实整体重算，取最高档**（幂等、顺序无关），底档为 `linked`；不做事件式打补丁。事实作废（发布单被拒/终止、迭代取消、解除关联）走**同一条重算路径**自动降档。
- **迭代完成不改阶段**：时间盒到期不是进度事实。「迭代已结束仍停在已排期」由列表注解 `carryover` 标记，前端做黄标提示，不改值。
- **降档留痕**：阶段变更写一行 `RequirementProjectActivity`（old_stage / new_stage / trigger，如「从待验证退回已排期，因发布单 xxx 被拒绝」）。

**触发点清单**（全部同步显式调用，不挂信号）：

- 需求↔迭代/发布关联的增删（含解除项目关联时级联软删该项目下的迭代/发布关联行）
- 迭代状态变更涉及「已取消」（进或出，即取消与恢复）
- 发布单任意状态变更（发布 / 驳回 / 终止 / 恢复）

**`Requirement.status` 对称回写**（`recalculate_requirement_status`，随每次阶段重算级联）：

- 所有关联项目的 stage 均为 `released` **且至少有一条关联行** → `status = implemented`（「全部」语义）。
- 条件失效 → 退回 `confirmed`。**零关联行的需求不参与判定**。
- draft / obsolete 永不触碰，`approval_state` 完全独立；反方向（status → stage）不存在。

**明文条款（已拍板）**：

1. **手动改阶段已退役**：stage 为纯派生字段，PATCH 写入被显式拒绝（400 `REQUIREMENT_STAGE_DERIVED`），从根上避免禅道 stagedBy 式的手动/自动冲突。
2. **不做父级阶段聚合**：需求层级各算各的 stage，不向父级上卷；父级视角用完成率数字表达。
3. **需求阶段永不进入迭代/发布状态流转的门槛条件**（单向依赖铁律）：只做软提示——迭代完成确认框展示「N 条关联需求尚未进入发布单」，发布单发布时对在途变更（in_review）的需求标黄提示，均不阻断。

---

## 5. 后端 API

全部走 `BaseViewSet`，权限用 `@allow_fine_permission(PermissionKey.XXX)` 装饰器。路由注册进 `apps/api/plane/app/urls/`。

### 5.1 项目 ↔ 产品

```
GET    workspaces/<slug>/projects/<project_id>/products/          本项目关联的产品
POST   workspaces/<slug>/projects/<project_id>/products/          {"products": [uuid...], "removed_products": [uuid...]}
GET    workspaces/<slug>/products/<product_id>/projects/          本产品被哪些项目引用（填上现有占位 tab）
```

### 5.2 项目 ↔ 需求

```
GET    workspaces/<slug>/projects/<project_id>/requirements/               本项目关联的需求（分页，带 stage / latest_cycle_name /
                                                                           latest_release_name / carryover；查询参数 exclude_cycle_id /
                                                                           exclude_release_id 供关联选择器排除已关联行）
POST   workspaces/<slug>/projects/<project_id>/requirements/               {"requirements": [uuid...]}
DELETE workspaces/<slug>/projects/<project_id>/requirements/<req_id>/      解除关联（软删，级联软删该项目下的迭代/发布关联行）
PATCH  workspaces/<slug>/projects/<project_id>/requirements/<req_id>/      {"sort_order": ...} —— 只收排序；payload 带 stage 报
                                                                           400 REQUIREMENT_STAGE_DERIVED（手动改阶段已退役，见 4.4）
GET    workspaces/<slug>/projects/<project_id>/linkable-requirements/      候选池
POST   workspaces/<slug>/projects/<project_id>/requirements/<req_id>/changes/   项目侧发起变更单
```

需求 ↔ 迭代 / 发布关联（`views/requirement/container.py`，响应与项目需求列表同信封，权限复用 `PROJECT_REQUIREMENT_LINK_VIEW/_MANAGE`）：

```
GET    workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/requirements/              该迭代已关联的需求
POST   workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/requirements/              {"requirements": [uuid...]}；需求必须已关联本项目，
                                                                                            否则 409 REQUIREMENT_NOT_LINKED_TO_PROJECT
DELETE workspaces/<slug>/projects/<project_id>/cycles/<cycle_id>/requirements/<req_id>/     解除迭代关联（软删 + 重算降档）
GET    workspaces/<slug>/projects/<project_id>/releases/<release_id>/requirements/          该发布单已关联的需求
POST   workspaces/<slug>/projects/<project_id>/releases/<release_id>/requirements/          同迭代侧（含 409 校验）
DELETE workspaces/<slug>/projects/<project_id>/releases/<release_id>/requirements/<req_id>/ 解除发布关联（软删 + 重算降档）
```

需求侧（一条需求进了哪些项目）：

```
POST   workspaces/<slug>/products/<product_id>/requirements/<req_id>/projects/
       {"projects": [uuid...], "removed_projects": [uuid...]}
```

### 5.3 实现要点

**候选池查询**（`linkable-requirements`）：

```python
Requirement.objects.filter(
    workspace__slug=slug,
    product_id__in=ProductProject.objects.filter(project_id=project_id).values("product_id"),
    approved_version__isnull=False,          # 决策 3
).exclude(
    id__in=RequirementProject.objects.filter(project_id=project_id).values("requirement_id")
)
```

**批量关联**必须显式传冗余字段 —— `ProjectBaseModel.save()` 会从 `project` 派生 `workspace`（`project.py:272-274`），但 **`bulk_create` 不走 `save()`**：

```python
RequirementProject.objects.bulk_create(
    [
        RequirementProject(
            requirement_id=rid,
            project_id=project_id,
            workspace_id=workspace_id,      # ← 必须显式传，否则 NOT NULL 报错
            created_by_id=request.user.id,
            updated_by_id=request.user.id,
        )
        for rid in new_ids
    ],
    batch_size=100,
    ignore_conflicts=True,                  # 配合 partial unique index 做幂等
)
```

**校验**：关联时必须确认目标需求的 `product_id` 在本项目已关联产品集合内。这条跨表约束**放在 view 层**，DB 无法用 CheckConstraint 表达。

**列表读取**：项目需求列表返回的是需求内容 + stage，用 `ArrayAgg` 把 `project_ids` 注解到 Requirement 上，照 `utils/grouper.py:63-96`。不要直接返回中间表行。

**解除关联**语义：软删关联行，**需求本体、版本、审批历史一律不动**。

---

## 6. 权限

### 6.1 新增权限 key

`apps/api/plane/app/permissions/keys.py`（现有 `PROJECT_REQUIREMENTS_VIEW = "project.requirements.view"` 在 `:58`）：

```python
PROJECT_REQUIREMENT_LINK_VIEW   = "project.requirement_link.view"
PROJECT_REQUIREMENT_LINK_MANAGE = "project.requirement_link.manage"
PROJECT_PRODUCT_LINK_MANAGE     = "project.product_link.manage"
```

前端同步：`packages/constants/src/project.ts`（现有 key 在 `:211`）。

> **刻意不复用 `project.requirements.view`**：那个 key 已经写进了线上角色配置，旧的研发需求页迁走后仍要继续用它。新起 key 可以完全避免角色权限的数据迁移。key 名与 URL 不完全对应是可接受的代价。

默认授予规则按 `docs/custom-role-permissions.md` 的方式补。

### 6.2 项目侧发起变更单的授权

产品侧的写权限判定是 `can_edit_product_requirements`（`apps/api/plane/utils/product.py:49-53`），要求产品成员身份 —— 项目成员过不了。

**不要放宽这个函数**（会连带打开产品侧的所有写路径）。改为新增一个独立入口：

```python
# apps/api/plane/utils/requirement_project.py
def can_submit_change_from_project(user, requirement, project) -> bool:
    """项目成员对「已关联进本项目」的需求可以发起变更单，但不能直接改内容。"""
    # 1. user 是 project 成员且有 PROJECT_REQUIREMENT_LINK_VIEW
    # 2. RequirementProject(requirement, project) 存在且未软删
    # 3. requirement.is_locked 为 False（不在别的待审单里）
```

新端点 `POST .../projects/<pid>/requirements/<req_id>/changes/` 通过该检查后，**直接调用现有的** `utils/requirement_change.py::submit_change_request()`，变更单本身仍是 **product 作用域**（`RequirementChangeRequest` 的 product/project 二选一约束保持 product 侧），审批人仍是产品的审批名单。

即：**项目只是提单入口，审批权威不下放。**

---

## 7. 前端

### 7.1 URL 接管（风险最高，优先做且单独验证）

| | 现在 | 改后 |
|---|---|---|
| 产品需求（新） | — | `/:ws/projects/:pid/requirements` |
| 研发需求（工作项，旧） | `/:ws/projects/:pid/requirements` | `/:ws/projects/:pid/dev-requirements` |
| 缺陷（工作项） | `/:ws/projects/:pid/defects` | 不变 |

旧视图由 `TypedProjectLayoutRoot` 驱动，`variant: "requirements" | "defects"` 两个变体共用一套代码（`apps/web/core/components/issues/issue-layouts/roots/typed-project-layout-root.tsx:40-43`，类别名硬编码在 `:51`）。**迁移只动 `requirements` 变体，`defects` 一行不碰。**

必须同步修改的点：

1. `apps/web/app/routes/core.ts:217-221` — 旧 layout/route 路径改为 `dev-requirements`，新增产品需求页的 layout/route
2. 目录改名：`apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/requirements/` → `dev-requirements/`，原目录腾给新页面
3. `apps/web/core/store/issue/project/scope.ts` — `TProjectIssueScope` 的 `"requirements"` 改名为 `"dev_requirements"`；`getProjectIssueScopeFromPathname()` 里的 `pathname.includes("/requirements")` 改为 `"/dev-requirements"`
   > ⚠️ **必须显式改**。字符串 `/projects/x/dev-requirements` 不含子串 `/requirements`（前面是连字符不是斜杠），所以不改也"碰巧"不会误判 —— 但这是靠运气，别留着
4. `packages/constants/src/issue/filter.ts:290` — `ISSUE_DISPLAY_FILTERS_BY_PAGE.requirements` 键名跟随改名
5. `apps/web/ce/components/navigations/use-navigation-items.ts:78-84` — 该项 `key`/`href`/`i18n_key` 改为 dev-requirements，文案改「研发需求」；另新增产品需求项，`sortOrder` 取 `1.2`（排在 `work_items`(1) 与 `dev_requirements`(1.3) 之间）
6. **不加重定向**。老书签打开 `/requirements` 会看到新的产品需求页，这是本次刻意的接管，不是错误跳转

### 7.2 作用域抽象扩展

现有通用组件已经通过 `entityKind` 做了作用域抽象，把 `"product" | "library"` 扩成 `"product" | "project" | "library"`：

| 文件 | 位置 |
|---|---|
| `core/components/requirements/requirement-grid.tsx` | `:94`、`:204` |
| `core/components/requirements/requirement-builtin-fields.tsx` | `:142` `getBuiltinColumnsFor()` |
| `core/components/requirements/use-requirement-titles.ts` | `:9`、`:51` |
| `core/components/requirements/use-requirement-asset-upload.ts` | 附件挂在归属实体上，project 作用域要挂回 product |
| `core/components/requirements/requirement-create-modal.tsx` | `:245`（项目侧不出现建行入口，但类型要能编译） |

详情层的 prop 目前直接叫 `productId`，需要改成作用域三元组 `{ scope, scopeId, productId }`：

- `core/components/requirements/requirement-detail/requirement-detail-content.tsx:53`
- `core/components/requirements/requirement-detail/requirement-peek-overview.tsx:22`
- `core/hooks/store/requirement-detail/use-requirement-detail.ts:28`

> project 作用域下**仍需带 `productId`**：读需求内容、版本、轨迹、提变更单都要打到产品的端点上。

### 7.3 Service

`apps/web/core/services/requirement.service.ts` 的 4 个 root helper 目前硬编码 `products/{id}`（`:45-58` 及 `configurationRoot`）。改造为作用域感知：

```ts
type TRequirementScope = { kind: "product" | "project"; id: string };

private scopeRoot(workspaceSlug: string, scope: TRequirementScope) {
  const segment = scope.kind === "product" ? "products" : "projects";
  return `/api/workspaces/${workspaceSlug}/${segment}/${scope.id}`;
}
```

新增方法（建议放同一个 service，不另起文件）：

```ts
listProjectRequirements(ws, projectId, params)
linkRequirementsToProject(ws, projectId, { requirements: string[] })
unlinkRequirementFromProject(ws, projectId, requirementId)
updateProjectRequirement(ws, projectId, requirementId, { stage?, sort_order? })
listLinkableRequirements(ws, projectId, params)
submitChangeFromProject(ws, projectId, requirementId, payload)
listProjectProducts(ws, projectId)
updateProjectProducts(ws, projectId, { products, removed_products })
updateRequirementProjects(ws, productId, requirementId, { projects, removed_projects })
```

### 7.4 Hook

跟随 requirement 域现有路线：**局部 `useState` hook，不进 MobX root store**（见 `docs/domain-glossary.md:231-234`）。

新建 `apps/web/core/hooks/store/use-project-requirements.ts`，签名与 `use-product-requirements.ts:44` 对齐：

```ts
useProjectRequirements({ workspaceSlug, projectId })
  → { requirementsPage, isLoading, isMutating, error,
      search, filters, stageFilter, cursor, perPage,
      fetchRequirements, linkRequirements, unlinkRequirement, updateStage }
```

### 7.5 组件

新建 `apps/web/core/components/projects/requirements/`：

| 文件 | 职责 |
|---|---|
| `project-requirements-page.tsx` | 主页面：工具条 + 网格 + 关联入口 + peek 抽屉调度 |
| `existing-requirements-modal.tsx` | 关联弹窗。仿 `core/components/core/modals/existing-issues-list-modal.tsx`，Combobox 多选 + debounce 搜索 + 无限滚动 |
| `project-requirement-stage-cell.tsx` | 阶段列（下拉可改） |
| `unlink-confirm-modal.tsx` | 解除关联确认，文案需明确「不会删除需求本体」 |

需求侧新增「所属项目」区块：在 `requirement-detail-content.tsx` 的属性块里加多选，抄 `issue-detail/module-select.tsx:43-63` 的 `xor()` 求差集 → `{ projects, removed_projects }`。

产品的 `projects` 占位 tab（`products/[productId]/projects/page.tsx`，现在渲染 `ProductFeaturePage`）替换为真实列表。

### 7.6 只读约束的落地方式

项目侧复用 `RequirementGrid` 但传只读标志：`title` / `description_html` / 自定义字段 / `priority` / `assignee` / 日期全部禁编辑，只有 `stage` 可改。工具条只保留「关联需求」「解除关联」「提变更」三个动作，不出现「新建」「导入」「评审」「打基线」。

---

## 8. i18n

`packages/i18n/src/locales/{en,zh-CN}/translations.ts`（只有这两个 locale 有需求相关翻译）。

新增顶层命名空间 `project_requirements.*`：

```
project_requirements.title                       项目需求 / Project Requirements
project_requirements.link                        关联需求
project_requirements.unlink                      解除关联
project_requirements.unlink_confirm              解除后需求仍保留在产品中，不会被删除
project_requirements.empty.title / .description
project_requirements.linkable.empty              没有可关联的需求（需先关联产品，且需求需通过评审）
project_requirements.stage.{linked,planned,in_progress,done,released}
project_requirements.submit_change               提交变更
project_requirements.readonly_hint               需求内容由产品维护，如需修改请提交变更单
project_products.title / .link / .unlink         项目关联产品
```

侧边栏文案调整：`sidebar.requirements` 保持「需求」给新页面；新增 `sidebar.dev_requirements`（「研发需求」）给迁走的旧页面。

通用组件（`requirement_*` 命名空间）的文案可直接复用，无需新增。

---

## 9. 分期与待办清单

### P0 — 数据模型与迁移

- [ ] `ProductProject` 模型（`db/models/product.py`）
- [ ] `RequirementProjectStage` 枚举 + `RequirementProject` 模型（`db/models/requirement.py`）
- [ ] 两个模型导出到 `db/models/__init__.py`
- [ ] migration `0327_product_project_link`
- [ ] migration `0328_requirement_project_link`

### P1 — 后端关联 API

- [ ] `serializers/product_project.py`：`ProductProjectSerializer`（`workspace`/`project` read_only）
- [ ] `serializers/requirement_project.py`：`RequirementProjectSerializer` + `ProjectRequirementSerializer`（需求内容 + stage）
- [ ] `views/project/product.py`：项目↔产品双向批量
- [ ] `views/requirement/project.py`：项目需求 list / link / unlink / patch stage / linkable
- [ ] `utils/requirement_project.py`：候选池查询、关联校验（产品必须已关联本项目）、`recalculate_stage()` 骨架
- [ ] 权限 key 三个（`permissions/keys.py` + `packages/constants/src/project.ts`）
- [ ] `can_submit_change_from_project()` + 项目侧提变更单端点
- [ ] URL 注册（`app/urls/`）
- [ ] `ArrayAgg` 注解 `project_ids` 到 Requirement 列表响应

### P2 — 前端

- [ ] **先做 URL 接管**（7.1 六个点），单独验证旧的研发需求页与缺陷页无回归
- [ ] `entityKind` 扩展 `"project"`（7.2 五个文件）
- [ ] 详情层 `productId` → 作用域三元组（7.2 三个文件）
- [ ] `RequirementService` 作用域化 + 9 个新方法
- [ ] `use-project-requirements.ts`
- [ ] `project-requirements-page.tsx` + 路由挂载
- [ ] `existing-requirements-modal.tsx`
- [ ] 阶段列 + 解除关联确认
- [ ] 需求详情「所属项目」多选（`xor` diff）
- [ ] 产品 `projects` 占位 tab 替换为真实列表
- [ ] 侧边栏导航项调整（改名 + 新增）
- [ ] i18n（en + zh-CN）

### P3 — 需求 ↔ 工作项派生（延后，已定型）

> 阶段推导已在本期改为关联事实驱动（见 4.4），`recalculate_stage()` 已实装。工作项派生落地时，`in_progress` / `done` 两档插入 **已排期(planned) → 待验证(pending_verification)** 之间（`STAGE_LADDER` 全序已预留位置），在 `recalculate_stage()` 里补工作项事实来源即可，无需重排。

- [ ] `RequirementIssue` 模型 + migration
- [ ] 需求拆分工作项交互（从需求创建 Issue 并自动关联）
- [ ] `recalculate_stage()` 补工作项事实来源（按 `State.group` 判定，不硬编码状态名）
- [ ] 挂到 Issue 状态变更写路径
- [x] `Requirement.status → implemented` 回写（本期已随阶段推导落地，判定条件为全部关联行 `released`，见 4.4）
- [ ] 项目需求列表展示关联工作项数与完成率

### P4 — 交付闭环（更后）

- [x] 需求 ↔ Cycle / Release 关联，驱动阶段推导（**本期已完成**：`RequirementCycle` / `RequirementRelease`，见 4.4 与 5.2）
- [ ] `TestCase.requirements`（用例覆盖需求），补齐 QA 侧链路
- [ ] 需求关闭 → `status → obsolete`

---

## 10. 风险与坑

| # | 风险 | 应对 |
|---|---|---|
| 1 | URL 接管导致旧视图回归 | P2 第一步单独做、单独验证；`defects` 变体一行不碰 |
| 2 | `bulk_create` 不走 `ProjectBaseModel.save()`，`workspace_id` 为空 | 显式传 `workspace_id`，照 `views/cycle/issue.py:240-344` |
| 3 | 放宽 `can_edit_product_requirements` 会连带打开产品侧所有写路径 | 不动该函数，新增独立的 `can_submit_change_from_project()` |
| 4 | 复用 `project.requirements.view` 会牵动线上角色配置数据 | 新起 key，旧 key 留给迁走的页面 |
| 5 | 历史上 `ProductProject` 做过又回退（见 3.3） | 开工前确认回退原因 |
| 6 | 关联了未评审需求导致 `status` 约束冲突 | 决策 3 从候选池层面杜绝；view 层再校验一次 |
| 7 | `soft_delete_related_objects` 把 PROTECT 当 CASCADE（`requirement.py:150-153`） | 两张新表都用 CASCADE，本就是期望行为，无需裸 UUID 规避 |
| 8 | stage 自动推导若用信号量会与 Issue 写路径耦合失控 | 显式重算函数，只在枚举出的写入点调用 |

---

## 11. 参考

- `docs/domain-glossary.md` — requirement / product 模块的权威说明，**改动前必读**
- `apps/api/plane/db/models/requirement.py:118-153` — 需求模块的设计注释
- `docs/custom-role-permissions.md` — 权限 key 的注册与默认授予
- `apps/api/plane/app/views/module/issue.py:207,247` — 双向批量关联的参考实现
- `apps/web/core/components/issues/issue-detail/module-select.tsx:43-63` — 前端多选 diff 参考
