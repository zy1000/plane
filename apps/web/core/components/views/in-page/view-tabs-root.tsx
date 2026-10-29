import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import type { IProjectView, TViewScope } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { useMember } from "@/hooks/store/use-member";
import { ManageViewsModal } from "./manage-views-modal";
import { getProjectLocalFilterLabels } from "./mode-view";
import { SaveViewModal } from "./save-view-modal";
import type { TSaveViewInput, TViewSnapshot, TViewSnapshotKey, TViewSummaryRow, TViewTabsParams } from "./types";
import { useViewTabs } from "./use-view-tabs";
import { ViewTabsBar } from "./view-tabs-bar";

type TViewTabsRootProps = TViewTabsParams & {
  /** 系统页签的名字，如「全部工作项」 */
  allLabel: string;
  /** 「存为新视图」弹窗里的摘要行 */
  getSummary?: (snapshot: TViewSnapshot) => TViewSummaryRow[];
  /** 页签栏最右侧的页面自有控件 */
  trailing?: ReactNode;
};

type TSaveModalState = { mode: "create"; initialName?: string } | { mode: "edit"; view: IProjectView } | null;

/** 「存到研发模式」提示里的页面名 */
const PAGE_LABELS: Record<TViewScope, string> = {
  issues: "工作项页",
  defects: "缺陷页",
  requirements: "需求页",
};

/** 视图记住的三部分各对应摘要里的哪一行 */
const SUMMARY_KIND_OF_PART: Record<TViewSnapshotKey, TViewSummaryRow["kind"]> = {
  rich_filters: "filters",
  display_filters: "layout",
  display_properties: "properties",
};

/**
 * 页内视图页签：页签栏 + 保存 / 编辑弹窗 + 管理面板 + 删除确认。
 * 页面只负责提供当前状态（current）和如何应用一个视图（apply）。
 */
