import { Fragment, useCallback, useState } from "react";
import { observer } from "mobx-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Bug,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDot,
  CircleX,
  Hourglass,
  RotateCcw,
  UserCheck,
  UserPen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TWorkItemFilterExpression } from "@plane/types";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { FilterOption } from "@/components/issues/issue-layouts/filters";
import { useDefectQuickCounts } from "@/hooks/store/use-defect-quick-counts";
import { useAppRouter } from "@/hooks/use-app-router";
import { DEFECT_PRESET_PARAM, DEFECT_PRESETS, getDefectPreset } from "./defect-presets";
import type { TDefectPreset } from "./defect-presets";

/** 收起后只剩图标，所以每个预设都要有图标 */
const PRESET_ICONS: Record<TDefectPreset, LucideIcon> = {
  all: Bug,
  open: CircleDot,
  reopen: RotateCcw,
  assigned: UserCheck,
  reported: UserPen,
  to_verify: BadgeCheck,
  rejected: CircleX,
  pending_reject: Hourglass,
  closed: CircleCheck,
};

const RAIL_COLLAPSED_STORAGE_KEY = "plane:project-defects:rail-collapsed";
const RAIL_SHOW_EMPTY_STORAGE_KEY = "plane:project-defects:rail-show-empty";

const readFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const writeFlag = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // 隐私模式等拿不到 localStorage 时只影响记忆，不影响功能
  }
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  /** 当前视图 + 筛选条的用户条件，计数在这个范围内算 */
  userFilters: TWorkItemFilterExpression;
};

/**
 * 缺陷页左侧的快捷筛选列：九个固定口径 + 实时计数。
 * 选中项写进 URL 的 `?preset=`，由 DefectListRoot 读取并和视图条件 AND 起来；
 * 样式照工作项列表左侧的分组栏（issue-layouts/list/group-sidebar.tsx），收起后只留图标。
 */
export const DefectQuickFilterRail = observer(function DefectQuickFilterRail(props: Props) {
  const { workspaceSlug, projectId, userFilters } = props;
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preset = getDefectPreset(searchParams.get(DEFECT_PRESET_PARAM));
  const { counts } = useDefectQuickCounts(workspaceSlug, projectId, userFilters);
  const [collapsed, setCollapsed] = useState<boolean>(() => readFlag(RAIL_COLLAPSED_STORAGE_KEY));
  // 默认不显示空组，与缺陷页「显示」里 show_empty_groups 的默认值一致
  const [showEmpty, setShowEmpty] = useState<boolean>(() => readFlag(RAIL_SHOW_EMPTY_STORAGE_KEY));

  const toggleCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    writeFlag(RAIL_COLLAPSED_STORAGE_KEY, next);
  }, []);

  const toggleShowEmpty = useCallback(() => {
    const next = !showEmpty;
    setShowEmpty(next);
    writeFlag(RAIL_SHOW_EMPTY_STORAGE_KEY, next);
  }, [showEmpty]);

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

  return (
    <div
      className={cn(
        "flex h-full flex-shrink-0 flex-col border-r border-subtle bg-surface-1 transition-[width] duration-300 ease-in-out",
        collapsed ? "w-11" : "w-[240px]"
      )}
    >
      <div className="flex h-9 min-h-9 flex-shrink-0 items-center border-b border-subtle px-1.5">
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <FilterOption isChecked={showEmpty} title="显示空组" onClick={toggleShowEmpty} />
          </div>
        )}
        <button
          type="button"
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-tertiary outline-none transition-colors duration-150 hover:bg-layer-transparent-hover hover:text-primary",
            collapsed && "mx-auto"
          )}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "展开快捷筛选" : "收起快捷筛选"}
          onClick={() => toggleCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="size-4" strokeWidth={2} />
          ) : (
            <ChevronLeft className="size-4" strokeWidth={2} />
          )}
        </button>
      </div>
      <div className={cn("vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto", collapsed ? "px-1 py-1" : "p-1.5")}>
        <div className="flex flex-col gap-0.5">
          {DEFECT_PRESETS.map(({ key, label }) => {
            const isActive = key === preset;
            const count = counts?.[key];
            // 当前选中项即使为 0 也保留，免得选中的项凭空消失；「全部」是回到无预设的入口，始终保留
            if (!showEmpty && count === 0 && !isActive && key !== "all") return null;
            const Icon = PRESET_ICONS[key];

            const rowButton = (
              <button
                type="button"
                className={cn(
                  "group flex w-full cursor-pointer items-center outline-none transition-all duration-150",
                  collapsed ? "justify-center rounded-md p-1.5" : "gap-2 rounded-md px-2.5 py-1.5 text-left",
                  isActive
                    ? "bg-layer-transparent-active text-primary"
                    : "text-secondary hover:bg-layer-transparent-hover hover:text-primary active:bg-layer-transparent-active"
                )}
                aria-label={typeof count === "number" ? `${label}，${count} 项` : label}
                aria-current={isActive ? "true" : undefined}
                onClick={() => handleSelect(key)}
              >
                <div className="grid flex-shrink-0 place-items-center">
                  <Icon className="size-4" strokeWidth={2} />
                </div>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                    {typeof count === "number" && (
                      <span className="min-w-[24px] flex-shrink-0 text-center text-xs font-medium tabular-nums text-primary">
                        {count}
                      </span>
                    )}
                  </>
                )}
              </button>
            );

            if (collapsed) {
              return (
                <Tooltip
                  key={key}
                  tooltipContent={
                    <span className="tabular-nums">
                      {label}
                      {typeof count === "number" && (
                        <>
                          <span className="text-tertiary"> · </span>
                          {count}
                        </>
                      )}
                    </span>
                  }
                  position="right"
                >
                  {rowButton}
                </Tooltip>
              );
            }

            return <Fragment key={key}>{rowButton}</Fragment>;
          })}
        </div>
      </div>
    </div>
  );
});
