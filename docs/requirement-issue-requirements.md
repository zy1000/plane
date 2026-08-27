# 需求关联工作项（RequirementIssue）需求说明

> **2026-08-19 多对多改造批注**：需求 ↔ 工作项已从「一对多」（issue 单列唯一）放宽为**多对多**（(requirement, issue) 复合唯一，迁移 `0338_requirement_issue_many_to_many`，`related_name` 改为 `issue_requirements`）。随之：① `POST .../requirements/<rid>/issues/` 不再有 409 `ISSUE_ALREADY_LINKED`，工作项已挂别的需求不算冲突；② 工作项侧反查端点 `.../issues/<id>/requirement-link/`（单值）删除，改为 `.../issues/<id>/requirements/`（GET list / POST `{"requirements":[...]}` / DELETE `<requirement_id>/`），由 `IssueRequirementViewSet` 继承 `BaseRequirementContainerViewSet` 实现，返回 `ProjectRequirementSerializer` 行；③ 工作项搜索的排除参数由 `requirement=true`（排除挂过任何需求的）改为 `exclude_requirement_id=<uuid>`（只排除已挂**该**需求的），项目需求列表新增 `exclude_issue_id`；④ 产品页项目分布的工作项数按 `issue_id` 去重（`status_counts_by_project`）；⑤ 前端工作项详情的「需求」单选属性行（侧栏 + peek）删除，改为详情页 widgets 区的「关联需求」折叠区块（`issue-detail-widgets/work-item-requirements/`）+ 快捷操作条 / 折叠头 + 号打开 `ProjectRequirementLinkModal`（由迭代侧弹窗泛化而来）；hook `use-work-item-requirements`；`TIssueRequirementLink` 类型删除。下文所有「至多一条」「单列唯一」「ISSUE_ALREADY_LINKED」「requirement-link」「只读芯片」的表述均为历史记录。
>
> **2026-08-17 需求状态轴改造批注**：本文描述的「工作项派生研发段阶段（双轨制）」已推翻——`RequirementProject.stage` 与 `recalculate_stage` 派生引擎已删除，需求状态改为需求级人工维护的 `Requirement.status`（未开始 / 已立项 / 进行中 / 已发布 / 已关闭）。需求 ↔ 工作项关联表 `RequirementIssue` 保留，但只供工作项数 / 完成率统计，工作项的任何变化不再影响需求状态；已关闭的需求不再出现在关联选择器中。以 `docs/domain-glossary.md` requirement 节为准；下文涉及阶段派生的部分仅作历史记录。

## 1. 背景与定位

需求是产品侧规格，工作项是项目侧执行。两者**不合并成一张表**，只在项目里用关联行把「这条规格由哪些活来完成」钉住。本文档是 P3 的实施计划：新建 `RequirementIssue` 关联表，并给 `RequirementProject.stage` 的 in_progress / done 两档补上工作项事实来源。

前置阅读：`docs/domain-glossary.md` requirement 节（三根状态轴，尤其轴 C）、`apps/api/plane/utils/requirement_project.py` 文件头注释（该文件已预留 P3 扩展点：「届时在 recalculate_stage 里补事实来源即可，阶梯与调用点都不用动」）。

### 1.1 核心判断

不复用 `IssueRelation`，也不把需求变回 Issue。沿用已经跑通的 `RequirementCycle` / `RequirementRelease` / `CycleIssue` 范式，新建 `RequirementIssue`。内容复制一次后各自演化；阶段上，有工作项时研发中/完毕改由工作项状态派生，没有工作项时保留现在的手填。

| 方案 | 结论 | 原因 |
|---|---|---|
| 需求和 Issue 共用一张表 | 否决 | Issue 假定 project 非空，全站依赖它。需求已独立成表，再合回去会把审批/版本/基线全部拆掉 |
| `IssueRelation.implemented_by` | 否决 | 那张表是 Issue ↔ Issue。需求不是 Issue，塞进去要么伪造一条 Issue，要么改 relation 指向任意 UUID |
| `RequirementIssue` 关联表 | **采用** | 和 CycleIssue、RequirementCycle 同一形状：项目作用域、软删唯一、写完显式重算阶段 |

### 1.2 关系形状

**基数**（2026-08-19 已改）：多对多。一条需求 → 多条工作项；一条工作项也可以挂多条需求，分别计入各自的完成率。唯一约束是 (requirement, issue) 复合（软删条件唯一）。跨需求汇总工作项数时按 `issue_id` 去重。~~原设计：一条工作项至多一条需求，唯一约束落在 `issue` 单列。~~

