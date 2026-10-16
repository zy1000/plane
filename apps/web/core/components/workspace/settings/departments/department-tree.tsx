import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, ListChecks, UserRound } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { SearchIcon } from "@plane/propel/icons";
import type { TDepartmentTree } from "@plane/types";
import { cn } from "@plane/utils";
import { DEPARTMENTS_I18N as I18N, UNASSIGNED_DEPARTMENT } from "./helpers";

type Props = {
  tree: TDepartmentTree;
  selected: string | null;
  onSelect: (department: string | null) => void;
};

type RowProps = {
  label: string;
  count: number;
  depth: number;
  isSelected: boolean;
  icon: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
};

function TreeRow(props: RowProps) {
  const { label, count, depth, isSelected, icon, expanded, onToggle, onSelect } = props;
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 rounded-md pr-2 transition-colors",
        isSelected ? "bg-layer-transparent-active text-primary" : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
      )}
      style={{ paddingLeft: 6 + depth * 18 }}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={label} aria-expanded={expanded} className="grid size-4 place-items-center rounded text-tertiary hover:text-primary">
            <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
          </button>
        )}
      </span>
      <button type="button" onClick={onSelect} aria-current={isSelected ? "true" : undefined} className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
        <span className={isSelected ? "shrink-0 text-accent-primary" : "shrink-0 text-tertiary"}>{icon}</span>
        <span className={`min-w-0 flex-1 truncate text-13 ${isSelected ? "font-medium" : ""}`}>{label}</span>
        {/* 不走 cn：它会把字号与颜色当成同组吞掉 */}
        <span className={`shrink-0 text-12 tabular-nums ${isSelected ? "font-medium text-primary" : "text-tertiary"}`}>{count}</span>
      </button>
    </div>
  );
}

/** 左栏部门树：搜索 + 全部人员 + 三级 / 四级两层 + 底部未分配部门 */
export function DepartmentTree(props: Props) {
  const { tree, selected, onSelect } = props;
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 选中了某个四级部门（如从三级的子部门 chip 点进来）：自动展开它的上级
  useEffect(() => {
    const parent = tree.tree.find((center) => center.children.some((child) => child.id === selected));
    if (parent) setExpanded((current) => (current.has(parent.id) ? current : new Set(current).add(parent.id)));
  }, [selected, tree]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return tree.tree.map((center) => ({ center, children: center.children, forceOpen: false }));
    return tree.tree
      .map((center) => {
        const centerHit = center.name.toLowerCase().includes(query);
        const children = centerHit ? center.children : center.children.filter((child) => child.name.toLowerCase().includes(query));
        return { center, children, forceOpen: children.length > 0, hit: centerHit || children.length > 0 };
      })
      .filter((item) => item.hit);
  }, [tree, query]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-subtle md:w-72 md:border-b-0 md:border-r">
      <div className="p-3">
        <label className="flex h-9 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5">
          <SearchIcon className="size-3.5 shrink-0 text-placeholder" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(`${I18N}.tree.search_placeholder`)}
            aria-label={t(`${I18N}.tree.search_placeholder`)}
            className="min-w-0 flex-1 border-none bg-transparent text-13 outline-none placeholder:text-placeholder"
          />
        </label>
      </div>
      <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
        {!query && (
          <TreeRow
            label={t(`${I18N}.tree.all`)}
            count={tree.total}
            depth={0}
            isSelected={selected === null}
            icon={<ListChecks className="size-3.5" />}
            onSelect={() => onSelect(null)}
          />
        )}
        {visible.length === 0 ? (
          <p className="px-2 py-8 text-center text-12 text-placeholder">
            {t(tree.tree.length === 0 ? `${I18N}.tree.empty` : `${I18N}.tree.no_match`)}
          </p>
        ) : (
          visible.map(({ center, children, forceOpen }) => {
            const isOpen = forceOpen || expanded.has(center.id);
            return (
              <div key={center.id} className="flex flex-col gap-px">
                <TreeRow
                  label={center.name}
                  count={center.count}
                  depth={0}
                  isSelected={selected === center.id}
                  icon={<Folder className="size-3.5" />}
                  expanded={isOpen}
                  onToggle={center.children.length > 0 ? () => toggle(center.id) : undefined}
                  onSelect={() => onSelect(center.id)}
                />
                {isOpen &&
                  children.map((child) => (
                    <TreeRow
                      key={child.id}
                      label={child.name}
                      count={child.count}
                      depth={1}
                      isSelected={selected === child.id}
                      icon={<Folder className="size-3.5" />}
                      onSelect={() => onSelect(child.id)}
                    />
                  ))}
              </div>
            );
          })
        )}
      </div>
      {tree.unassigned > 0 && (
        <div className="border-t border-subtle p-2">
          <TreeRow
            label={t(`${I18N}.tree.unassigned`)}
            count={tree.unassigned}
            depth={0}
            isSelected={selected === UNASSIGNED_DEPARTMENT}
            icon={<UserRound className="size-3.5" />}
            onSelect={() => onSelect(UNASSIGNED_DEPARTMENT)}
          />
        </div>
      )}
    </aside>
  );
}
