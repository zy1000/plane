import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, Copy, Layers, Plus, SlidersHorizontal, Star } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { IProjectView } from "@plane/types";
import { CustomMenu, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { MoreViewsPopover } from "./more-views-popover";
import {
  VIEW_MENU_ITEM_CLASS,
  VIEW_MENU_OPTIONS_CLASS,
  ViewActionsMenu,
  ViewMenuSeparator,
} from "./view-actions-menu";
import { getViewTabClassName, ViewLayoutIcon, ViewTabContent } from "./view-tab-parts";

type TViewTabsBarProps = {
  allLabel: string;
  views: IProjectView[];
  hiddenViews: IProjectView[];
  activeViewId: string | null;
  activeView: IProjectView | null;
  isDirty: boolean;
  defaultViewId: string | null;
  canCreate: boolean;
  canSaveActive: boolean;
  canEditView: (view: IProjectView) => boolean;
  canDeleteView: (view: IProjectView) => boolean;
  isViewInBar: (view: IProjectView) => boolean;
  getOwnerName: (userId: string) => string;
  onSelect: (viewId: string | null) => void;
  onCreate: () => void;
  onSaveActive: () => void;
  onDiscard: () => void;
  onRename: (view: IProjectView) => void;
  onDuplicate: (view: IProjectView) => void;
  onToggleAccess: (view: IProjectView) => void;
  onSetDefault: (viewId: string | null) => void;
  onToggleInBar: (view: IProjectView, inBar: boolean) => void;
  onDelete: (view: IProjectView) => void;
  onManage: () => void;
};

/** 右侧「更多 / 新建」要占的宽度，量页签时先扣掉 */
const RESERVED_WIDTH = 150;
/** 页签之间的 gap-1 */
const TAB_GAP = 4;

const allIcon = (isActive: boolean) => (
  <Layers className={cn("size-3.5 shrink-0", isActive ? "text-accent-primary" : "text-tertiary")} />
);

const viewIcon = (view: IProjectView, isActive: boolean) => (
  <ViewLayoutIcon view={view} className={isActive ? "text-accent-primary" : "text-tertiary"} />
);

type TSaveSplitButtonProps = {
  viewName: string;
  canCreate: boolean;
  onSave: () => void;
  onSaveAs: () => void;
};

/** 「保存视图 ▾」：主按钮存回当前视图，▾ 里还有另存为 */
const SaveSplitButton = ({ viewName, canCreate, onSave, onSaveAs }: TSaveSplitButtonProps) => (
  <div className="flex h-8 shrink-0 overflow-hidden rounded-md">
    <button
      type="button"
      onClick={onSave}
      className={cn(
        "bg-accent-primary px-4 text-13 font-semibold whitespace-nowrap text-on-color hover:bg-accent-primary-hover",
        !canCreate && "rounded-md"
      )}
    >
      保存视图
    </button>
    {canCreate && (
      <CustomMenu
        placement="bottom-end"
        customButton={<ChevronDown className="size-3.5" />}
        customButtonClassName="grid h-8 w-7.5 place-items-center border-l border-accent-subtle bg-accent-primary text-on-color hover:bg-accent-primary-hover"
        ariaLabel="更多保存方式"
        optionsClassName={VIEW_MENU_OPTIONS_CLASS}
        maxHeight="lg"
        closeOnSelect
      >
        <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={onSave}>
          <Check className="size-4 shrink-0 text-tertiary" />
          <span className="truncate">保存到「{viewName}」</span>
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={onSaveAs}>
          <Copy className="size-4 shrink-0 text-tertiary" />
          另存为新视图…
        </CustomMenu.MenuItem>
      </CustomMenu>
    )}
  </div>
);

export const ViewTabsBar = (props: TViewTabsBarProps) => {
  const {
    allLabel,
    views,
    hiddenViews,
    activeViewId,
    activeView,
    isDirty,
    defaultViewId,
    canCreate,
    canSaveActive,
    canEditView,
    canDeleteView,
    isViewInBar,
    getOwnerName,
    onSelect,
    onCreate,
    onSaveActive,
    onDiscard,
    onRename,
    onDuplicate,
    onToggleAccess,
    onSetDefault,
    onToggleInBar,
    onDelete,
    onManage,
  } = props;
  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // state
  const [visibleCount, setVisibleCount] = useState(views.length);
  // derived values
  const isAllActive = activeViewId === null;
  const activeBarIndex = views.findIndex((view) => view.id === activeViewId);
  /** 当前视图收在「更多」里（不在页签栏的名单上），量宽行要多量它一份 */
  const activeOutsideBar = activeView && activeBarIndex === -1 ? activeView : null;

  // 量一遍全部页签的宽度，放不下的收进「更多」；当前视图不在露出的那段里时，在栏尾给它留一个临时页签的位置
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const compute = () => {
      const widths = Array.from(measure.children).map((element) => (element as HTMLElement).offsetWidth);
      const barWidths = widths.slice(1, 1 + views.length);
      const fit = (available: number) => {
        let used = 0;
        let count = 0;
        for (const width of barWidths) {
          if (used + width + TAB_GAP > available) break;
          used += width + TAB_GAP;
          count += 1;
        }
        return count;
      };
      const base = container.clientWidth - (widths[0] ?? 0) - RESERVED_WIDTH;
      let count = fit(base);
      if (activeViewId && (activeBarIndex === -1 || activeBarIndex >= count)) {
        const activeWidth =
          (activeBarIndex === -1 ? (widths[1 + views.length] ?? 0) : barWidths[activeBarIndex]) + TAB_GAP;
        count = fit(base - activeWidth);
      }
      setVisibleCount(count);
    };
    compute();
    const observer = new ResizeObserver(() => compute());
    observer.observe(container);
    return () => observer.disconnect();
  }, [views, allLabel, activeViewId, activeBarIndex, activeOutsideBar, isDirty]);

  const { stripViews, extraView, overflowViews } = useMemo(() => {
    const strip = views.slice(0, visibleCount);
    const isActiveInStrip = strip.some((view) => view.id === activeViewId);
    return {
      stripViews: strip,
      // 从「更多」里选中的视图临时挂在栏尾，切走就收回去，栏里其他页签不动
      extraView: !isActiveInStrip && activeView ? activeView : null,
      overflowViews: views.slice(visibleCount).filter((view) => view.id !== activeViewId),
    };
  }, [views, visibleCount, activeViewId, activeView]);

  const moreViews = useMemo(
    () => [...overflowViews, ...hiddenViews.filter((view) => view.id !== activeViewId)],
    [overflowViews, hiddenViews, activeViewId]
  );

  /** 当前页签（没改动时）点开就是它的菜单 */
  const renderViewTab = (view: IProjectView) => {
    const isActive = view.id === activeViewId;
    if (isActive && !isDirty)
      return (
        <ViewActionsMenu
          key={view.id}
          view={view}
          ownerName={getOwnerName(view.owned_by)}
          isDefault={defaultViewId === view.id}
          isInBar={isViewInBar(view)}
          canEdit={canEditView(view)}
          canDelete={canDeleteView(view)}
          canCreate={canCreate}
          className="shrink-0"
          customButton={<ViewTabContent icon={viewIcon(view, true)} label={view.name} withChevron />}
          customButtonClassName={getViewTabClassName(true)}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onToggleAccess={onToggleAccess}
          onSetDefault={onSetDefault}
          onToggleInBar={onToggleInBar}
          onDelete={onDelete}
          onManage={onManage}
        />
      );
    return (
      <button
        key={view.id}
        type="button"
        onClick={() => onSelect(view.id)}
        className={getViewTabClassName(isActive)}
      >
        <ViewTabContent icon={viewIcon(view, isActive)} label={view.name} isDirty={isActive && isDirty} />
      </button>
    );
  };

  const renderAllTab = () => {
    if (isAllActive && !isDirty)
      return (
        <CustomMenu
          className="shrink-0"
          customButton={<ViewTabContent icon={allIcon(true)} label={allLabel} withChevron />}
          customButtonClassName={getViewTabClassName(true)}
          placement="bottom-start"
          optionsClassName={VIEW_MENU_OPTIONS_CLASS}
          maxHeight="lg"
          closeOnSelect
        >
          <div className="px-2.5 pt-1.5 pb-2 text-14 font-semibold text-primary">{allLabel}</div>
          <ViewMenuSeparator />
          <CustomMenu.MenuItem
            className={VIEW_MENU_ITEM_CLASS}
            onClick={() => defaultViewId !== null && onSetDefault(null)}
          >
            <Star className={cn("size-4 shrink-0", defaultViewId === null ? "fill-current text-warning-primary" : "text-tertiary")} />
            <span className="flex-1">{defaultViewId === null ? "我的默认视图" : "设为我的默认视图"}</span>
            {defaultViewId === null && <Check className="size-4 shrink-0 text-accent-primary" />}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={onManage}>
            <SlidersHorizontal className="size-4 shrink-0 text-tertiary" />
            管理全部视图…
          </CustomMenu.MenuItem>
        </CustomMenu>
      );
    return (
      <button type="button" onClick={() => onSelect(null)} className={getViewTabClassName(isAllActive)}>
        <ViewTabContent icon={allIcon(isAllActive)} label={allLabel} isDirty={isAllActive && isDirty} />
      </button>
    );
  };

  /** 量宽行里的副本：样式与真页签一致（当前页签带 ▾ 或改动点） */
  const renderGhost = (key: string, label: string, isActive: boolean, icon: ReactNode) => (
    <span key={key} className={getViewTabClassName(isActive)}>
      <ViewTabContent icon={icon} label={label} isDirty={isActive && isDirty} withChevron={isActive && !isDirty} />
    </span>
  );

  return (
    <div
      data-view-tabs
      className="relative flex h-12 shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-4"
    >
      {/* 隐藏的量宽行 */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 flex h-0 items-center gap-1 overflow-hidden opacity-0"
      >
        {renderGhost("all", allLabel, isAllActive, allIcon(isAllActive))}
        {views.map((view) => renderGhost(view.id, view.name, view.id === activeViewId, viewIcon(view, false)))}
        {activeOutsideBar && renderGhost("extra", activeOutsideBar.name, true, viewIcon(activeOutsideBar, true))}
      </div>

      <div ref={containerRef} data-view-tabs-strip className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {renderAllTab()}
        {stripViews.map(renderViewTab)}
        {extraView && (
          <>
            <span className="mx-1 h-4 w-px shrink-0 bg-layer-3" />
            {renderViewTab(extraView)}
          </>
        )}
        {moreViews.length > 0 && (
          <MoreViewsPopover
            views={moreViews}
            canCreate={canCreate}
            isViewInBar={isViewInBar}
            getOwnerName={getOwnerName}
            onSelect={onSelect}
            onToggleInBar={onToggleInBar}
            onManage={onManage}
            onCreate={onCreate}
          />
        )}
        {canCreate && (
          <>
            <span className="mx-1.5 h-[18px] w-px shrink-0 bg-layer-3" />
            <Tooltip tooltipContent="新建视图">
              <button
                type="button"
                onClick={onCreate}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                aria-label="新建视图"
              >
                <Plus className="size-4" />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      {isDirty && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-13 whitespace-nowrap text-warning-primary xl:inline">未保存的更改</span>
          <Button variant="ghost" size="lg" onClick={onDiscard}>
            放弃
          </Button>
          {activeView && canSaveActive ? (
            <SaveSplitButton
              viewName={activeView.name}
              canCreate={canCreate}
              onSave={onSaveActive}
              onSaveAs={onCreate}
            />
          ) : (
            canCreate && (
              <Button variant="primary" size="lg" onClick={onCreate}>
                {activeView ? "另存为新视图" : "存为新视图"}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
};