**作用域**：工作项必须落在「已经引用了这条需求」的项目里。产品不能直接拥有 Issue；从产品详情拆工作项，先选项目。项目换了，关联行删掉，不跟着搬家。

| 约束 | 规则 |
|---|---|
| 前置 | 需求已关联进该项目（已通过评审，现有候选池规则不变） |
| 项目一致 | `RequirementIssue.project` = `Issue.project` = `RequirementProject.project` |
| 删除 | 删工作项或解除项目关联 → 级联软删关联行，然后重算阶段 |
| 重复关联 | 已挂**本**需求 → 条件唯一索引幂等吸收；已挂**别的**需求不是冲突（多对多，2026-08-19 已改；原为 409 `ISSUE_ALREADY_LINKED`） |

### 1.3 内容不同步

从需求创建工作项时，标题和描述复制一份作为初值，之后各改各的。需求改动走变更单审批；工作项是执行中的活。两边持续同步会重新引入已经拆掉的双事实来源。

| 字段 | 创建时 | 之后 |
|---|---|---|
| 标题 / 描述 | 复制需求当前已通过内容（若在评审中则用 approved 版本） | 独立 |
| 优先级 | 复制，可改（`RequirementPriority` 取值与 Issue 对齐，见 `requirement.py:72-79`） | 独立 |
| 自定义字段 | 不复制 | 工作项用自己的类型字段 |
| 负责人 / 状态 / 迭代 | 走项目默认值和创建表单 | 只属于工作项 |

### 1.4 拆单链路决策（已拍板）

「拆分工作项」走**复用 `CreateUpdateIssueModal` + 提交后两步关联**，不做后端组合创建端点：

- 弹窗走标准工作项创建链路，类型字段、按 IssueType 的动态创建权限、工作流初始流转全部天然生效，前端零改造（`data` 预填 + `onSubmit` 回调，QA 缺陷绑定 `core/components/qa/execution/test-execution.tsx:1611` 已是同款范式）。
- 代价：创建与关联是两步、非原子。失败窗口极小（需求并发被解除关联等罕见场景），出现「工作项已建但关联失败」时 toast 提示，用「关联已有工作项」补救。
- 原方案「事务里 create Issue + 关联行」需要在后端复刻创建副作用（serializer、activity 三件套、工作流），前端还要改造弹窗提交路径，成本明显更高，**废弃**。

---

## 2. 数据模型（后端）

### 2.1 RequirementIssue 模型

位置：`apps/api/plane/db/models/requirement.py`，插在 `RequirementRelease` 之后、`RequirementProjectActivity` 之前。照 `RequirementCycle`（同文件 :1382-1418）模板。**下方代码块是 0333 时的原始形态（issue 单列唯一）；2026-08-19 起已改为 (requirement, issue) 复合唯一、`related_name="issue_requirements"`，以模型文件为准**：

```python
class RequirementIssue(ProjectBaseModel):
    """需求 ↔ 工作项的关联行。研发段（in_progress / done）阶段派生的事实来源。

    一条工作项至多挂一条需求：唯一约束落在 issue **单列**（软删条件唯一）——
    与 RequirementCycle 的 (requirement, cycle) 复合唯一不同，这里唯一性的主语
    是工作项本身。project 冗余自 issue.project（写入口校验二者一致），重算按
    (requirement, project) 聚合时不穿透 issue 表。不遍历父子树：只认关联行。
    """

    requirement = models.ForeignKey(
        Requirement, on_delete=models.CASCADE,
        related_name="requirement_issues", verbose_name="关联需求",
    )
    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE,
        related_name="issue_requirement", verbose_name="关联工作项",
    )

    class Meta:
        unique_together = ["issue", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_issue_unique_issue_when_deleted_at_null",
            )
        ]
        verbose_name = "Requirement Issue"
        verbose_name_plural = "Requirement Issues"
        db_table = "requirement_issues"
        ordering = ("-created_at",)
```

要点：

- `related_name` 现为 `issue_requirements`（复数，多对多语义），搜索排除与 list 查询都靠它。
- `unique_together=["requirement","issue","deleted_at"]` 管历史行；真正保证 live 行唯一的是条件 UniqueConstraint `requirement_issue_unique_when_deleted_at_null`（Postgres 下 NULL 不互斥）。
- 两端 CASCADE 即可：`soft_delete_related_objects` 的异步级联天然生效；同步清理由 §4 的删除钩子负责。**不适用**「不追随删除用裸 UUID」规则（`requirement.py:153-156`）——关联行恰恰应该跟随删除。

