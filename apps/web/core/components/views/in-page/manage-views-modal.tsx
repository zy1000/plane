import { Eye, EyeOff, Globe, GripVertical, List, MoreHorizontal, Plus, User, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, Sortable, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { ViewActionsMenu } from "./view-actions-menu";

type TManageViewsModalProps = {
  isOpen: boolean;
  allLabel: string;
  views: IProjectView[];
  defaultViewId: string | null;
  canCreate: boolean;
  canEditView: (view: IProjectView) => boolean;
  canDeleteView: (view: IProjectView) => boolean;
  isViewInBar: (view: IProjectView) => boolean;
  getOwnerName: (userId: string) => string;
  onClose: () => void;
  onReorder: (viewIds: string[]) => void;
  onToggleInBar: (view: IProjectView, inBar: boolean) => void;
  onSetDefault: (viewId: string | null) => void;
  onRename: (view: IProjectView) => void;
  onDuplicate: (view: IProjectView) => void;
  onToggleAccess: (view: IProjectView) => void;
  onDelete: (view: IProjectView) => void;
  onCreate: () => void;
};

const GroupTitle = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex items-center gap-2 px-5 pb-1.5 pt-4 text-xs font-semibold text-tertiary">
    {title}
    {hint && <span className="font-medium text-placeholder">{hint}</span>}
  </div>
);

/** 一组内拖完后，把这组成员按新顺序填回它们原来占的位置，不打乱与另一组的穿插 */
const applyGroupOrder = (all: IProjectView[], groupOrder: IProjectView[]): string[] => {
  const groupIds = new Set(groupOrder.map((view) => view.id));
  let cursor = 0;
  return all.map((view) => (groupIds.has(view.id) ? groupOrder[cursor++] : view)).map((view) => view.id);
};

export const ManageViewsModal = (props: TManageViewsModalProps) => {
  const {
    isOpen,
    allLabel,
    views,
    defaultViewId,
    canCreate,
    canEditView,
    canDeleteView,
    isViewInBar,
    getOwnerName,
    onClose,
    onReorder,
    onToggleInBar,
    onSetDefault,
    onRename,
    onDuplicate,
    onToggleAccess,
    onDelete,
    onCreate,
  } = props;
  const publicViews = views.filter((view) => view.access === EViewAccess.PUBLIC);
  const myViews = views.filter((view) => view.access !== EViewAccess.PUBLIC);

  const renderRow = (view: IProjectView) => {
    const isHidden = !isViewInBar(view);
    const isPublic = view.access === EViewAccess.PUBLIC;
    return (
      <div
        className={cn(
          "mx-2.5 flex h-11 items-center gap-2.5 rounded-md pl-2 pr-1 text-sm font-medium hover:bg-layer-2-hover",
          isHidden ? "text-tertiary" : "text-primary"
        )}
      >
        <span data-sortable-drag-handle className="cursor-grab text-placeholder hover:text-tertiary">
          <GripVertical className="h-4 w-4" />
        </span>
        {isPublic ? (
          <Globe className="h-3.5 w-3.5 shrink-0 text-tertiary" />
        ) : (
          <User className="h-3.5 w-3.5 shrink-0 text-tertiary" />
        )}
        <span className="min-w-0 flex-1 truncate">{view.name}</span>
        {defaultViewId === view.id && (
          <span className="shrink-0 rounded bg-accent-subtle px-1.5 py-0.5 text-[11px] font-semibold text-accent-primary">
            默认
          </span>
        )}
        {isPublic && (
          <span className="w-24 shrink-0 truncate text-xs font-normal text-tertiary">{getOwnerName(view.owned_by)}</span>
        )}
        <Tooltip tooltipContent={isHidden ? "显示在页签栏" : "收进「更多」"}>
          <button
            type="button"
            onClick={() => onToggleInBar(view, isHidden)}
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-layer-3",
              isHidden ? "text-placeholder" : "text-secondary"
            )}
            aria-label={isHidden ? "显示在页签栏" : "收进更多"}
          >
            {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </Tooltip>
        <ViewActionsMenu
          view={view}
          isDefault={defaultViewId === view.id}
          isInBar={!isHidden}
          canEdit={canEditView(view)}
          canDelete={canDeleteView(view)}
          canCreate={canCreate}
          placement="bottom-end"
          customButton={<MoreHorizontal className="h-4 w-4" />}
          customButtonClassName="grid h-7 w-7 place-items-center rounded-md text-secondary hover:bg-layer-3"
          onRename={onRename}
          onDuplicate={onDuplicate}
          onToggleAccess={onToggleAccess}
          onSetDefault={onSetDefault}
          onToggleInBar={onToggleInBar}
          onDelete={onDelete}
        />
      </div>
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex max-h-[80vh] flex-col">
        <div className="flex items-start justify-between border-b border-subtle px-6 pb-3 pt-5">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-lg font-semibold text-primary">管理视图</h3>
            <p className="text-xs text-tertiary">
              拖动调整页签顺序；关掉眼睛的视图收进「更多」。别人建的公共视图默认收在「更多」，点亮眼睛才进页签栏。这些只影响你自己。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-tertiary hover:bg-layer-2-hover hover:text-primary"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          <GroupTitle title="固定" />
          <div className="mx-2.5 flex h-11 items-center gap-2.5 rounded-md pl-2 pr-1 text-sm font-medium text-secondary">
            <span className="w-4" />
            <List className="h-3.5 w-3.5 shrink-0 text-tertiary" />
            <span className="min-w-0 flex-1 truncate">{allLabel}</span>
            <span className="w-24 shrink-0 text-xs font-normal text-tertiary">系统</span>
            <span className="rounded bg-layer-3 px-1.5 py-0.5 text-[11px] font-semibold text-tertiary">始终显示</span>
            <span className="w-7" />
          </div>

          <GroupTitle title="公共视图" hint="项目成员可见" />
          {publicViews.length === 0 ? (
            <p className="px-5 py-2 text-xs text-placeholder">还没有公共视图</p>
          ) : (
            <Sortable
              data={publicViews}
              keyExtractor={(view) => view.id}
              render={(view) => renderRow(view)}
              onChange={(next) => onReorder(applyGroupOrder(views, next))}
            />
          )}

          <GroupTitle title="我的视图" hint="只有你可见" />
          {myViews.length === 0 ? (
            <p className="px-5 py-2 text-xs text-placeholder">还没有个人视图</p>
          ) : (
            <Sortable
              data={myViews}
              keyExtractor={(view) => view.id}
              render={(view) => renderRow(view)}
              onChange={(next) => onReorder(applyGroupOrder(views, next))}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-subtle px-5 py-3">
          {canCreate ? (
            <Button variant="link-neutral" size="lg" prependIcon={<Plus />} onClick={onCreate} className="text-accent-primary">
              新建视图
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" size="xl" onClick={onClose}>
            完成
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
