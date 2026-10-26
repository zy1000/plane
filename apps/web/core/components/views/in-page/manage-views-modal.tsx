import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  GripVertical,
  Layers,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@plane/propel/button";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { isModeView, ModeViewBadge } from "./mode-view";
import { ViewActionsMenu } from "./view-actions-menu";
import { ViewLayoutIcon } from "./view-tab-parts";

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
  modeName: string;
  onSaveAsProjectView: (view: IProjectView) => void;
};

const SectionTitle = ({ title, count, hint }: { title: string; count: number; hint: string }) => (
  <div className="flex items-center gap-2 px-1.5 pb-2 text-13 font-semibold text-primary">
    {title}
    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-layer-3 px-1 text-11 font-semibold text-secondary">
      {count}
    </span>
    <span className="ml-auto text-12 font-normal text-tertiary">{hint}</span>
  </div>
);

const ModeChip = () => (
  <span className="inline-flex h-5.5 shrink-0 items-center gap-1 rounded bg-warning-subtle px-1.5 text-12 text-warning-primary">
    <ModeViewBadge className="size-3 bg-transparent" />
    研发模式
  </span>
);

const AccessChip = ({ isPublic }: { isPublic: boolean }) => (
  <span
    className={cn(
      "inline-flex h-5.5 shrink-0 items-center gap-1 rounded px-1.5 text-12",
      isPublic ? "bg-accent-subtle text-accent-primary" : "bg-layer-1 text-secondary"
    )}
  >
    {isPublic ? <Users className="size-3 shrink-0" /> : <User className="size-3 shrink-0" />}
    {isPublic ? "公共" : "个人"}
  </span>
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
    modeName,
    onSaveAsProjectView,
  } = props;
  // state
  const [query, setQuery] = useState("");
  // refs
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setQuery("");
  }, [isOpen]);

  const { barViews, moreViews } = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matched = keyword
      ? views.filter(
          (view) =>
            view.name.toLowerCase().includes(keyword) ||
            (view.access === EViewAccess.PUBLIC && getOwnerName(view.owned_by).toLowerCase().includes(keyword))
        )
      : views;
    return {
      barViews: matched.filter((view) => isViewInBar(view)),
      moreViews: matched.filter((view) => !isViewInBar(view)),
    };
  }, [views, query, getOwnerName, isViewInBar]);

  const renderRow = (view: IProjectView) => {
    const isInBar = isViewInBar(view);
    const isPublic = view.access === EViewAccess.PUBLIC;
    return (
      <div className="group flex h-11.5 items-center gap-2.5 rounded-lg pr-2 pl-1.5 text-14 text-primary hover:bg-layer-transparent-hover">
        <span
          data-sortable-drag-handle
          className="grid w-4.5 shrink-0 cursor-grab place-items-center text-placeholder hover:text-tertiary"
        >
          <GripVertical className="size-3.5" />
        </span>
        <ViewLayoutIcon view={view} className="text-tertiary" />
        <span className="min-w-0 flex-1 truncate font-medium">{view.name}</span>
        {defaultViewId === view.id && (
          <span className="inline-flex h-5.5 shrink-0 items-center gap-1 rounded bg-warning-subtle px-1.5 text-12 font-medium text-warning-primary">
            <Star className="size-3 shrink-0 fill-current" />
            默认
          </span>
        )}
        <span className="flex w-44 shrink-0 items-center gap-2 text-12 text-secondary">
          {isModeView(view) ? <ModeChip /> : <AccessChip isPublic={isPublic} />}
          {isPublic && (
            <>
              <ButtonAvatars showTooltip userIds={view.owned_by} size="sm" />
              <span className="min-w-0 truncate">{getOwnerName(view.owned_by)}</span>
            </>
          )}
        </span>
        {isInBar ? (
          <button
            type="button"
            onClick={() => onToggleInBar(view, false)}
            className="flex h-7 w-18 shrink-0 items-center justify-center gap-1 rounded-md text-12 text-secondary hover:bg-layer-transparent-hover hover:text-primary"
          >
            <ArrowDownToLine className="size-3.5" />
            收起
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onToggleInBar(view, true)}
            className="flex h-7 w-18 shrink-0 items-center justify-center gap-1 rounded-md border border-accent-subtle bg-accent-subtle text-12 text-accent-primary hover:border-accent-strong"
          >
            <ArrowUpToLine className="size-3.5" />
            固定
          </button>
        )}
        <ViewActionsMenu
          view={view}
          ownerName={getOwnerName(view.owned_by)}
          isDefault={defaultViewId === view.id}
          isInBar={isInBar}
          canEdit={canEditView(view)}
          canDelete={canDeleteView(view)}
          canCreate={canCreate}
          placement="bottom-end"
          ariaLabel="更多操作"
          customButton={<MoreHorizontal className="size-4" />}
          customButtonClassName="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
          onRename={onRename}
          onDuplicate={onDuplicate}
          onToggleAccess={onToggleAccess}
          onSetDefault={onSetDefault}
          onToggleInBar={onToggleInBar}
          onDelete={onDelete}
          modeName={modeName}
          onSaveAsProjectView={onSaveAsProjectView}
        />
      </div>
    );
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
      initialFocus={searchRef}
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between px-6 pt-5">
          <h3 className="text-18 font-semibold text-primary">管理视图</h3>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 pt-4.5">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-subtle px-3 text-tertiary focus-within:border-accent-strong">
            <Search className="size-4 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索视图或创建人"
              aria-label="搜索视图"
              className="w-full border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4.5 pt-5 pb-2">
          <SectionTitle title="页签栏" count={barViews.length + 1} hint="按这个顺序从左往右排" />
          <div className="flex h-11.5 items-center gap-2.5 rounded-lg pr-2 pl-1.5 text-14 text-secondary">
            <span className="grid w-4.5 shrink-0 place-items-center text-tertiary">
              <Lock className="size-3.5" />
            </span>
            <Layers className="size-3.5 shrink-0 text-tertiary" />
            <span className="min-w-0 flex-1 truncate font-medium">{allLabel}</span>
            <span className="flex w-44 shrink-0 items-center">
              <span className="inline-flex h-5.5 items-center rounded bg-layer-1 px-1.5 text-12 text-secondary">系统</span>
            </span>
            <span className="w-25 shrink-0 pr-1 text-right text-12 text-tertiary">始终在第一个</span>
          </div>
          <Sortable
            data={barViews}
            keyExtractor={(view) => view.id}
            render={(view) => renderRow(view)}
            onChange={(next) => onReorder(applyGroupOrder(views, next))}
          />

          <div className="mx-1.5 my-3.5 h-px bg-layer-3" />

          <SectionTitle title="收在「更多」里" count={moreViews.length} hint="别人建的公共视图默认放这里" />
          {moreViews.length === 0 ? (
            <p className="px-1.5 py-2 text-13 text-placeholder">没有收起的视图</p>
          ) : (
            <Sortable
              data={moreViews}
              keyExtractor={(view) => view.id}
              render={(view) => renderRow(view)}
              onChange={(next) => onReorder(applyGroupOrder(views, next))}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-subtle px-6 py-4">
          {canCreate ? (
            <button
              type="button"
              onClick={onCreate}
              className="-ml-2.5 flex h-9 items-center gap-1.5 rounded-md px-2.5 text-13 font-medium text-accent-primary hover:bg-layer-transparent-hover"
            >
              <Plus className="size-4" />
              新建视图
            </button>
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
