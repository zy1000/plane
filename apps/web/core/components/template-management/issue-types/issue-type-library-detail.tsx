import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR from "swr";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { getApiErrorMessage, MoreMenu, WorkItemTypeModal } from "@/components/project-issue-types/root";
import { ProjectStateRoot } from "@/components/project-states";
import { ProjectWorkflowRoot } from "@/components/project-workflows/root";
import { useProjectIssueTypeFields } from "@/hooks/store/use-project-issue-type-fields";
import type { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useProjectWorkflows } from "@/hooks/store/use-project-workflows";
import type { TIssueType } from "@/services/project/project-issue-type.service";
import { DevModeTypeProperties } from "../dev-modes/dev-mode-type-properties";
import { devModeIssueSchemePath } from "../dev-modes/routes";
import { issueTypeLibraryWorkflowPath } from "./routes";
import type { TIssueTypeLibrarySegment } from "./routes";

export const ISSUE_TYPE_LIBRARY_SEGMENTS: { key: TIssueTypeLibrarySegment; label: string }[] = [
  { key: "props", label: "属性" },
  { key: "states", label: "状态" },
  { key: "workflows", label: "工作流" },
];

const CHIP = "inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-12 font-medium";

/** 删除被模式关联的类型时后端回 409 */
const isLinkedToDevModeError = (error: unknown): error is { error?: string } =>
  !!error && typeof error === "object" && (error as { code?: string }).code === "ISSUE_TYPE_LINKED_TO_DEV_MODE";

/**
 * 类型库里选中类型的详情：头部（名称、分类、用于哪些模式）+「属性 / 状态 / 工作流」分段。
 * 按类型 id 重挂（调用方给 key），各段状态不串。
 */
export const IssueTypeLibraryDetail = observer(function IssueTypeLibraryDetail({
  workspaceSlug,
  scopeKey,
  issueType,
  issueTypesStore,
  canEdit,
  segment,
  onSegmentChange,
  onDeleted,
}: {
  workspaceSlug: string;
  /** 类型库的作用域键 `scheme:<库 id>` */
  scopeKey: string;
  issueType: TIssueType;
  issueTypesStore: ReturnType<typeof useProjectIssueTypes>;
  canEdit: boolean;
  segment: TIssueTypeLibrarySegment;
  onSegmentChange: (segment: TIssueTypeLibrarySegment) => void;
  onDeleted: () => void;
}) {
  const fieldsStore = useProjectIssueTypeFields(workspaceSlug, scopeKey);
  const workflowsStore = useProjectWorkflows(workspaceSlug, scopeKey);
  const { fetchProjectStates, getGroupedProjectStatesByIssueTypeId } = useProjectState();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 分段上的状态数：key 与 ProjectStateRoot 的一致，切到「状态」段不再重复请求
  useSWR(
    `PROJECT_STATES_${workspaceSlug}_${scopeKey}_${issueType.id}`,
    () => fetchProjectStates(workspaceSlug, scopeKey, issueType.id),
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
  const workflowCount = workflowsStore.getWorkflowsByIssueTypeId(issueType.id).length;
  const counts: Record<TIssueTypeLibrarySegment, number> = {
    props: typeFields.length,
    states: stateCount,
    workflows: workflowCount,
  };
  const linkedModes = issueType.linked_dev_modes ?? [];
  const isActive = issueType.is_active !== false;

  const handleUpdate = async (data: Partial<TIssueType>) => {
    setIsSubmitting(true);
    try {
      await issueTypesStore.updateIssueType(issueType.id, data);
      setIsEditing(false);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新失败",
        message: getApiErrorMessage(error, "无法更新工作项类型，请稍后重试。"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      await issueTypesStore.updateIssueType(issueType.id, { is_active: !isActive });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新失败",
        message: getApiErrorMessage(error, "无法更新工作项类型状态，请稍后重试。"),
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await issueTypesStore.deleteIssueType(issueType.id);
      setIsDeleteOpen(false);
      onDeleted();
    } catch (error) {
      setIsDeleteOpen(false);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: isLinkedToDevModeError(error)
          ? (error.error ?? "该类型仍被研发模式关联，请先在模式里取消关联。")
          : getApiErrorMessage(error, "该工作项类型可能正在使用中，暂时无法删除。"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <TypeIcon
            iconProps={issueType.logo_props?.icon}
            className="size-12 shrink-0 rounded-xl bg-layer-1"
            iconClassName="size-6"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <h2 className="truncate text-20 font-semibold text-primary">{issueType.name}</h2>
              {issueType.category_name && (
                <span className={cn(CHIP, "bg-layer-1 text-secondary")}>{issueType.category_name}</span>
              )}
              {issueType.is_default && (
                <span className={cn(CHIP, "bg-accent-subtle text-accent-primary")}>默认</span>
              )}
              {!isActive && <span className={cn(CHIP, "bg-layer-1 text-tertiary")}>已停用</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-13 text-tertiary">
              <span className="mr-0.5">用于</span>
              {linkedModes.length === 0 ? (
                <span className="text-placeholder">未被模式使用</span>
              ) : (
                linkedModes.map((mode) => (
                  <Link
                    key={mode.id}
                    to={devModeIssueSchemePath(workspaceSlug, mode.id)}
                    className="inline-flex h-[26px] items-center rounded-md bg-layer-1 px-2.5 text-13 text-primary transition-colors hover:bg-layer-1-hover"
                  >
                    {mode.name}
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="secondary" size="xl" className="px-3" onClick={() => setIsEditing(true)}>
              编辑
            </Button>
            <MoreMenu
              items={[
                // 默认类型必须开着，不给停用
                ...(issueType.is_default
                  ? []
                  : [{ label: isActive ? "停用类型" : "启用类型", onClick: () => void handleToggleActive() }]),
                {
                  label: issueType.is_default ? "默认类型不能删除" : "删除类型",
                  tone: "danger" as const,
                  disabled: issueType.is_default,
                  onClick: () => setIsDeleteOpen(true),
                },
              ]}
            />
          </div>
        )}
      </div>

      <nav className="mt-[22px] flex gap-7 border-b border-subtle" aria-label="类型配置">
        {ISSUE_TYPE_LIBRARY_SEGMENTS.map((item) => {
          const isCurrent = segment === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSegmentChange(item.key)}
              className={cn(
                "-mb-px flex h-10 items-center gap-1.5 border-b-2 text-14 transition-colors",
                isCurrent
                  ? "border-accent-primary font-semibold text-primary"
                  : "border-transparent text-secondary hover:text-primary"
              )}
            >
              {item.label}
              <span className="text-12 font-medium tabular-nums text-tertiary">{counts[item.key]}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-[18px]">
        {segment === "props" && (
          <DevModeTypeProperties issueTypeId={issueType.id} fieldsStore={fieldsStore} canEdit={canEdit} />
        )}
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
            getWorkflowDetailPath={(workflowId) => issueTypeLibraryWorkflowPath(workspaceSlug, workflowId, issueType.id)}
          />
        )}
      </div>

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
            吗？此操作不可撤销。
          </>
        }
        handleClose={() => !isDeleting && setIsDeleteOpen(false)}
        handleSubmit={() => void handleDelete()}
      />
    </div>
  );
});