### 2.2 导出与迁移

- `db/models/__init__.py` 的 requirement 导入块按字母序补 `RequirementIssue`。
- 迁移 `0333_requirement_issue_link.py`，依赖 `0332_product_logo_cover`。内容：CreateModel（BaseModel 标配列 + project/workspace FK + requirement/issue FK + options）+ AddConstraint。`makemigrations` 生成（先激活 venv），命名风格对齐 `0328_requirement_project_link`。无数据迁移；权限复用 0329 已种的 requirement_link 两个 key，**无需新种子**。

---

## 3. 阶段派生规则（核心）

### 3.1 档位轴 P3 之后的形态

现行模型是「两端派生、中间手填」（见 `RequirementProjectStage` docstring）。P3 不推倒阶梯，只给 in_progress / done 补事实来源。**按 `State.group` 判断，不看状态中文名**（State 是项目内自定义的，group 是唯一稳定的跨项目语义轴，choices 见 `db/models/state.py:14-20`）。

| 档位 | 事实来源 | P3 之后 |
|---|---|---|
| linked 已立项 | 关联进项目 | 不变 |
| planned 已排期 | 未取消的迭代关联 | 不变 |
| in_progress 研发中 | ~~手填~~ | 该项目下至少一条关联工作项 group=started |
| done 研发完毕 | ~~手填~~ | 至少一条 completed，且没有 backlog/unstarted/started/triage |
| released 已发布 | 发布单 completed | 不变 |

**手填不能立刻删掉**：线上已有人手填了研发中/完毕但一条工作项都没有，如果「零工作项」也按派生算，这些行会掉回已排期。所以：该 (需求, 项目) **有关联工作项 → 研发段完全由工作项决定，下拉关掉；零工作项 → 保持今天的手填和地板规则，一字不动**。

### 3.2 判定细则

| 情况 | 研发段事实 |
|---|---|
| 还没拆工作项 | 无；沿用手工档 |
| 只建了待办/未开始 | 不升 in_progress（建任务是规划，开工才是研发） |
| 任一条 started | in_progress |
| 全部 completed，或 completed + cancelled | done |
| 全部 cancelled | 无研发事实，回落 planned/linked |
| state 为 NULL 的行 | 归「未完成未取消」桶：挡 done、不产 in_progress（状态未知不能证明开工，更不能证明完工） |
| 已归档工作项 | 仍算事实（归档不是进度回退） |
| 子工作项未直接关联 | 不计入。只认 RequirementIssue 行，不遍历 Issue 父子树 |

cancelled 既不挡完成，也不当开工。工作流审批中的 **pending 不算开工**——只在 `Issue.state_id` 真正写成功时重算。

### 3.3 recalculate_stage 的修改（`utils/requirement_project.py:427`）

**① 工作项事实查询**——插在 `has_released` 块之后、`candidates` 之前，一次 GROUP BY 索引查询拿全五桶：

```python
    # 工作项事实（研发段的事实来源）。issue__deleted_at 显式过滤：FK 穿透不走
    # 软删 manager，删除工作项与异步级联之间的窗口期里已删行不能再算事实。
    issue_groups = {
        row["issue__state__group"]: row["count"]
        for row in RequirementIssue.objects.filter(
            requirement_id=requirement_id,
            project_id=project_id,
            issue__deleted_at__isnull=True,
        )
        .order_by()   # 清默认排序，防止排序列进 GROUP BY
        .values("issue__state__group")
        .annotate(count=Count("id"))
    }
    issue_total = sum(issue_groups.values())
    started_count = issue_groups.get(StateGroup.STARTED.value, 0)
    completed_count = issue_groups.get(StateGroup.COMPLETED.value, 0)
    cancelled_count = issue_groups.get(StateGroup.CANCELLED.value, 0)
```

**② 候选档计算**——在现有 candidates 逻辑中插入研发段分支：

```python
    if issue_total:
        if started_count:
            # 任一条开工即研发中（含「有 started 也有 completed」的混合态）
            candidates.append(RequirementProjectStage.IN_PROGRESS)
        elif completed_count and (issue_total - completed_count - cancelled_count) == 0:
            # 至少一条完成，且除 completed/cancelled 外没有别的桶
            candidates.append(RequirementProjectStage.DONE)
        # 全 cancelled / 只有待办未开始 / 只有 NULL 状态 → 不产研发档，
        # 自然回落 planned / linked
```

**③ 地板规则整块套 `if not issue_total:`**——零工作项路径逐字不变；有工作项时两条地板**都让位**：

