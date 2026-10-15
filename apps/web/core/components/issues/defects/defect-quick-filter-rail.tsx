import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { usePathname, useSearchParams } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDefectQuickCounts } from "@/hooks/store/use-defect-quick-counts";
import { useAppRouter } from "@/hooks/use-app-router";
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

/** 收起 / 展开按钮，样式与模块树面板（qa/module-tree）的图标按钮一致 */
const RailToggleButton = ({ tip, onClick, collapsed }: { tip: string; onClick: () => void; collapsed: boolean }) => (
  <Tooltip tooltipContent={tip} position={collapsed ? "right" : "bottom"}>
    <button
      type="button"
      aria-label={tip}
      onClick={onClick}
      className="flex size-[26px] shrink-0 items-center justify-center rounded-md text-tertiary outline-none hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-hover"
    >
      {collapsed ? (
        <PanelLeftOpen className="size-[15px]" strokeWidth={2} />
      ) : (
        <PanelLeftClose className="size-[15px]" strokeWidth={2} />
      )}
    </button>
  </Tooltip>
);

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * 缺陷页左侧的快捷筛选列：九个固定口径 + 实时计数。
 * 选中项写进 URL 的 `?preset=`，由 DefectListRoot 读取并转成筛选条件；
 * 收起后留一条窄栏（展开按钮 + 竖排当前选中项），同模块树面板。
 */
export const DefectQuickFilterRail = observer(function DefectQuickFilterRail(props: Props) {
  const { workspaceSlug, projectId } = props;
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preset = getDefectPreset(searchParams.get(DEFECT_PRESET_PARAM));
  const { counts } = useDefectQuickCounts(workspaceSlug, projectId);
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  const toggleCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    writeCollapsed(next);
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

  if (collapsed) {
    const selectedLabel = DEFECT_PRESETS.find((option) => option.key === preset)?.label;
    return (
      <aside className="flex h-full w-9 shrink-0 flex-col items-center gap-2.5 border-r border-subtle bg-surface-1 pt-[7px]">
        <RailToggleButton tip="展开快捷筛选" collapsed onClick={() => toggleCollapsed(false)} />
        {selectedLabel && (
          <span
            className="max-h-[60%] truncate text-12 tracking-[0.08em] text-tertiary [writing-mode:vertical-rl]"
            title={selectedLabel}
          >
            {selectedLabel}
          </span>
        )}
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[212px] shrink-0 flex-col border-r border-subtle bg-surface-1">
      {/* 左边距 18px = 列表 px-2 + 项 px-2.5，标题与各项文字对齐 */}
      <div className="flex h-10 shrink-0 items-center gap-0.5 pt-1 pr-1.5 pl-[18px]">
        <span className="min-w-0 flex-1 truncate text-12 font-medium text-tertiary">快捷筛选</span>
        <RailToggleButton tip="收起快捷筛选" collapsed={false} onClick={() => toggleCollapsed(true)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-0.5 pb-3">
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
      </div>
    </aside>
  );
});
