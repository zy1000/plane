import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link, useParams, useSearchParams } from "react-router";
import useSWR from "swr";
import { ArrowLeft, Pencil, Plus, Trash2, Users } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Button, Loader, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { getApiErrorMessage, MoreMenu, WorkItemTypeModal } from "@/components/project-issue-types/root";
import { ProjectStateRoot } from "@/components/project-states";
import { ProjectWorkflowRoot } from "@/components/project-workflows/root";
import { WorkflowTransitionsRoot } from "@/components/project-workflows/workflow-transitions";
import { useProjectIssueTypeFields } from "@/hooks/store/use-project-issue-type-fields";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useProjectWorkflows } from "@/hooks/store/use-project-workflows";
import type { TIssueType } from "@/services/project/project-issue-type.service";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";
import type { TWorkflow } from "@/services/project/project-workflow.service";
import { useTemplatePermissions } from "../permissions";
import { useDevModeDetailContext } from "./context";
import { DevModeTypeProperties } from "./dev-mode-type-properties";
import { devModeIssueSchemePath, devModeIssueSchemeWorkflowPath } from "./routes";

const workflowService = new ProjectWorkflowService();

const SEGMENTS = [
  { key: "props", label: "属性" },
  { key: "states", label: "状态" },
  { key: "workflows", label: "工作流" },
] as const;
type TSegment = (typeof SEGMENTS)[number]["key"];

