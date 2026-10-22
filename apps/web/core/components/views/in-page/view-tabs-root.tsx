import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import type { IProjectView } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { useMember } from "@/hooks/store/use-member";
import { ManageViewsModal } from "./manage-views-modal";
import { SaveViewModal } from "./save-view-modal";
import type { TSaveViewInput, TViewSnapshot, TViewSummaryRow, TViewTabsParams } from "./types";
import { useViewTabs } from "./use-view-tabs";
import { ViewTabsBar } from "./view-tabs-bar";

type TViewTabsRootProps = TViewTabsParams & {
  /** 系统页签的名字，如「全部工作项」 */
  allLabel: string;
  /** 页面名，用在「以后打开xx页直接落在这个视图」 */
  pageLabel: string;
  /** 「保存为视图」弹窗里的摘要行 */
  getSummary?: (snapshot: TViewSnapshot) => TViewSummaryRow[];
};

type TSaveModalState = { mode: "create" } | { mode: "edit"; view: IProjectView } | null;

/**
 * 页内视图页签：页签栏 + 保存 / 编辑弹窗 + 管理面板 + 删除确认。
 * 页面只负责提供当前状态（current）和如何应用一个视图（apply）。
 */
export const ViewTabsRoot = observer(function ViewTabsRoot(props: TViewTabsRootProps) {
  const { allLabel, pageLabel, getSummary, ...params } = props;
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
        getOwnerName={getOwnerName}
        onSelect={tabs.selectView}
        onCreate={openCreate}
        onSaveActive={() => void tabs.saveActiveView()}
        onDiscard={tabs.discardChanges}
        onRename={openEdit}
        onDuplicate={(view) => void tabs.duplicateView(view)}
        onToggleAccess={(view) => void tabs.toggleViewAccess(view)}
        onSetDefault={(viewId) => void tabs.setDefaultViewId(viewId)}
        onDelete={setViewToDelete}
        onManage={() => setIsManageOpen(true)}
      />

      <SaveViewModal
        isOpen={!!saveModal}
        mode={saveModal?.mode ?? "create"}
        pageLabel={pageLabel}
        initialName={saveModal?.mode === "edit" ? saveModal.view.name : ""}
        initialAccess={saveModal?.mode === "edit" ? saveModal.view.access : undefined}
        initialIsDefault={saveModal?.mode === "edit" ? tabs.defaultViewId === saveModal.view.id : false}
        summary={summary}
        onClose={() => setSaveModal(null)}
        onSubmit={handleSaveSubmit}
      />

      <ManageViewsModal
        isOpen={isManageOpen}
        allLabel={allLabel}
        views={tabs.views}
        hiddenViewIds={tabs.hiddenViewIds}
        defaultViewId={tabs.defaultViewId}
        canCreate={tabs.canCreate}
        canEditView={tabs.canEditView}
        canDeleteView={tabs.canDeleteView}
        getOwnerName={getOwnerName}
        onClose={() => setIsManageOpen(false)}
        onReorder={(viewIds) => void tabs.setOrder(viewIds)}
        onToggleHidden={(viewId, hidden) => void tabs.setViewHidden(viewId, hidden)}
        onSetDefault={(viewId) => void tabs.setDefaultViewId(viewId)}
        onRename={openEdit}
        onDuplicate={(view) => void tabs.duplicateView(view)}
        onToggleAccess={(view) => void tabs.toggleViewAccess(view)}
        onDelete={setViewToDelete}
        onCreate={() => {
          setIsManageOpen(false);
          openCreate();
        }}
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
