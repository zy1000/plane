import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pin, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { getViewTabClassName, ViewLayoutIcon } from "./view-tab-parts";

type TMoreViewsPopoverProps = {
  /** 没放进页签栏的视图：放不下的 + 收起的 */
  views: IProjectView[];
  canCreate: boolean;
  isViewInBar: (view: IProjectView) => boolean;
  getOwnerName: (userId: string) => string;
  onSelect: (viewId: string) => void;
  onToggleInBar: (view: IProjectView, inBar: boolean) => void;
  onManage: () => void;
  onCreate: () => void;
};

const GroupTitle = ({ title, hint }: { title: string; hint: string }) => (
  <div className="flex items-baseline gap-2 px-2.5 pt-2.5 pb-1 text-12 font-semibold text-secondary">
    {title}
    <span className="font-normal text-tertiary">{hint}</span>
  </div>
);

/** 页签栏的「更多 N」：带搜索的浮层，列表滚动，底部「管理视图 / 新建视图」固定 */
export const MoreViewsPopover = (props: TMoreViewsPopoverProps) => {
  const { views, canCreate, isViewInBar, getOwnerName, onSelect, onToggleInBar, onManage, onCreate } = props;
  // state
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  // refs
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    // 浮层挂上后再聚焦，base-ui 打开时会先把焦点给面板
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const { publicViews, myViews } = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matched = keyword
      ? views.filter(
          (view) =>
            view.name.toLowerCase().includes(keyword) ||
            (view.access === EViewAccess.PUBLIC && getOwnerName(view.owned_by).toLowerCase().includes(keyword))
        )
      : views;
    return {
      publicViews: matched.filter((view) => view.access === EViewAccess.PUBLIC),
      myViews: matched.filter((view) => view.access !== EViewAccess.PUBLIC),
    };
  }, [views, query, getOwnerName]);

  const select = (viewId: string) => {
    setIsOpen(false);
    onSelect(viewId);
  };

  const runAndClose = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const renderRow = (view: IProjectView) => (
    <div key={view.id} className="group flex items-center rounded-md hover:bg-layer-transparent-hover">
      <button
        type="button"
        onClick={() => select(view.id)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2.5 pr-1 pl-2.5 text-left text-13 text-primary"
      >
        <ViewLayoutIcon view={view} className="text-tertiary" />
        <span className="min-w-0 flex-1 truncate">{view.name}</span>
        {view.access === EViewAccess.PUBLIC && (
          <span className="flex shrink-0 items-center gap-1.5 text-12 text-tertiary">
            <ButtonAvatars showTooltip userIds={view.owned_by} size="sm" />
            {getOwnerName(view.owned_by)}
          </span>
        )}
      </button>
      {/* 放不下才进「更多」的视图本来就在页签栏名单上，不给固定按钮 */}
      {isViewInBar(view) ? (
        <span className="w-8 shrink-0" />
      ) : (
        <Tooltip tooltipContent="固定到页签栏">
          <button
            type="button"
            onClick={() => onToggleInBar(view, true)}
            className="mr-1 grid size-6.5 shrink-0 place-items-center rounded-md border border-subtle bg-surface-1 text-secondary opacity-0 group-hover:opacity-100 hover:text-primary focus-visible:opacity-100"
            aria-label="固定到页签栏"
          >
            <Pin className="size-3.5" />
          </button>
        </Tooltip>
      )}
    </div>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button
        className={cn(getViewTabClassName(false), isOpen && "bg-layer-transparent-active text-primary")}
      >
        更多
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-layer-3 px-1 text-11 font-semibold text-secondary">
          {views.length}
        </span>
        <ChevronDown className="size-3.5" />
      </Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={4}
        positionerClassName="z-30"
        className="flex w-84 flex-col rounded-lg border border-subtle bg-surface-1 shadow-overlay-200"
      >
        <div className="px-2.5 pt-2.5 pb-1.5">
          <label className="flex h-8.5 items-center gap-2 rounded-md border border-subtle px-2.5 text-tertiary focus-within:border-accent-strong">
            <Search className="size-3.5 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const first = publicViews[0] ?? myViews[0];
                if (first) select(first.id);
              }}
              placeholder="搜索视图或创建人"
              aria-label="搜索视图"
              className="w-full border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
            />
          </label>
        </div>

        <div className="max-h-[60vh] min-h-0 overflow-y-auto px-1.5 pb-1.5">
          {publicViews.length === 0 && myViews.length === 0 ? (
            <p className="px-2.5 py-3 text-12 text-placeholder">没有匹配的视图</p>
          ) : (
            <>
              {publicViews.length > 0 && <GroupTitle title="公共视图" hint="项目成员可见" />}
              {publicViews.map(renderRow)}
              {myViews.length > 0 && <GroupTitle title="我的视图" hint="只有你可见" />}
              {myViews.map(renderRow)}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-subtle p-1.5">
          <button
            type="button"
            onClick={() => runAndClose(onManage)}
            className="flex h-8 items-center gap-2 rounded-md px-2.5 text-13 text-secondary hover:bg-layer-transparent-hover hover:text-primary"
          >
            <SlidersHorizontal className="size-3.5 shrink-0" />
            管理视图
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => runAndClose(onCreate)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-13 font-medium text-accent-primary hover:bg-layer-transparent-hover"
            >
              <Plus className="size-3.5 shrink-0" />
              新建视图
            </button>
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
};