```python
    if not issue_total:
        floor = None
        if link.stage in MANUAL_STAGES:
            floor = link.stage
        elif link.stage == RequirementProjectStage.RELEASED:
            floor = RequirementProjectStage.DONE
        if floor is not None:
            new_stage = max(new_stage, floor, key=STAGE_LADDER.index)
```

⚠️ **裁决：有工作项时 released 回落取 done 的启发式地板也让位于工作项事实。** 理由：

1. 该地板的存在前提是「已发布回落时没有任何研发事实可查，只能启发式假设至少研发完毕」（原 docstring 自述"不再是可证明安全的推断，而是启发式默认"）。有关联工作项后前提消失——事实可查了，启发式必须让位，否则出现「工作项一半还在 started，档位却卡在 done」的矛盾状态。
2. 该地板只在发布单被驳回/终止/删除的降档事件触发，这恰是最需要新鲜事实的时刻：工作项显示 started → in_progress 是真相；全 completed → done 由候选档自然产出，不需要地板兜底。
3. 极端情况（发布单撤销 + 工作项全是 backlog → 回落 planned/linked）正是「圈了范围没动工就撤单」的诚实表达；降档有 `RequirementProjectActivity` 留痕可查。
4. MANUAL_STAGES 地板让位的理由同用户决策：有工作项时手填入口已关（§3.4），旧的手工档是再也无法修正的遗留值，继续保护它会导致「重开一条任务无法把完毕拉回来」，重新变成两个事实来源。

**④ 同步更新注释**：`recalculate_stage` docstring 中「研发段没有事实来源，只由人写」的段落改写为双轨制说明；文件头 :8-9 的「P3 届时补事实来源」注释删除。导入块补 `RequirementIssue`、`StateGroup`（均已在 `db/models/__init__.py` 导出），`Count` 按本文件惯例函数内局部导入。

### 3.4 关闭手填：set_manual_stage 拒绝

新 helper 插在 `has_live_release_link` 之后，与前端禁用下拉共用同一条判定（口径对齐 `stage_locked` 的双端一致原则——「判定不同会出现点得动但报错」）：

```python
def has_issue_links(requirement_id, project_id):
    """该 (需求, 项目) 是否有 live 工作项关联。与 linked_requirements_queryset 的
    issue_count 注解同一条判定 —— 前端据注解禁用下拉，后端据这里拒绝写入。"""
    return RequirementIssue.objects.filter(
        requirement_id=requirement_id,
        project_id=project_id,
        issue__deleted_at__isnull=True,
    ).exists()
```

`set_manual_stage` 在 link 空检查之后、release 降档锁之前插入拒绝（有工作项时整个下拉都不存在，「派生」比「锁定」是更根本的拒绝理由）：

```python
    if has_issue_links(requirement_id, project_id):
        raise RequirementLinkError(
            "Stage is derived from linked work items and cannot be set manually.",
            code="REQUIREMENT_STAGE_ISSUE_DERIVED",
        )
```

白名单三个值（含 planned 撤销档）一律拒——有工作项时不存在可撤销的人工标记。视图侧 `project.py` 已有 `RequirementLinkError → _link_error_response`（409）通道，零改动接住。

---

## 4. 重算触发点清单

沿用既有原则：**显式调用，不挂信号**（理由见 `recalculate_stage` docstring）。

### 4.1 新 helper

插在 `recalculate_stages_for_cycle` 之后，形状对齐：

```python
def recalculate_stages_for_issue(issue_id, *, trigger=None, actor=None):
    """工作项状态落库后，重算它关联的 (需求, 项目)。

    快速 no-op：绝大多数工作项没挂需求 —— issue 单列上有条件唯一索引，
    这里恒为一次索引点查，零行即返回。至多一行。
    """
    pairs = RequirementIssue.objects.filter(issue_id=issue_id).values_list(
        "requirement_id", "project_id"
    )
    for requirement_id, project_id in pairs:
        recalculate_stage(requirement_id, project_id, trigger=trigger, actor=actor)


def recalculate_stages_for_issues(issue_ids, *, trigger=None, actor=None):
    """批量路径（batch 更新 / 自动关闭）。一次 in 查询取对、去重后逐对重算。"""
    if not issue_ids:
        return
    pairs = set(
        RequirementIssue.objects.filter(issue_id__in=issue_ids).values_list(
            "requirement_id", "project_id"
        )
    )
    for requirement_id, project_id in pairs:
        recalculate_stage(requirement_id, project_id, trigger=trigger, actor=actor)
```