export const ViewTabsRoot = observer(function ViewTabsRoot(props: TViewTabsRootProps) {
  const { allLabel, getSummary, trailing, ...params } = props;
  // store hooks
  const { getUserDetails } = useMember();
  const tabs = useViewTabs(params);
  // state
  const [saveModal, setSaveModal] = useState<TSaveModalState>(null);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [viewToDelete, setViewToDelete] = useState<IProjectView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getOwnerName = useCallback(
    (userId: string) => getUserDetails(userId)?.display_name ?? "",
    [getUserDetails]
  );

  // 不 memo：current 里是 MobX 对象，按 key 改时引用不变
  const summary = params.current && getSummary ? getSummary(params.current) : undefined;
  const changedKinds = new Set(tabs.changedParts.map((part) => SUMMARY_KIND_OF_PART[part]));
  const modeChanges = summary?.filter((row) => changedKinds.has(row.kind)) ?? [];
  const blockedFilterLabels = getProjectLocalFilterLabels(params.current?.rich_filters);

  const handleSaveSubmit = async (input: TSaveViewInput) => {
    if (!saveModal) return;
    if (saveModal.mode === "create") await tabs.createViewFromCurrent(input);
    else await tabs.updateViewMeta(saveModal.view, input);
  };

  const handleDelete = async () => {
    if (!viewToDelete) return;
    setIsDeleting(true);
    try {
      await tabs.removeView(viewToDelete);
      setViewToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const openCreate = () => setSaveModal({ mode: "create" });
  const openEdit = (view: IProjectView) => setSaveModal({ mode: "edit", view });
  /** 研发模式视图「另存为本项目视图」：先切到它，再按它现在的设置新建一个本项目视图 */
  const openSaveAsProjectView = (view: IProjectView) => {
    if (tabs.activeViewId !== view.id) tabs.selectView(view.id);
    setIsManageOpen(false);
    setSaveModal({ mode: "create", initialName: view.name });
  };

  return (
    <>
      <ViewTabsBar
        allLabel={allLabel}
        views={tabs.visibleViews}
        hiddenViews={tabs.hiddenViews}
        activeViewId={tabs.activeViewId}
        activeView={tabs.activeView}
        isDirty={tabs.isDirty}
        defaultViewId={tabs.defaultViewId}
        canCreate={tabs.canCreate}
        canSaveActive={!!tabs.activeView && tabs.canEditView(tabs.activeView)}
        canEditView={tabs.canEditView}
        canDeleteView={tabs.canDeleteView}
        isViewInBar={tabs.isViewInBar}
        getOwnerName={getOwnerName}
        onSelect={tabs.selectView}
        onCreate={openCreate}
        onSaveActive={() => void tabs.saveActiveView()}
        onDiscard={tabs.discardChanges}
        onRename={openEdit}
        onDuplicate={(view) => void tabs.duplicateView(view)}
        onToggleAccess={(view) => void tabs.toggleViewAccess(view)}
        onSetDefault={(viewId) => void tabs.setDefaultViewId(viewId)}
        onToggleInBar={(view, inBar) => void tabs.setViewInBar(view, inBar)}
        onDelete={setViewToDelete}
        onManage={() => setIsManageOpen(true)}
        modeName={tabs.mode.modeName}
        modeFollowingCount={tabs.mode.followingCount}
        modeChanges={modeChanges}
        canUpdateModeView={tabs.canUpdateModeView}
        onUpdateModeView={tabs.saveActiveView}
        onSaveAsProjectView={openSaveAsProjectView}
        trailing={trailing}
      />

      <SaveViewModal
        isOpen={!!saveModal}
        mode={saveModal?.mode ?? "create"}
        initialName={saveModal?.mode === "edit" ? saveModal.view.name : (saveModal?.initialName ?? "")}
        initialAccess={saveModal?.mode === "edit" ? saveModal.view.access : undefined}
        initialIsDefault={saveModal?.mode === "edit" ? tabs.defaultViewId === saveModal.view.id : false}
        summary={summary}
        modeOption={
          tabs.canShareToMode
            ? {
                name: tabs.mode.modeName,
                followingCount: tabs.mode.followingCount,
                pageLabel: PAGE_LABELS[params.scope],
              }
            : undefined
        }
        blockedFilterLabels={blockedFilterLabels}
        onClose={() => setSaveModal(null)}
        onSubmit={handleSaveSubmit}
      />

      <ManageViewsModal
        isOpen={isManageOpen}
        allLabel={allLabel}
        views={tabs.views}
        defaultViewId={tabs.defaultViewId}
        canCreate={tabs.canCreate}
        canEditView={tabs.canEditView}
        canDeleteView={tabs.canDeleteView}
        isViewInBar={tabs.isViewInBar}
        getOwnerName={getOwnerName}
        onClose={() => setIsManageOpen(false)}
        onReorder={(viewIds) => void tabs.setOrder(viewIds)}
        onToggleInBar={(view, inBar) => void tabs.setViewInBar(view, inBar)}
        onSetDefault={(viewId) => void tabs.setDefaultViewId(viewId)}
        onRename={openEdit}
        onDuplicate={(view) => void tabs.duplicateView(view)}
        onToggleAccess={(view) => void tabs.toggleViewAccess(view)}
        onDelete={setViewToDelete}
        onCreate={() => {
          setIsManageOpen(false);
          openCreate();
        }}
        modeName={tabs.mode.modeName}
        onSaveAsProjectView={openSaveAsProjectView}
      />

      <AlertModalCore
        isOpen={!!viewToDelete}
        handleClose={() => setViewToDelete(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title="删除视图"
        content={
          <>
            确定删除视图「<span className="font-semibold text-primary">{viewToDelete?.name}</span>」？
            {viewToDelete?.access === 1 ? "项目里其他人的页签栏也会少掉它。" : ""}
          </>
        }
        primaryButtonText={{ loading: "删除中", default: "删除" }}
        secondaryButtonText="取消"
      />
    </>
  );
});
