import { useMemo } from "react";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import type { TIssueType } from "@/services/project/project-issue-type.service";

/**
 * 类型库页的类型列表：贴边窄列，每行只有图标 + 名称（+ 默认标记）。
 * 用于哪些模式写在右侧详情头部，这里不重复；搜索框在页头，关键字由页面传进来。
 */
export function IssueTypeLibraryList({
  issueTypes,
  query,
  selectedId,
  onSelect,
}: {
  /** undefined = 还在加载 */
  issueTypes: TIssueType[] | undefined;
  query: string;
  selectedId: string | undefined;
  onSelect: (issueTypeId: string) => void;
}) {
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!issueTypes || !keyword) return issueTypes;
    return issueTypes.filter((issueType) => issueType.name.toLowerCase().includes(keyword));
  }, [issueTypes, query]);

  return (
    <nav
      aria-label="类型列表"
      className="vertical-scrollbar scrollbar-sm flex h-full min-h-0 flex-col gap-px overflow-y-auto px-2.5 py-3"
    >
      {visible === undefined ? (
        <Loader className="flex flex-col gap-1.5">
          {[0, 1, 2, 3].map((index) => (
            <Loader.Item key={index} height="40px" />
          ))}
        </Loader>
      ) : visible.length === 0 ? (
        <p className="px-2 py-6 text-center text-13 text-tertiary">{query.trim() ? "没有匹配的类型" : "还没有工作项类型"}</p>
      ) : (
        visible.map((issueType) => {
          const isActive = issueType.id === selectedId;
          return (
            <button
              key={issueType.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(issueType.id)}
              className={cn(
                "flex h-11 w-full shrink-0 items-center gap-2.5 rounded-lg px-2 text-left text-14 transition-colors",
                isActive ? "bg-accent-subtle font-semibold text-primary" : "text-primary hover:bg-layer-transparent-hover",
                issueType.is_active === false && "opacity-60"
              )}
            >
              <TypeIcon
                iconProps={issueType.logo_props?.icon}
                className={cn("size-7 shrink-0 rounded-[7px]", isActive ? "bg-surface-1" : "bg-layer-1")}
                iconClassName="size-4"
              />
              <span className="min-w-0 truncate">{issueType.name}</span>
              {issueType.is_default && (
                <span className="shrink-0 rounded bg-layer-1 px-1.5 text-11 font-normal leading-5 text-secondary">默认</span>
              )}
            </button>
          );
        })
      )}
    </nav>
  );
}