### 4.2 Issue.state_id 写路径挂接点（穷举）

| # | 位置 | 挂法 |
|---|---|---|
| ① | `app/views/issue/base.py` `partial_update`（主路径） | `current_instance` 快照前记 `old_state_id = issue.state_id`；`serializer.save()` 成功后比对 `serializer.instance.state_id`，真变了才调 helper。用 instance 值而非 `request.data`：兼容置 null、serializer 拒写。工作流 403 拦截不走到 save，天然满足「pending 不算开工」 |
| ② | 同文件 `destroy` | affected_pairs 三段式（照 `views/cycle/base.py:776-795`）：先取对 → 同步 `.delete()` 关联行 → `issue.delete()` → 逐对重算。不能等 Celery 级联——异步且不回写阶段 |
| ③ | `app/views/issue/batch.py` `post` / `delete` | post：serializer 构建前记 `state_changed`（此时 `query.state_id` 还是旧值）；save 成功后收集 ids；循环结束、blocked 分支判断之前批量重算（207 部分成功时已成功行也要算）。delete：affected_pairs 三段式 |
| ④ | `utils/workflow/transition.py` `recompute_transition_record_status` | 审批通过同事务落 `issue.state_id`（:1017-1018）之后调 helper（函数内局部导入，避免 utils 交叉导入）。`recalculate_requirement_status` 内部的 atomic 成为 savepoint，安全 |
| ⑤ | `bgtasks/issue_automation_task.py` 自动关闭 | `bulk_update(issues_to_update, ["state"])` 后调批量 helper，ids 就是输入列表，actor=None（系统动作）。`archive_old_issues` 不改 state，不挂 |
| ⑥ | `app/views/intake/base.py` 受理更新 | save 前后比对 state_id。已受理的工作项之后可能被挂需求再走 intake 改状态，堵上只花两行 |
| ⑦ | `api/views/issue.py` 外部 API v1 | put 更新分支 / patch / delete 三处覆盖（v1 无工作流拦截、状态直落，导入器批量同步不挂就成片静默过期）；post 与 put 创建分支跳过——新建工作项不可能已有关联行 |

trigger 约定：状态变更 `{"type": "issue_state_changed", "source": ...}`；关联增删 `{"type": "issue_linked" / "issue_unlinked", ...}`；删除 `{"type": "issue_deleted", "issue_name": ...}`（留痕表 tooltip 用）。

### 4.3 级联清理补点（解除关系时同步软删关联行）

| 位置 | 补什么 |
|---|---|
| `app/views/requirement/project.py` 项目侧 destroy（解除项目关联，现有两张表 filter-delete 处） | 补第三条 `RequirementIssue.objects.filter(requirement_id=..., project_id=...).delete()` |
| 同文件产品侧 `removed_projects` 分支 | 补 `RequirementIssue.objects.filter(requirement_id=..., project_id__in=removed_ids).delete()` |
| `app/views/project/base.py` 项目删除 | 三张关联表旁补第四张 `RequirementIssue.objects.filter(project_id=pk).delete()` |

这三处删的是项目关系整体，只需既有的 `recalculate_requirement_status` 回写，无需逐对 `recalculate_stage`——与现状一致。

---

## 5. 后端 API

### 5.1 RequirementIssueViewSet

新文件 `app/views/requirement/issue.py`。需求→工作项方向（`RequirementIssueViewSet`）**独立实现，不复用 `BaseRequirementContainerViewSet`**——容器基类的方向是 container→requirements（list 返回需求行），这里方向相反（requirement→issues，list 返回工作项行），强套基类每个方法都要覆盖。可借鉴它的校验顺序与 `ReleaseIssueViewSet` 的 bulk_create 范式。工作项→需求方向（`IssueRequirementViewSet`，2026-08-19 新增）方向与容器基类一致，直接继承。导出补 `app/views/requirement/__init__.py`。

URL（`app/urls/requirement.py`，发布容器条目之后）：

```
GET/POST  workspaces/<slug>/projects/<pid>/requirements/<rid>/issues/
DELETE    workspaces/<slug>/projects/<pid>/requirements/<rid>/issues/<issue_id>/
GET/POST  workspaces/<slug>/projects/<pid>/issues/<issue_id>/requirements/                 ← 工作项侧（2026-08-19）
DELETE    workspaces/<slug>/projects/<pid>/issues/<issue_id>/requirements/<requirement_id>/
```
（原 `.../issues/<issue_id>/requirement-link/` 单值反查已删除。）

