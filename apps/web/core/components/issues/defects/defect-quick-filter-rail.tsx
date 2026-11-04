import { Fragment, useCallback, useState } from "react";
import type { ReactNode } from "react";
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
import { getGroupByColumns } from "@/components/issues/issue-layouts/utils";
import { useDefectQuickCounts } from "@/hooks/store/use-defect-quick-counts";
import { useAppRouter } from "@/hooks/use-app-router";
import { DEFECT_PRESET_PARAM, DEFECT_PRESETS, getDefectPreset } from "./defect-presets";
import type { TDefectPreset } from "./defect-presets";
import { DEFECT_GROUP_VALUE_PARAM, encodeGroupValue } from "./defect-rail-group";
import type { TDefectRailGroupBy } from "./defect-rail-group";

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

type TRailItem = {
  key: string;
  label: string;
  icon: ReactNode;
  count: number | undefined;
  isActive: boolean;
  /** 计数为 0 也不藏（「全部缺陷」是清空选中的入口） */
  alwaysShow?: boolean;
  onSelect: () => void;
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  /** 当前视图 + 筛选条的用户条件，计数在这个范围内算 */
  userFilters: TWorkItemFilterExpression;
  /** 左栏分组维度，null 为快捷筛选 */
  groupBy: TDefectRailGroupBy | null;
  /** 分组模式下选中的组（URL `?group=`），null 为全部 */
  selectedGroupId: string | null;
  /** 缺陷类别下的类型，按状态分组时只列这些类型的状态 */
  issueTypeIds: string[];
};

/**
 * 缺陷页左栏：默认是九个固定口径的快捷筛选（选中项写进 `?preset=`），
 * 「显示 › 分组方式」切到状态 / 负责人 / 产品等维度后改列该维度的各组（选中项写进 `?group=`）。
 * 两种模式都带实时计数，选中项由 DefectListRoot 读取并和视图条件 AND 起来；
 * 样式照工作项列表左侧的分组栏（issue-layouts/list/group-sidebar.tsx），收起后只留图标。
 */
export const DefectQuickFilterRail = observer(function DefectQuickFilterRail(props: Props) {
  const { workspaceSlug, projectId, userFilters, groupBy, selectedGroupId, issueTypeIds } = props;
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preset = getDefectPreset(searchParams.get(DEFECT_PRESET_PARAM));
  const { counts, groupCounts, groupTotal } = useDefectQuickCounts(workspaceSlug, projectId, userFilters, groupBy);
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

  /** 两种模式的选中项互斥：写一个就清另一个 */
  const navigate = useCallback(
    (nextPreset: TDefectPreset | null, nextGroupValue: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPreset && nextPreset !== "all") params.set(DEFECT_PRESET_PARAM, nextPreset);
      else params.delete(DEFECT_PRESET_PARAM);
      if (nextGroupValue) params.set(DEFECT_GROUP_VALUE_PARAM, nextGroupValue);
      else params.delete(DEFECT_GROUP_VALUE_PARAM);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, router, pathname]
  );

  const items: TRailItem[] = [];
  if (!groupBy) {
    DEFECT_PRESETS.forEach(({ key, label }) => {
      const Icon = PRESET_ICONS[key];
      items.push({
        key,
        label,
        icon: <Icon className="size-4" strokeWidth={2} />,
        count: counts?.[key],
        isActive: key === preset,
        alwaysShow: key === "all",
        onSelect: () => navigate(key, null),
      });
    });
  } else {
    items.push({
      key: "all",
      label: "全部缺陷",
      icon: <Bug className="size-4" strokeWidth={2} />,
      count: groupTotal,
      isActive: !selectedGroupId,
      alwaysShow: true,
      onSelect: () => navigate(null, null),
    });
    const columns =
      getGroupByColumns({ groupBy, includeNone: true, isWorkspaceLevel: false, projectId, issueTypeIds }) ?? [];
    // 组名、图标与工作项列表左侧分组栏一致（同一个 getGroupByColumns）
    columns.forEach((column) => {
      items.push({
        key: column.id,
        label: column.name,
        icon: column.icon ?? <Bug className="size-4" strokeWidth={2} />,
        // 计数没回来之前按 0 处理（不显示空组时先不列），免得整列成员先闪一下再收起
        count: groupCounts?.[column.id] ?? 0,
        isActive: column.id === selectedGroupId,
        onSelect: () => navigate(null, encodeGroupValue(groupBy, column.id)),
      });
    });
  }

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
          aria-label={collapsed ? "展开左栏" : "收起左栏"}
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
          {items.map(({ key, label, icon, count, isActive, alwaysShow, onSelect }) => {
            // 当前选中项即使为 0 也保留，免得选中的项凭空消失
            if (!showEmpty && count === 0 && !isActive && !alwaysShow) return null;

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
                onClick={onSelect}
              >
                <div className="grid flex-shrink-0 place-items-center">{icon}</div>
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
