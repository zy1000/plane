import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import type { TIssueType } from "@/services/project/project-issue-type.service";

/** 第二行：关联了这个类型的研发模式，没有就写「未被模式使用」 */
const getModesLabel = (issueType: TIssueType) => {
  const modes = issueType.linked_dev_modes ?? [];
  return modes.length > 0 ? modes.map((mode) => mode.name).join(" · ") : null;
};

/** 类型库页左栏：搜索 + 类型列表（名称 + 用于哪些模式） */
export function IssueTypeLibraryList({
  issueTypes,
  selectedId,
  onSelect,
}: {
  /** undefined = 还在加载 */
  issueTypes: TIssueType[] | undefined;
  selectedId: string | undefined;
  onSelect: (issueTypeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!issueTypes || !keyword) return issueTypes;
    return issueTypes.filter((issueType) => issueType.name.toLowerCase().includes(keyword));
  }, [issueTypes, query]);

  return (
    <section
      aria-label="类型列表"
      className="flex w-[280px] shrink-0 flex-col self-start rounded-xl border border-subtle p-2"
    >
      <label className="mb-1.5 flex h-9 items-center gap-2 rounded-lg bg-layer-1 px-2.5 text-placeholder">
        <Search className="size-4 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索类型"
          className="w-full border-none bg-transparent text-14 text-primary placeholder:text-placeholder focus:outline-none"
        />
      </label>
      {visible === undefined ? (
        <Loader className="flex flex-col gap-1.5 p-1">
          {[0, 1, 2, 3].map((index) => (
            <Loader.Item key={index} height="52px" />
          ))}
        </Loader>
      ) : visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-13 text-tertiary">{query.trim() ? "没有匹配的类型" : "还没有工作项类型"}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {visible.map((issueType) => {
            const isActive = issueType.id === selectedId;
            const modesLabel = getModesLabel(issueType);
            return (
              <button
                key={issueType.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(issueType.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-[9px] text-left transition-colors",
                  isActive ? "bg-layer-1-selected" : "hover:bg-layer-transparent-hover",
                  issueType.is_active === false && "opacity-60"
                )}
              >
                <TypeIcon
                  iconProps={issueType.logo_props?.icon}
                  className="size-[34px] shrink-0 rounded-lg bg-layer-1"
                  iconClassName="size-[18px]"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-14 font-medium text-primary">{issueType.name}</span>
                    {issueType.is_default && (
                      <span className="shrink-0 rounded bg-layer-1 px-1.5 text-11 leading-5 text-secondary">默认</span>
                    )}
                  </span>
                  <span className={cn("truncate text-12", modesLabel ? "text-tertiary" : "text-placeholder")}>
                    {modesLabel ?? "未被模式使用"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