权限：list / 反查用 `PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW`，增删用 `PROJECT_REQUIREMENT_LINK_MANAGE`（keys.py:63-64）。**不新造 key**；拆新工作项本身走弹窗的标准创建链路，按 IssueType 的动态创建权限在那条链路上天然校验。

### 5.2 list：轻量工作项行

不走 `issue_on_results` / grouper 重型链路（那是给全功能网格的）。`Issue.objects`（软删 manager，**含归档**——归档仍是事实，前端按 `archived_at` 置灰）经 `issue_requirement` 反向过滤：

```python
issues = (
    Issue.objects.filter(
        workspace__slug=slug, project_id=project_id,
        issue_requirement__requirement_id=requirement_id,
        issue_requirement__deleted_at__isnull=True,
    )
    .annotate(assignee_ids=...)   # ArrayAgg，照 search/issue.py 范式
    .order_by("-created_at")
    .values("id", "name", "sequence_id", "priority", "project_id", "type_id",
            "state_id", "state__name", "state__group", "state__color",
            "assignee_ids", "archived_at", "created_at", "updated_at")
)
```

`state__group` 必给——前端完成率、行内状态色都靠它。

### 5.3 POST：关联已有工作项（唯一载荷 `{"issues": [id, ...]}`）

校验顺序（全有或全无，与 `resolve_linkable_requirements` 同取舍）：

1. `RequirementProject` 不存在 → 409 `REQUIREMENT_NOT_LINKED_TO_PROJECT`（形状照 `container.py:137-146`，先进项目再挂事实）。
2. issue 未全部落在本项目 → 400（保证 `RequirementIssue.project = Issue.project` 不变量）。
3. ~~任一 issue 已挂**其他**需求 → 409 `ISSUE_ALREADY_LINKED`~~（2026-08-19 已删：多对多，已挂别的需求不是冲突）。

4. `bulk_create(ignore_conflicts=True, batch_size=100)`，逐行显式 `workspace_id`（bulk_create 不走 `ProjectBaseModel.save()`，同 `container.py:156` 注释）。已挂**本**需求的行被条件唯一索引静默吸收 → 幂等；并发竞态由 DB 唯一索引裁决。
5. 一次 `recalculate_stage(requirement_id, project_id, trigger={"type": "issue_linked", ...}, actor=request.user)`（同一 (需求,项目)，不必逐条）。

**DELETE**：live 行不存在 → 404；存名字快照后 `link.delete()`（软删）→ `recalculate_stage(trigger={"type": "issue_unlinked", ...})`。

**反查端点**：按 issue_id 查 live 关联行，返回 `{requirement_id, requirement_display_id, requirement_name, product_id}` 或 `null`。给工作项详情属性栏的只读芯片供数，**不动 Issue 主序列化器热路径**。

### 5.4 注解扩展（网格列 + 下拉禁用 + 迭代预填）

`linked_requirements_queryset`（`utils/requirement_project.py`）新增注解，命名与 `stage_locked` / `latest_cycle_name` 同风格：

| 注解 | 口径 | 用途 |
|---|---|---|
| `issue_count` | live 关联行数（`issue__deleted_at__isnull=True`） | 下拉禁用判定（>0 即派生）、网格列 |
| `completed_issue_count` | 其中 `state__group=completed` | 完成率分子 |
| `cancelled_issue_count` | 其中 `state__group=cancelled` | 完成率分母扣减 |
| `linked_cycle_ids` | 复用现成 `valid_cycle_rows`（未删未取消）ArrayAgg cycle_id，形状 `string[]` | 前端判 `length === 1` 预填迭代；多个不猜 |

实现用 Subquery Count / ArrayAgg 范式（照同文件 `annotate_project_links`）。`ProjectRequirementSerializer` 对应加四个字段，getter 统一 `getattr(obj, ..., 缺省)`——缺注解场景安全回落。完成率 = `completed / (issue_count − cancelled)` **由前端算**，后端只给分子分母。

### 5.5 工作项搜索排除已挂本需求的（2026-08-19 已改口径）

`app/views/search/issue.py` `IssueSearchEndpoint`：

1. helper `exclude_issues_linked_to_requirement(issues, requirement_id)`：`exclude(id__in=RequirementIssue.objects.filter(requirement_id=...).order_by().values_list("issue_id", flat=True))`。**必须用 id__in 子查询**，不要照 `exclude_issues_in_releases` 的 `exclude(Q(a__x) & Q(a__y))`——Django 4.2 会把它编成两个独立 NOT EXISTS，多对多 + 软删下会把「曾挂本需求已解除、现挂别的需求」的工作项错误排除。
2. 读参 `exclude_requirement_id = request.query_params.get("exclude_requirement_id")`。
3. release 分支后应用。

