import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Globe, Search, SlidersHorizontal, User } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";

type TMoreViewsPopoverProps = {
  /** 没放进页签栏的视图：放不下的 + 收起的 */
  views: IProjectView[];
  getOwnerName: (userId: string) => string;
  onSelect: (viewId: string) => void;
  onManage: () => void;
};

const GroupTitle = ({ title }: { title: string }) => (
  <div className="px-2 pb-1 pt-2 text-caption-md-medium text-tertiary">{title}</div>
);

/** 页签栏的「更多 N」：带搜索的浮层，列表滚动、底部「管理视图…」固定 */
export const MoreViewsPopover = (props: TMoreViewsPopoverProps) => {
  const { views, getOwnerName, onSelect, onManage } = props;
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

  const renderRow = (view: IProjectView) => (
    <button
      key={view.id}
      type="button"
      onClick={() => select(view.id)}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-xs-medium text-secondary hover:bg-layer-2-hover hover:text-primary"
    >
      {view.access === EViewAccess.PUBLIC ? (
        <Globe className="h-3.5 w-3.5 shrink-0 text-tertiary" />
      ) : (
        <User className="h-3.5 w-3.5 shrink-0 text-tertiary" />
      )}
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
      {view.access === EViewAccess.PUBLIC && (
        <span className="shrink-0 text-caption-md-regular text-tertiary">{getOwnerName(view.owned_by)}</span>
      )}
    </button>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button className="flex h-[42px] shrink-0 items-center gap-1 px-3 text-sm font-medium whitespace-nowrap text-tertiary hover:text-primary">
        更多 {views.length}
        <ChevronDown className="h-3.5 w-3.5" />
      </Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={2}
        positionerClassName="z-30"
        className="flex w-72 flex-col rounded-md border-[0.5px] border-subtle-1 bg-surface-1 shadow-overlay-200"
      >
        <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const first = publicViews[0] ?? myViews[0];
              if (first) select(first.id);
            }}
            placeholder="搜索视图"
            className="w-full border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
          />
        </div>

        <div className="max-h-[60vh] min-h-0 overflow-y-auto px-1 pb-1">
          {publicViews.length === 0 && myViews.length === 0 ? (
            <p className="px-2 py-3 text-caption-md-regular text-placeholder">没有匹配的视图</p>
          ) : (
            <>
              {publicViews.length > 0 && <GroupTitle title="公共视图" />}
              {publicViews.map(renderRow)}
              {myViews.length > 0 && <GroupTitle title="我的视图" />}
              {myViews.map(renderRow)}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            onManage();
          }}
          className="flex items-center gap-2 border-t border-subtle px-3 py-2 text-body-xs-medium text-accent-primary hover:bg-layer-2-hover"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          管理视图…
        </button>
      </Popover.Panel>
    </Popover>
  );
};
