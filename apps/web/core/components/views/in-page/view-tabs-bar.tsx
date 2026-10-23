import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Globe, MoreHorizontal, Plus, SlidersHorizontal, User } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@plane/propel/button";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { cn } from "@plane/utils";
import { MoreViewsPopover } from "./more-views-popover";
import { ViewActionsMenu } from "./view-actions-menu";

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

/** 右侧「更多 / 新建视图」要占的宽度，量页签时先扣掉 */
const RESERVED_WIDTH = 230;

const ViewIcon = ({ view, className }: { view: IProjectView; className?: string }) =>
  view.access === EViewAccess.PUBLIC ? (
    <Globe className={cn("h-3.5 w-3.5 shrink-0", className)} />
  ) : (
    <User className={cn("h-3.5 w-3.5 shrink-0", className)} />
  );

type TTabProps = {
  label: string;
  view?: IProjectView;
  isActive?: boolean;
  isDirty?: boolean;
  onClick?: () => void;
  menu?: ReactNode;
  /** 隐藏量宽行里的副本：不可聚焦、不可点 */
  isGhost?: boolean;
};

const Tab = ({ label, view, isActive = false, isDirty = false, onClick, menu, isGhost = false }: TTabProps) => (
  <div className={cn("relative flex h-[42px] shrink-0 items-center", isActive ? "text-primary" : "text-secondary")}>
    <button
      type="button"
      onClick={onClick}
      tabIndex={isGhost ? -1 : undefined}
      disabled={isGhost}
      className={cn(
        "flex h-full items-center gap-1.5 pl-3 text-sm whitespace-nowrap",
        menu ? "pr-1" : "pr-3",
        isActive ? "font-semibold" : "font-medium hover:text-primary"
      )}
    >
      {view && <ViewIcon view={view} className={isActive ? "text-accent-primary" : "text-tertiary"} />}
      <span className="max-w-[180px] truncate">{label}</span>
      {isActive && isDirty && (
        <span className="ml-0.5 h-2 w-2 shrink-0 rounded-full bg-accent-primary" aria-label="有未保存的更改" />
      )}
    </button>
    {menu}
    {isActive && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent-primary" />}
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
          if (used + width > available) break;
          used += width;
          count += 1;
        }
        return count;
      };
      const base = container.clientWidth - (widths[0] ?? 0) - RESERVED_WIDTH;
      let count = fit(base);
      if (activeViewId && (activeBarIndex === -1 || activeBarIndex >= count)) {
        const activeWidth = activeBarIndex === -1 ? (widths[1 + views.length] ?? 0) : barWidths[activeBarIndex];
        count = fit(base - activeWidth);
      }
      setVisibleCount(count);
    };
    compute();
    const observer = new ResizeObserver(() => compute());
    observer.observe(container);
    return () => observer.disconnect();
  }, [views, allLabel, activeViewId, activeBarIndex, activeOutsideBar]);

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

  const renderActiveMenu = (view: IProjectView) => (
    <ViewActionsMenu
      view={view}
      isDefault={defaultViewId === view.id}
      isInBar={isViewInBar(view)}
      canEdit={canEditView(view)}
      canDelete={canDeleteView(view)}
      canCreate={canCreate}
      customButton={<MoreHorizontal className="h-3.5 w-3.5" />}
      customButtonClassName="mr-2 grid h-5 w-5 place-items-center rounded text-tertiary hover:bg-layer-2-hover hover:text-primary"
      onRename={onRename}
      onDuplicate={onDuplicate}
      onToggleAccess={onToggleAccess}
      onSetDefault={onSetDefault}
      onToggleInBar={onToggleInBar}
      onDelete={onDelete}
    />
  );

  const renderViewTab = (view: IProjectView) => {
    const isActive = view.id === activeViewId;
    return (
      <Tab
        key={view.id}
        label={view.name}
        view={view}
        isActive={isActive}
        isDirty={isDirty}
        onClick={() => onSelect(view.id)}
        menu={isActive && !isDirty ? renderActiveMenu(view) : undefined}
      />
    );
  };

  return (
    <div
      data-view-tabs
      className="relative flex h-[42px] shrink-0 items-center border-b border-subtle bg-surface-1 pl-2 pr-2"
    >
      {/* 隐藏的量宽行 */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 flex h-0 items-center overflow-hidden opacity-0"
      >
        <Tab label={allLabel} isGhost />
        {views.map((view) => (
          <Tab key={view.id} label={view.name} view={view} isGhost />
        ))}
        {activeOutsideBar && <Tab label={activeOutsideBar.name} view={activeOutsideBar} isGhost />}
      </div>

      <div ref={containerRef} data-view-tabs-strip className="flex min-w-0 flex-1 items-center overflow-hidden">
        <Tab label={allLabel} isActive={activeViewId === null} isDirty={isDirty} onClick={() => onSelect(null)} />
        {stripViews.map(renderViewTab)}
        {extraView && (
          <>
            <span className="mx-1 h-4 w-px shrink-0 bg-border-subtle" />
            {renderViewTab(extraView)}
          </>
        )}
        {moreViews.length > 0 && (
          <MoreViewsPopover
            views={moreViews}
            getOwnerName={getOwnerName}
            onSelect={onSelect}
            onManage={onManage}
          />
        )}
        {canCreate && (
          <>
            <span className="mx-1 h-4 w-px shrink-0 bg-border-subtle" />
            <button
              type="button"
              onClick={onCreate}
              className="flex h-[42px] shrink-0 items-center gap-1 px-2.5 text-sm font-medium whitespace-nowrap text-accent-primary hover:opacity-80"
            >
              <Plus className="h-3.5 w-3.5" />
              新建视图
            </button>
          </>
        )}
      </div>

      {isDirty ? (
        <div className="flex shrink-0 items-center gap-2 pl-3">
          <span className="hidden items-center gap-1.5 text-xs text-tertiary whitespace-nowrap xl:flex">
            <span className="h-2 w-2 rounded-full bg-accent-primary" />
            {activeView ? `「${activeView.name}」有未保存的更改` : "当前筛选还没有存成视图"}
          </span>
          <Button variant="ghost" size="lg" onClick={onDiscard}>
            放弃
          </Button>
          {canCreate && (
            <Button variant="secondary" size="lg" onClick={onCreate}>
              另存为新视图
            </Button>
          )}
          {activeView && canSaveActive && (
            <Button variant="primary" size="lg" onClick={onSaveActive}>
              保存视图
            </Button>
          )}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="lg"
          className="shrink-0"
          prependIcon={<SlidersHorizontal />}
          onClick={onManage}
        >
          管理视图
        </Button>
      )}
    </div>
  );
};
