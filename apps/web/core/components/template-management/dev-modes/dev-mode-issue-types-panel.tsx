import { useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { GripVertical } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCreateDevModeIssueTypePayload, TDevModeIssueType, TDevModeIssueTypeBlocked } from "@plane/types";
import { AlertModalCore, Loader, Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { getApiErrorMessage } from "@/components/project-issue-types/root";
import { useDevModeIssueTypes } from "@/hooks/store/use-dev-mode-issue-types";
import { issueTypeLibraryPath } from "../issue-types/routes";
import { useTemplatePermissions } from "../permissions";
import { useDevModeDetailContext } from "./context";
import { DevModeCreateTypeModal } from "./dev-mode-create-type-modal";
import { DevModeLinkTypesModal, toastTypeInUse } from "./dev-mode-link-types-modal";

// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (row: TDevModeIssueType) => row.id;

const formatCount = (value: number) => value.toLocaleString();

/** 保存关联被拦时的提示：409 列出各类型还在用的工作项数，其余错误用后端的说明 */
const toastSetError = (error: unknown) => {
  const payload = error as { code?: string; error?: string; blocked?: TDevModeIssueTypeBlocked[] } | undefined;
  if (payload?.code === "DEV_MODE_TYPE_IN_USE" && payload.blocked?.length) {
    setToast({
      type: TOAST_TYPE.ERROR,
      title: "不能取消关联",
      message: payload.blocked
        .map((item) => `「${item.name}」项目中还有 ${formatCount(item.issue_count)} 条工作项在用`)
        .join("；"),
    });
    return;
  }
  setToast({
    type: TOAST_TYPE.ERROR,
    title: "保存失败",
    message: payload?.error ?? getApiErrorMessage(error, "请稍后重试。"),
  });
};

/**
 * 模式页「工作项」页签：本模式关联的类型库类型。
 *
 * 类型、状态、工作流、字段都在工作区的类型库里维护，同一类型可以被多个模式关联，改一处都生效；
 * 这里只管关联哪些、什么顺序。也能「新建类型」：建进类型库并自动关联到本模式。
 */
export const DevModeIssueTypesPanel = observer(function DevModeIssueTypesPanel() {
  const { workspaceSlug, devModeId, devMode, scopeKey, patchDevMode } = useDevModeDetailContext();
  const { canManageDevModes: canEdit } = useTemplatePermissions(workspaceSlug);
  const { rows, error, setIssueTypes, createIssueType } = useDevModeIssueTypes(workspaceSlug, devModeId, (count) =>
    patchDevMode({ issue_type_count: count })
  );
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [sortDraft, setSortDraft] = useState<TDevModeIssueType[] | null>(null);
  const [isSavingSort, setIsSavingSort] = useState(false);
  const [unlinking, setUnlinking] = useState<TDevModeIssueType | null>(null);
  const [isUnlinkSubmitting, setIsUnlinkSubmitting] = useState(false);

  const sorting = sortDraft !== null;
  const showActions = !sorting;
  const devModeName = devMode?.name ?? "";

  const handleLinkSubmit = async (issueTypeIds: string[]) => {
    try {
      await setIssueTypes(issueTypeIds);
      setIsLinkOpen(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "关联类型已保存" });
    } catch (submitError) {
      toastSetError(submitError);
    }
  };

  const handleCreate = async (payload: TCreateDevModeIssueTypePayload) => {
    const created = await createIssueType(payload);
    setIsCreateOpen(false);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "类型已创建",
      message: created ? `「${created.issue_type.name}」已加入类型库并关联到${devModeName}` : undefined,
    });
  };

  const requestUnlink = (row: TDevModeIssueType) => {
    if (row.issue_count > 0) {
      toastTypeInUse(row.issue_count);
      return;
    }
    setUnlinking(row);
  };

  const handleUnlink = async () => {
    if (!unlinking || !rows) return;
    setIsUnlinkSubmitting(true);
    try {
      await setIssueTypes(rows.filter((row) => row.id !== unlinking.id).map((row) => row.issue_type_id));
      setUnlinking(null);
    } catch (submitError) {
      setUnlinking(null);
      toastSetError(submitError);
    } finally {
      setIsUnlinkSubmitting(false);
    }
  };

  const saveSort = async () => {
    if (!sortDraft) return;
    setIsSavingSort(true);
    try {
      await setIssueTypes(sortDraft.map((row) => row.issue_type_id));
      setSortDraft(null);
    } catch (submitError) {
      toastSetError(submitError);
    } finally {
      setIsSavingSort(false);
    }
  };

  const columns = cn(
    "grid items-center gap-x-4 px-5",
    sorting
      ? "grid-cols-[20px_minmax(220px,2fr)_90px_90px_90px_120px]"
      : "grid-cols-[minmax(220px,2fr)_90px_90px_90px_120px_160px]"
  );

  const renderRow = (row: TDevModeIssueType) => (
    <div key={row.id} className={cn(columns, "min-h-16 border-t border-subtle bg-surface-1")}>
      {sorting && (
        <span
          data-sortable-drag-handle
          className="flex cursor-grab justify-center text-tertiary active:cursor-grabbing"
          aria-label="拖动排序"
        >
          <GripVertical className="size-4" />
        </span>
      )}
      <span className="flex min-w-0 items-center gap-3">
        <TypeIcon
          iconProps={row.issue_type.logo_props?.icon}
          className="size-[34px] shrink-0 rounded-lg bg-layer-1"
          iconClassName="size-[18px]"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-14 font-medium text-primary">{row.issue_type.name}</span>
          <span className="truncate text-12 text-tertiary">{row.issue_type.category_name ?? ""}</span>
        </span>
      </span>
      <span className="text-14 tabular-nums text-secondary">{formatCount(row.state_count)}</span>
      <span className="text-14 tabular-nums text-secondary">{formatCount(row.field_count)}</span>
      <span className="text-14 tabular-nums text-secondary">
        {row.workflow_count > 0 ? formatCount(row.workflow_count) : "—"}
      </span>
      <span className="text-14 tabular-nums text-secondary">{formatCount(row.issue_count)}</span>
      {showActions && (
        <span className="flex justify-end gap-1">
          <Link
            to={issueTypeLibraryPath(workspaceSlug, { typeId: row.issue_type_id })}
            className="inline-flex h-7 items-center rounded-md px-1.5 text-13 whitespace-nowrap text-accent-primary hover:underline"
          >
            去类型库
          </Link>
          {canEdit && (
            <button
              type="button"
              onClick={() => requestUnlink(row)}
              className="inline-flex h-7 items-center rounded-md px-1.5 text-13 whitespace-nowrap text-danger-primary hover:underline"
            >
              取消关联
            </button>
          )}
        </span>
      )}
    </div>
  );

  const renderTable = () => {
    if (error) return <div className="py-16 text-center text-13 text-secondary">加载关联类型失败，请刷新重试。</div>;
    if (rows === undefined) {
      return (
        <Loader className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((index) => (
            <Loader.Item key={index} height="64px" />
          ))}
        </Loader>
      );
    }
    return (
      <div className="horizontal-scrollbar scrollbar-sm overflow-x-auto rounded-xl border border-subtle">
        <div className="min-w-[820px]">
          <div className={cn(columns, "min-h-11 rounded-t-xl bg-surface-2 text-13 font-medium text-tertiary")}>
            {sorting && <span />}
            <span>类型</span>
            <span>状态</span>
            <span>字段</span>
            <span>工作流</span>
            <span>项目中工作项</span>
            {showActions && <span className="text-right">操作</span>}
          </div>
          {rows.length === 0 ? (
            <div className="border-t border-subtle py-14 text-center text-13 text-tertiary">还没有关联工作项类型</div>
          ) : sorting ? (
            <Sortable
              id="dev-mode-issue-types"
              data={sortDraft ?? rows}
              keyExtractor={keyExtractor}
              onChange={setSortDraft}
              render={renderRow}
            />
          ) : (
            rows.map(renderRow)
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col px-8 pt-5 pb-8">
      {canEdit && rows !== undefined && (
        <div className="mb-3.5 flex justify-end gap-2">
          {sorting ? (
            <>
              <Button
                variant="secondary"
                size="xl"
                className="px-3"
                onClick={() => setSortDraft(null)}
                disabled={isSavingSort}
              >
                取消
              </Button>
              <Button variant="primary" size="xl" className="px-3" onClick={() => void saveSort()} loading={isSavingSort}>
                保存顺序
              </Button>
            </>
          ) : (
            <>
              {rows.length > 1 && (
                <Button variant="secondary" size="xl" className="px-3" onClick={() => setSortDraft(rows)}>
                  调整顺序
                </Button>
              )}
              <Button variant="secondary" size="xl" className="px-3" onClick={() => setIsCreateOpen(true)}>
                新建类型
              </Button>
              <Button variant="primary" size="xl" className="px-3" onClick={() => setIsLinkOpen(true)}>
                关联类型
              </Button>
            </>
          )}
        </div>
      )}

      {renderTable()}

      <DevModeLinkTypesModal
        isOpen={isLinkOpen}
        workspaceSlug={workspaceSlug}
        libraryScopeKey={scopeKey}
        devModeName={devModeName}
        linkedRows={rows ?? []}
        onClose={() => setIsLinkOpen(false)}
        onCreateType={() => {
          setIsLinkOpen(false);
          setIsCreateOpen(true);
        }}
        onSubmit={handleLinkSubmit}
      />

      <DevModeCreateTypeModal
        isOpen={isCreateOpen}
        workspaceSlug={workspaceSlug}
        devModeName={devModeName}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <AlertModalCore
        isOpen={!!unlinking}
        variant="danger"
        isSubmitting={isUnlinkSubmitting}
        title="取消关联工作项类型"
        primaryButtonText={{ loading: "取消关联中", default: "取消关联" }}
        secondaryButtonText="取消"
        content={
          <>
            确定要取消关联<span className="font-medium text-primary">「{unlinking?.issue_type.name}」</span>
            吗？跟随{devModeName}的项目将不再使用这个类型，类型本身仍保留在类型库。
          </>
        }
        handleClose={() => !isUnlinkSubmitting && setUnlinking(null)}
        handleSubmit={() => void handleUnlink()}
      />
    </div>
  );
});
