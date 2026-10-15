import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@plane/utils";
import { useDefectQuickCounts } from "@/hooks/store/use-defect-quick-counts";
import { useAppRouter } from "@/hooks/use-app-router";
import { PROJECT_DEFECT_RAIL_TOGGLE_EVENT } from "./defect-filter-events";
import { DEFECT_PRESET_PARAM, DEFECT_PRESETS, getDefectPreset } from "./defect-presets";
import type { TDefectPreset } from "./defect-presets";

const RAIL_COLLAPSED_STORAGE_KEY = "plane:project-defects:rail-collapsed";

const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(RAIL_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const writeCollapsed = (collapsed: boolean) => {
  try {
    localStorage.setItem(RAIL_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // 隐私模式等拿不到 localStorage 时只影响记忆，不影响功能
  }
};

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * 缺陷页左侧的快捷筛选列：九个固定口径 + 实时计数。
 * 选中项写进 URL 的 `?preset=`，由 DefectListRoot 读取并转成筛选条件；页头按钮可收起。
 */
export const DefectQuickFilterRail = observer(function DefectQuickFilterRail(props: Props) {
  const { workspaceSlug, projectId } = props;
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preset = getDefectPreset(searchParams.get(DEFECT_PRESET_PARAM));
  const { counts } = useDefectQuickCounts(workspaceSlug, projectId);
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  useEffect(() => {
    const handleToggle = () => {
      setCollapsed((current) => {
        const next = !current;
        writeCollapsed(next);
        return next;
      });
    };
    window.addEventListener(PROJECT_DEFECT_RAIL_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(PROJECT_DEFECT_RAIL_TOGGLE_EVENT, handleToggle);
  }, []);

  const handleSelect = useCallback(
    (next: TDefectPreset) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete(DEFECT_PRESET_PARAM);
      else params.set(DEFECT_PRESET_PARAM, next);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, router, pathname]
  );

  if (collapsed) return null;

  return (
    <aside className="flex h-full w-[212px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-subtle bg-surface-1 px-2 py-3">
      {DEFECT_PRESETS.map(({ key, label }) => {
        const isSelected = key === preset;
        const count = counts?.[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isSelected}
            onClick={() => handleSelect(key)}
            className={cn(
              "flex h-[34px] shrink-0 items-center justify-between gap-2 rounded-md px-2.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent-strong focus-visible:ring-inset",
              isSelected
                ? "bg-layer-transparent-active text-primary"
                : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
            )}
          >
            <span className={cn("min-w-0 flex-1 truncate text-14", isSelected && "font-medium")}>{label}</span>
            {typeof count === "number" && (
              // 不走 cn：它会把 text-13 与 text-tertiary 当成同组，把字号吞掉
              <span
                className={`shrink-0 text-13 tabular-nums ${isSelected ? "font-medium text-accent-primary" : "text-tertiary"}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </aside>
  );
});