排除口径是「已挂**本**需求的 live 关联行」；挂过别的需求的工作项仍可选（多对多）。该端点走 `issue_objects`（排除 triage/draft/归档），符合候选语义。~~原口径：`requirement=true` 排除挂过任何需求的。~~

---

## 6. 前端交互

主入口在项目，不在产品。关联进项目 ≠ 自动拆一条工作项。

### 6.1 入口总表

| 入口 | 做什么 |
|---|---|
| 项目需求列表 / 详情抽屉 | 「拆分工作项」打开现有创建弹窗，预填标题描述，提交后写关联行 |
| 同一处 | 「关联已有工作项」复用 `ExistingIssuesListModal`，只排除已挂本需求的（`exclude_requirement_id`） |
| 工作项详情 widgets 区（2026-08-19 已改） | 「关联需求」折叠区块（`issue-detail-widgets/work-item-requirements/`）：列出所挂需求，行尾解绑（AlertModalCore 确认）；快捷操作条与折叠头 + 号打开 `ProjectRequirementLinkModal` 多选关联。~~原：属性栏只读芯片。~~ |
| 产品需求详情 | 按项目分组展示已拆工作项；要点「拆」必须先选项目 |
| 项目需求网格新列 | 工作项数 + 完成率（completed / 非 cancelled） |

### 6.2 拆分工作项（主路径）

`CreateUpdateIssueModal`（`core/components/issues/issue-modal/modal.tsx`）零改造：

```tsx
<CreateUpdateIssueModal
  isOpen={...}
  data={{
    project_id: projectId,
    name: requirement.title,                      // 评审中用 approved 版本内容
    description_html: requirement.description_html,
    priority: requirement.priority,
    cycle_id: linkedCycleIds.length === 1 ? linkedCycleIds[0] : undefined,
  }}
  isProjectSelectionDisabled
  onSubmit={async (issue) => {
    await linkIssuesToRequirement(ws, projectId, requirementId, [issue.id]);
    // 失败：toast 提示「工作项已创建但关联失败」，引导走「关联已有」补救
  }}
/>
```

恰好一个未取消迭代时默认带上（`linked_cycle_ids` 注解）；多个迭代不猜。不自动进发布单。

### 6.3 关联已有工作项

`ExistingIssuesListModal`（`core/components/core/modals/existing-issues-list-modal.tsx`）+ `searchParams={{ exclude_requirement_id: requirementId }}`；`handleOnSubmit` 调关联接口，失败 toast 读 `payload.error`。`TProjectIssuesSearchParams`（`packages/types/src/project/projects.ts`）的参数是 `exclude_requirement_id?: string`（2026-08-19 由 `requirement?: boolean` 改来）。

### 6.4 阶段下拉关闭

`ProjectRequirementStageCell` **组件零改动**（不传 `onChange` 恒只读）：

```tsx
onChange={canManage && !requirement.issue_count
  ? (next) => onStageChange(requirement.id, next)
  : undefined}
```

三个消费点同步：项目需求网格、迭代范围页、发布范围页（后两者走各自的 SWR hook，同一判定）。后端 409 `REQUIREMENT_STAGE_ISSUE_DERIVED` 兜底。

### 6.5 需求侧「关联工作项」Section

`RequirementDetailContent` 照子需求区版式（`divide-y divide-subtle rounded-md border` 行列表 + Section 标题）新增区块：

- **项目侧**（抽屉/详情）：Section 头部带「拆分工作项」「关联已有」两个操作按钮；行内展示 编号 / 标题 / 状态胶囊（state__group 配色）/ 负责人 / 解除关联；归档行置灰。
- **产品侧**（整页详情）：按项目分组只读展示，分组头 = 项目名 + 阶段徽章（复用 `RequirementProjectStageBadges`）；「拆」入口要求先选项目。

### 6.6 工作项侧「关联需求」区块（2026-08-19 已改）

