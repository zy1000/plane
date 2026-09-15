import { Fragment, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { EStageReviewStatus } from "@plane/types";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TStageReviewGroupBy } from "../display/display-settings";
import { STAGE_REVIEW_STATUS_FILL } from "../status-icon";
import type { TStageReviewSidebarGroup } from "./use-stage-review-grouping";

const I18N = "stage_review";

/** 阶段进度条从左往右：已评审 → 审核中 → 评审中，剩下的底色就是未评审 */
const STAGE_BAR: { status: EStageReviewStatus; key: "completed" | "in_approval" | "in_review" }[] = [
  { status: EStageReviewStatus.COMPLETED, key: "completed" },
  { status: EStageReviewStatus.IN_APPROVAL, key: "in_approval" },
  { status: EStageReviewStatus.IN_REVIEW, key: "in_review" },
];

/**
 * 左侧分组栏，照工作项的 `issue-layouts/list/group-sidebar.tsx`：标题「分组方式 : 维度」、
 * 可收起成一列图标、点一组右侧只看这一组。按研发阶段分组时每行下面多一条阶段完成度。
 */
export const StageReviewGroupSidebar = ({
  groupBy,
  groups,
  selectedGroupId,
  onSelectGroup,
}: {
  groupBy: TStageReviewGroupBy;
  groups: TStageReviewSidebarGroup[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
}) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const heading = `${t(`${I18N}.display.group_by`)} : ${t(`${I18N}.display.group.${groupBy}`)}`;

  return (
    <div
      className={cn(
        "flex h-full flex-shrink-0 flex-col border-r border-subtle bg-surface-1 transition-[width] duration-300 ease-in-out",
        isCollapsed ? "w-11" : "w-[240px]"
      )}
    >
      <div className="flex h-9 min-h-9 flex-shrink-0 items-center border-b border-subtle px-1.5">
        {!isCollapsed && (
          <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium tracking-wider text-tertiary">{heading}</span>
        )}
        <button
          type="button"
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-tertiary outline-none transition-colors duration-150 hover:bg-layer-transparent-hover hover:text-primary",
            isCollapsed && "mx-auto"
          )}
          aria-expanded={!isCollapsed}
          aria-label={t(`${I18N}.list.${isCollapsed ? "expand_sidebar" : "collapse_sidebar"}`)}
          onClick={() => setIsCollapsed((value) => !value)}
        >
          {isCollapsed ? <ChevronRight className="size-4" strokeWidth={2} /> : <ChevronLeft className="size-4" strokeWidth={2} />}
        </button>
      </div>

      <div className={cn("vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto", isCollapsed ? "px-1 py-1" : "p-1.5")}>
        {groups.length === 0 && !isCollapsed ? (
          <p className="px-2.5 py-2 text-12 leading-relaxed text-tertiary">{t(`${I18N}.rail.empty`)}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {groups.map((group) => {
              const isActive = selectedGroupId === group.id;
              const rowClassName = isActive
                ? "bg-layer-transparent-active text-primary"
                : "text-secondary hover:bg-layer-transparent-hover hover:text-primary active:bg-layer-transparent-active";

              const rowButton = (
                <button
                  type="button"
                  className={cn(
                    "group flex w-full cursor-pointer flex-col outline-none transition-all duration-150",
                    isCollapsed ? "items-center rounded-md p-1.5" : "gap-1.5 rounded-md px-2.5 py-1.5 text-left",
                    rowClassName
                  )}
                  aria-label={`${group.name}，${group.count} 项`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => onSelectGroup(group.id)}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="grid size-4 flex-shrink-0 place-items-center">{group.icon}</span>
                    {!isCollapsed && (
                      <>
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{group.name}</span>
                          {group.isCurrent && (
                            <span className="shrink-0 rounded bg-accent-subtle px-1 text-11 leading-4 font-semibold text-accent-primary">
                              {t(`${I18N}.list.current`)}
                            </span>
                          )}
                        </span>
                        <span className="min-w-[24px] flex-shrink-0 text-center text-xs font-medium tabular-nums text-primary">
                          {group.count}
                        </span>
                      </>
                    )}
                  </span>
                  {!isCollapsed && group.stage && (
                    <span className="ml-6 flex h-1 w-[calc(100%-1.5rem)] overflow-hidden rounded-full bg-layer-3">
                      {STAGE_BAR.map(({ status, key }) =>
                        group.stage![key] > 0 ? (
                          <span
                            key={status}
                            className={cn("h-full", STAGE_REVIEW_STATUS_FILL[status])}
                            style={{ width: `${(group.stage![key] / Math.max(group.stage!.total, 1)) * 100}%` }}
                          />
                        ) : null
                      )}
                    </span>
                  )}
                </button>
              );

              if (isCollapsed) {
                return (
                  <Tooltip
                    key={group.id}
                    tooltipContent={
                      <span className="tabular-nums">
                        {group.name}
                        <span className="text-tertiary"> · </span>
                        {group.count}
                      </span>
                    }
                    position="right"
                  >
                    {rowButton}
                  </Tooltip>
                );
              }
              return <Fragment key={group.id}>{rowButton}</Fragment>;
            })}
          </div>
        )}
      </div>
    </div>
  );
};
