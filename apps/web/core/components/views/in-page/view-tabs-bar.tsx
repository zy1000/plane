import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Globe, MoreHorizontal, Plus, SlidersHorizontal, User } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@plane/propel/button";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
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
  getOwnerName: (userId: string) => string;
  onSelect: (viewId: string | null) => void;
  onCreate: () => void;
  onSaveActive: () => void;
  onDiscard: () => void;
  onRename: (view: IProjectView) => void;
  onDuplicate: (view: IProjectView) => void;
  onToggleAccess: (view: IProjectView) => void;
  onSetDefault: (viewId: string | null) => void;
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
    getOwnerName,
    onSelect,
    onCreate,
    onSaveActive,
    onDiscard,
    onRename,
    onDuplicate,
    onToggleAccess,
    onSetDefault,
    onDelete,
    onManage,
  } = props;
  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // state
  const [visibleCount, setVisibleCount] = useState(views.length);

  // 量一遍全部页签的宽度，放不下的收进「更多」
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const compute = () => {
      const widths = Array.from(measure.children).map((element) => (element as HTMLElement).offsetWidth);
      const available = container.clientWidth - (widths[0] ?? 0) - RESERVED_WIDTH;
      let used = 0;
      let count = 0;
      for (const width of widths.slice(1)) {
        if (used + width > available) break;
        used += width;
        count += 1;
      }
      setVisibleCount(count);
    };
    compute();
    const observer = new ResizeObserver(() => compute());
    observer.observe(container);
    return () => observer.disconnect();
  }, [views, allLabel]);

  const { stripViews, overflowViews } = useMemo(() => {
    const strip = views.slice(0, visibleCount);
    let overflow = views.slice(visibleCount);
    // 当前页签必须留在页签栏里
    if (activeViewId && !strip.some((view) => view.id === activeViewId)) {
      const active = views.find((view) => view.id === activeViewId);
      if (active) {
        const last = strip.pop();
        strip.push(active);
        overflow = overflow.filter((view) => view.id !== active.id);
        if (last) overflow.unshift(last);
      }
    }
    return { stripViews: strip, overflowViews: overflow };
  }, [views, visibleCount, activeViewId]);

  const moreViews = useMemo(() => [...overflowViews, ...hiddenViews], [overflowViews, hiddenViews]);
  const morePublic = moreViews.filter((view) => view.access === EViewAccess.PUBLIC);
  const moreMine = moreViews.filter((view) => view.access !== EViewAccess.PUBLIC);

  const renderActiveMenu = (view: IProjectView) => (
    <ViewActionsMenu
      view={view}
      isDefault={defaultViewId === view.id}
      canEdit={canEditView(view)}
      canDelete={canDeleteView(view)}
      canCreate={canCreate}
      customButton={<MoreHorizontal className="h-3.5 w-3.5" />}
      customButtonClassName="mr-2 grid h-5 w-5 place-items-center rounded text-tertiary hover:bg-layer-2-hover hover:text-primary"
      onRename={onRename}
      onDuplicate={onDuplicate}
      onToggleAccess={onToggleAccess}
      onSetDefault={onSetDefault}
      onDelete={onDelete}
    />
  );

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
      </div>

      <div ref={containerRef} data-view-tabs-strip className="flex min-w-0 flex-1 items-center overflow-hidden">
        <Tab label={allLabel} isActive={activeViewId === null} isDirty={isDirty} onClick={() => onSelect(null)} />
        {stripViews.map((view) => {
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
        })}
        {moreViews.length > 0 && (
          <CustomMenu
            customButton={
              <span className="flex h-[42px] items-center gap-1 px-3 text-sm font-medium whitespace-nowrap text-tertiary hover:text-primary">
                更多 {moreViews.length}
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
            }
            placement="bottom-start"
            optionsClassName="w-60"
            closeOnSelect
          >
            {morePublic.length > 0 && (
              <div className="px-2 pb-1 pt-1.5 text-caption-md-medium text-tertiary">公共视图</div>
            )}
            {morePublic.map((view) => (
              <CustomMenu.MenuItem key={view.id} onClick={() => onSelect(view.id)}>
                <span className="flex items-center gap-2 text-body-xs-medium">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                  <span className="truncate">{view.name}</span>
                  <span className="ml-auto shrink-0 text-caption-md-regular text-tertiary">
                    {getOwnerName(view.owned_by)}
                  </span>
                </span>
              </CustomMenu.MenuItem>
            ))}
            {moreMine.length > 0 && <div className="px-2 pb-1 pt-1.5 text-caption-md-medium text-tertiary">我的视图</div>}
            {moreMine.map((view) => (
              <CustomMenu.MenuItem key={view.id} onClick={() => onSelect(view.id)}>
                <span className="flex items-center gap-2 text-body-xs-medium">
                  <User className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                  <span className="truncate">{view.name}</span>
                </span>
              </CustomMenu.MenuItem>
            ))}
            <div className="my-1 border-t border-subtle" />
            <CustomMenu.MenuItem onClick={onManage}>
              <span className="flex items-center gap-2 text-body-xs-medium text-accent-primary">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                管理视图…
              </span>
            </CustomMenu.MenuItem>
          </CustomMenu>
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