/** 选中类型的详情：头部 + 「属性 / 状态 / 工作流」分段。拆出来是为了按类型 id 重挂、各段状态不串 */
const TypeDetail = observer(function TypeDetail({
  issueType,
  segment,
  onSegmentChange,
  onDeleted,
}: {
  issueType: TIssueType;
  segment: TSegment;
  onSegmentChange: (segment: TSegment) => void;
  onDeleted: () => void;
}) {
  const { workspaceSlug, devModeId, scopeKey, issueTypesStore } = useDevModeDetailContext();
  const { canManageDevModes: canEdit } = useTemplatePermissions(workspaceSlug);
  const fieldsStore = useProjectIssueTypeFields(workspaceSlug, scopeKey);
  const workflowsStore = useProjectWorkflows(workspaceSlug, scopeKey);
  const { fetchProjectStates, getGroupedProjectStatesByIssueTypeId } = useProjectState();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 分段上的状态数：key 与 ProjectStateRoot 的一致，切到「状态」段不再重复请求
  useSWR(
    scopeKey ? `PROJECT_STATES_${workspaceSlug}_${scopeKey}_${issueType.id}` : null,
    scopeKey ? () => fetchProjectStates(workspaceSlug, scopeKey, issueType.id) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // 工作流段与计数共用这一份（传给 ProjectWorkflowRoot），增删后计数跟着变
  const { fetchWorkflows } = workflowsStore;
  useEffect(() => {
    void fetchWorkflows(issueType.id);
  }, [fetchWorkflows, issueType.id]);

  const typeFields = useMemo(
    () => (fieldsStore.fields ?? []).filter((field) => field.issue_type_id === issueType.id),
    [fieldsStore.fields, issueType.id]
  );
  const stateCount = Object.values(getGroupedProjectStatesByIssueTypeId(scopeKey, issueType.id) ?? {}).reduce(
    (sum, states) => sum + states.length,
    0
  );
  const workflows = workflowsStore.getWorkflowsByIssueTypeId(issueType.id);
  const counts: Record<TSegment, number> = { props: typeFields.length, states: stateCount, workflows: workflows.length };

  if (!scopeKey) return null;

  const handleUpdate = async (data: Partial<TIssueType>) => {
    setIsSubmitting(true);
    try {
      await issueTypesStore.updateIssueType(issueType.id, data);
      setIsEditing(false);
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "更新失败", message: getApiErrorMessage(error, "无法更新工作项类型，请稍后重试。") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (isActive: boolean) => {
    try {
      await issueTypesStore.updateIssueType(issueType.id, { is_active: isActive });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "更新失败", message: getApiErrorMessage(error, "无法更新工作项类型状态，请稍后重试。") });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await issueTypesStore.deleteIssueType(issueType.id);
      setIsDeleteOpen(false);
      onDeleted();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: getApiErrorMessage(error, "该工作项类型可能正在使用中，暂时无法删除。") });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-3">
        <TypeIcon iconProps={issueType.logo_props?.icon} className="size-10 rounded-[10px] bg-layer-1" iconClassName="size-5" />
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-18 font-semibold text-primary">
            <span className="truncate">{issueType.name}</span>
            {issueType.category_name && (
              <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-layer-1 px-2 text-12 font-medium text-secondary">
                {issueType.category_name}
              </span>
            )}
            {issueType.is_default && (
              <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-accent-subtle px-2 text-12 font-medium text-accent-primary">
                默认
              </span>
            )}
          </h2>
          {issueType.description && issueType.description !== issueType.name && (
            <p className="mt-0.5 truncate text-13 text-tertiary">{issueType.description}</p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-13 text-secondary">
          {/* 默认类型必须开着，不给关 */}
          {!issueType.is_default && (
            <>
              <span>启用</span>
              <ToggleSwitch size="sm" value={issueType.is_active !== false} disabled={!canEdit} onChange={(next) => void handleToggle(next)} />
            </>
          )}
          {canEdit && (
            <>
              <Button variant="neutral-primary" size="sm" className="ml-1.5" onClick={() => setIsEditing(true)}>
                编辑
              </Button>
              <MoreMenu
                items={[
                  { label: "编辑类型", icon: <Pencil className="size-3.5" />, onClick: () => setIsEditing(true) },
                  {
                    label: issueType.is_default ? "默认类型不能删除" : "删除类型",
                    icon: <Trash2 className="size-3.5" />,
                    tone: "danger",
                    disabled: issueType.is_default,
                    onClick: () => setIsDeleteOpen(true),
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>

      <nav className="inline-flex gap-0.5 self-start rounded-[9px] bg-layer-1 p-[3px]" aria-label="类型配置">
        {SEGMENTS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSegmentChange(item.key)}
            className={cn(
              "flex h-[30px] items-center gap-1.5 rounded-[7px] px-4 text-13 transition-colors",
              segment === item.key ? "bg-surface-1 font-semibold text-primary shadow-raised-100" : "text-secondary hover:text-primary"
            )}
          >
            {item.label}
            <span className="text-12 font-medium tabular-nums text-tertiary">{counts[item.key]}</span>
          </button>
        ))}
      </nav>

      {segment === "props" && <DevModeTypeProperties issueTypeId={issueType.id} fieldsStore={fieldsStore} canEdit={canEdit} />}
      {/* 状态、工作流沿用项目设置那两页的样子，只是不再各挂一条类型侧栏 */}
      {segment === "states" && (
        <ProjectStateRoot workspaceSlug={workspaceSlug} projectId={scopeKey} issueTypeId={issueType.id} />
      )}
      {segment === "workflows" && (
        <ProjectWorkflowRoot
          workspaceSlug={workspaceSlug}
          projectId={scopeKey}
          issueTypeId={issueType.id}
          workflowsStore={workflowsStore}
          getWorkflowDetailPath={(workflowId) =>
            `${devModeIssueSchemeWorkflowPath(workspaceSlug, devModeId, workflowId)}?type=${issueType.id}`
          }
        />
      )}

      <WorkItemTypeModal
        isOpen={isEditing}
        isSubmitting={isSubmitting}
        onClose={() => setIsEditing(false)}
        onSubmit={handleUpdate}
        editingIssueType={issueType}
        workspaceSlug={workspaceSlug}
      />

      <AlertModalCore
        isOpen={isDeleteOpen}
        variant="danger"
        isSubmitting={isDeleting}
        title="删除工作项类型"
        primaryButtonText={{ loading: "删除中", default: "删除" }}
        secondaryButtonText="取消"
        content={
          <>
            确定要删除工作项类型<span className="font-medium text-primary">「{issueType.name}」</span>
            吗？跟随本模式的项目会一起失去这个类型，此操作不可撤销。
          </>
        }
        handleClose={() => !isDeleting && setIsDeleteOpen(false)}
        handleSubmit={() => void handleDelete()}
      />
    </div>
  );
});

/**
 * 「工作项」页（方案 A）：左边选类型，右边看这个类型的属性 / 状态 / 工作流。
 *
 * 原来是「类型与属性 / 状态 / 工作流」三个子页签，状态和工作流页各自再挂一条类型侧栏；
 * 现在类型是主轴，一处选中三段共用。选中项与分段放在 URL（?type= / ?tab=），刷新不丢。
 * 数据走模式方案作用域（`scheme:<id>`），改动即时作用到跟随本模式的项目。
 */
export const DevModeIssueSchemePanel = observer(function DevModeIssueSchemePanel() {
  const { workspaceSlug, scheme, schemeError, scopeKey, issueTypesStore } = useDevModeDetailContext();
  const { canManageDevModes: canEdit } = useTemplatePermissions(workspaceSlug);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);

  const issueTypes = issueTypesStore.issueTypes;
  const selected = issueTypes?.find((item) => item.id === searchParams.get("type")) ?? issueTypes?.[0];
  const segment: TSegment = SEGMENTS.find((item) => item.key === searchParams.get("tab"))?.key ?? "props";

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const handleCreateType = async (data: Partial<TIssueType>) => {
    setIsCreateSubmitting(true);
    try {
      const created = await issueTypesStore.createIssueType(data);
      setIsCreating(false);
      if (created) updateParams({ type: created.id });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "创建失败", message: getApiErrorMessage(error, "无法创建工作项类型，请稍后重试。") });
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  if (schemeError) {
    return <div className="py-16 text-center text-13 text-secondary">加载工作项配置失败，请刷新重试。</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-7 mt-4 flex items-center gap-2.5 rounded-[9px] bg-layer-1 px-3.5 py-2.5 text-13 text-secondary">
        <Users className="size-3.5 shrink-0 text-accent-primary" />
        <span>
          跟随本模式的 <b className="font-semibold text-primary">{scheme?.following_project_count ?? "—"}</b>{" "}
          个项目共用这套类型、状态和工作流，改动即时生效；已切换为项目自定义的项目不受影响。
        </span>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 border-t border-subtle">
        <div className="flex w-[260px] shrink-0 flex-col gap-0.5 border-r border-subtle px-3 py-3.5">
          <div className="px-2 pb-2 text-12 font-medium text-tertiary">
            工作项类型{issueTypes ? ` · ${issueTypes.length}` : ""}
          </div>
          {!scopeKey || issueTypes === undefined ? (
            <Loader className="flex flex-col gap-1.5 px-1">
              {[0, 1, 2, 3].map((index) => (
                <Loader.Item key={index} height="46px" />
              ))}
            </Loader>
          ) : (
            issueTypes.map((issueType) => {
              const isActive = issueType.id === selected?.id;
              return (
                <button
                  key={issueType.id}
                  type="button"
                  onClick={() => updateParams({ type: issueType.id })}
                  className={cn(
                    "flex items-center gap-[11px] rounded-[9px] px-2 py-[9px] text-left transition-colors",
                    isActive ? "bg-accent-subtle" : "hover:bg-layer-transparent-hover",
                    issueType.is_active === false && "opacity-60"
                  )}
                >
                  <TypeIcon iconProps={issueType.logo_props?.icon} className="size-8 rounded-lg bg-layer-1" iconClassName="size-4" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-14 text-primary", isActive ? "font-semibold" : "font-medium")}>
                      {issueType.name}
                    </span>
                    <span className="block truncate text-12 text-tertiary">
                      {issueType.is_active === false ? "已停用" : (issueType.category_name ?? "")}
                    </span>
                  </span>
                  {issueType.is_default && (
                    <span className="shrink-0 rounded bg-layer-1 px-1.5 text-11 leading-5 text-secondary">默认</span>
                  )}
                </button>
              );
            })
          )}
          {canEdit && scopeKey && (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="mt-2 flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-strong text-13 text-tertiary transition-colors hover:border-accent-strong hover:text-accent-primary"
            >
              <Plus className="size-3.5" />
              添加工作项类型
            </button>
          )}
          <p className="mt-auto px-2 pt-3 text-12 leading-5 text-tertiary">新类型要先在工作区「角色模板」里勾选权限，成员才能使用。</p>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto px-7 py-5">
          {!scopeKey || issueTypes === undefined ? (
            <Loader className="flex flex-col gap-4">
              <Loader.Item height="40px" width="40%" />
              <Loader.Item height="36px" width="30%" />
              <Loader.Item height="260px" />
            </Loader>
          ) : !selected ? (
            <div className="py-16 text-center text-13 text-tertiary">还没有工作项类型</div>
          ) : (
            <TypeDetail
              key={selected.id}
              issueType={selected}
              segment={segment}
              onSegmentChange={(next) => updateParams({ tab: next === "props" ? null : next })}
              onDeleted={() => updateParams({ type: null })}
            />
          )}
        </div>
      </div>

      <WorkItemTypeModal
        isOpen={isCreating}
        isSubmitting={isCreateSubmitting}
        onClose={() => setIsCreating(false)}
        onSubmit={handleCreateType}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
});

/** 「工作项」页某条工作流的流转配置（同项目设置的工作流详情页），返回时回到原来选中的类型 */
export function DevModeIssueSchemeWorkflowPanel() {
  const { workspaceSlug, devModeId, scopeKey, schemeError } = useDevModeDetailContext();
  const { workflowId } = useParams();
  const [searchParams] = useSearchParams();
  const [workflow, setWorkflow] = useState<TWorkflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!scopeKey || !workflowId) return;
    setIsLoading(true);
    workflowService
      .fetchWorkflows(workspaceSlug, scopeKey)
      .then((workflows) => setWorkflow(workflows.find((item) => item.id === workflowId) ?? null))
      .catch(() => setWorkflow(null))
      .finally(() => setIsLoading(false));
  }, [scopeKey, workflowId, workspaceSlug]);

  const typeId = searchParams.get("type");
  const backPath = `${devModeIssueSchemePath(workspaceSlug, devModeId)}?${typeId ? `type=${typeId}&` : ""}tab=workflows`;

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      <Link to={backPath} className="flex w-fit items-center gap-1 text-13 text-secondary hover:text-primary">
        <ArrowLeft className="size-3.5" />
        返回工作流
      </Link>
      {schemeError ? (
        <div className="py-16 text-center text-13 text-secondary">加载工作项配置失败，请刷新重试。</div>
      ) : isLoading || !scopeKey ? (
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="40px" width="40%" />
          <Loader.Item height="260px" />
        </Loader>
      ) : !workflow ? (
        <div className="py-16 text-center text-13 text-secondary">未找到工作流</div>
      ) : (
        <WorkflowTransitionsRoot workspaceSlug={workspaceSlug} projectId={scopeKey} workflow={workflow} />
      )}
    </div>
  );
}