~~原设计：属性栏只读芯片。~~ 现为详情页 widgets 区的折叠区块 `issue-detail-widgets/work-item-requirements/`（root / title / content / quick-action-button，风格照 `links/*`，形态照 `qa-cases`）：无行时整块不渲染；行 = `RequirementIdentifier` 编号 + 标题 + `ProductChip`，`canManage`（`!disabled && requirement_link.manage`）时行尾解绑图标 → `AlertModalCore` 确认。新增入口两处：快捷操作条按钮 + 折叠头 + 号，都调 `toggleWorkItemRequirementLinkModal(true)`（issue-detail store），弹窗 `ProjectRequirementLinkModal excludeIssueId` 在 `issue-detail-widget-modals.tsx` 渲染，成功后 `setLastWidgetAction("requirements")` 自动展开。数据走 `use-work-item-requirements`（SWR，`shouldRetryOnError: false`，无 view 权限静默）。

### 6.7 service / hook / 类型 / i18n 落点

| 层 | 落点 |
|---|---|
| service | `core/services/requirement.service.ts` 加 `requirementIssuesRoot` 私有方法 + `listRequirementIssues` / `linkIssuesToRequirement` / `unlinkIssueFromRequirement`；工作项侧 `issueRequirementsRoot` + `listIssueRequirements` / `linkRequirementsToIssue` / `unlinkRequirementFromIssue`（2026-08-19，替代原 `getIssueRequirementLink`）；`listProjectRequirements` 加 `exclude_issue_id` |
| hook | 新建 `use-requirement-issues`（SWR key `requirement-issues-${ws}-${pid}-${rid}`）；mutation 后**同步 mutate 需求行**——阶段可能被服务端重算，落地值以响应/重拉为准（同 `useProjectRequirements.updateStage` 的口径） |
| 类型 | `packages/types/src/requirement.ts` 加 `TRequirementIssue`（~~`TIssueRequirementLink`~~ 已删，工作项侧行直接用 `TProjectRequirement`）；`TProjectRequirement` 补 `issue_count` / `completed_issue_count` / `cancelled_issue_count` / `linked_cycle_ids` |
| 网格列 | `project-requirements-columns.ts`（union + TOGGLEABLE_COLUMNS + COLUMN_LABEL_KEYS）+ `project-requirements-grid.tsx` `renderCell` 加 `issues` case：`3/5 · 60%`，零工作项显示 `—` |
| i18n | `project_requirements.issues.*` + `toast.*` 追加，en / zh-CN 同步，zh 侧按惯例带块注释 |
| 完成率口径 | `product-project-stage-bar.tsx`：有工作项的行按任务完成率、零工作项沿用阶段口径（P4） |

---

## 7. 明确不做

| 不做 | 为什么 |
|---|---|
| 关联进项目时自动建一条工作项 | 引用还不是开工；禅道这个默认很多人关掉 |
| 需求改标题后回写工作项 | 双事实来源 |
| 工作项全部完成后把 `Requirement.status` 设为 implemented | implemented 仍表示所有项目都已发布，不是研发完毕 |
| 父需求汇总子需求的工作项 | 阶段不上卷，已拍板；父级只用完成率数字 |
| 限制只能拆成「任务」类型 | 项目里类型是用户定义的，创建弹窗里选即可 |
| 发布仍要求先 done | 这道门槛已经拿掉，P3 不要偷偷加回来 |
| 后端组合创建端点 | §1.4 已裁决走两步关联 |

---

## 8. 落地顺序与验证

### 8.1 四步

1. **模型 + 关联 API + 网格工作项数列**：迁移 0333、ViewSet、注解、搜索参数。先能挂已有工作项，阶段派生就能跑。
   验证：关联一条 started 的工作项 → 阶段变研发中且下拉禁用；解除 → 回落且下拉恢复；重复关联他人需求 → 409 带编号。
2. **拆分工作项主路径**：弹窗预填 + onSubmit 关联 + 迭代预填。
   验证：从需求拆出的工作项标题/描述/优先级正确、恰好一个迭代时自动带上；关联失败 toast 可走「关联已有」补救。
3. **接 Issue 状态写路径**（①→⑤ 主链路优先，⑥⑦ 随后）+ 有工作项时关手填。
   验证：改状态/批量改/审批通过/自动关闭 → 阶段跟随；工作流 pending 不动档；删工作项 → 回落。
4. **产品详情按项目展示 + 完成率口径**。
   验证：按项目分组正确；有工作项的行完成率按任务算。

### 8.2 引擎改造自测三组（风险最高处）

- **零工作项回归**：地板规则逐字不变——手填 done 后关联/解除迭代、进出发布单，档位不被冲掉。
- **混合桶判定**：started 压 completed（混合态是 in_progress）；completed + cancelled 仍 done；全 cancelled 回落 planned/linked；只有 backlog/unstarted 不升档。
- **released 撤销**：有工作项时按工作项事实落档（不再启发式取 done）；零工作项时仍取 done。
