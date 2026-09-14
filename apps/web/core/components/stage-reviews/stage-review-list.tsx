import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { observer } from "mobx-react";
import { ClipboardCheck, SearchX } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IUserLite, TStageReview } from "@plane/types";
import { COLLECTION_OPERATOR, EStageReviewStatus, LOGICAL_OPERATOR } from "@plane/types";
import { Loader } from "@plane/ui";
import { toFilterArray } from "@plane/utils";
import { CountChip } from "@/components/common/count-chip";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { useStageReviews } from "@/hooks/store/use-stage-reviews";
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { StageReviewDrawer } from "./detail/stage-review-drawer";
import { StageReviewDisplayDropdown } from "./display/display-dropdown";
import { useStageReviewDisplay } from "./display/display-settings";
import { stageReviewMatchesConditions } from "./filters/match-stage-review";
import { useStageReviewFilter } from "./filters/use-stage-review-filter";
import { useStageReviewFiltersConfig } from "./filters/use-stage-review-filters-config";
import { StageReviewGroupSidebar } from "./group-sidebar/group-sidebar";
import { useStageReviewGrouping } from "./group-sidebar/use-stage-review-grouping";
import { STAGE_REVIEWS_HEADER_ACTIONS_ID, STAGE_REVIEWS_HEADER_COUNT_ID } from "./header-slots";
import { useStageReviewPermissions } from "./permissions";
import { StageReviewTable } from "./stage-review-table";
import { StageReviewSummary } from "./stage-summary";

const I18N = "stage_review";

/**
 * 阶段评审列表，布局照工作项：左侧分组栏（「显示 → 分组方式」决定按什么分，默认研发阶段；
 * 选「无」不出分组栏），右侧是选中那一组的摘要 + 按属性列出的评审表；点一行开右侧抽屉。
 *
 * 页头的搜索 / 筛选 / 显示照工作项：筛选是页头下方的筛选行，显示是「显示属性 / 分组方式 /
 * 排序方式 / 显示评审活动 / 显示空组」。**评审只由裁剪表生成**，这里没有新建与删除；被裁剪
 * 掉的评审也不会出现，它们在裁剪表里带着原因存档。
 */
export const StageReviewList = observer(function StageReviewList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { getWorkspaceBySlug } = useWorkspace();
  const { canManage } = useStageReviewPermissions(workspaceSlug, projectId);
  const { stages, reviews, isLoading, error, applyReview } = useStageReviews(workspaceSlug, projectId);

  const [search, setSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  const [countHost, setCountHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setActionsHost(document.getElementById(STAGE_REVIEWS_HEADER_ACTIONS_ID));
    setCountHost(document.getElementById(STAGE_REVIEWS_HEADER_COUNT_ID));
  }, []);

  const { settings, updateSettings } = useStageReviewDisplay(projectId, currentUser?.id);
  const { areAllConfigsInitialized, configs } = useStageReviewFiltersConfig({
    reviews,
    workspaceSlug,
    currentUser: currentUser as IUserLite | undefined,
  });
  const filter = useStageReviewFilter({ areAllConfigsInitialized, configs, projectId });
  const conditions = filter.allConditionsForDisplay;

  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const isHit = useCallback(
    (review: TStageReview) => {
      const keyword = search.trim().toLowerCase();
      return (
        (!keyword || review.title.toLowerCase().includes(keyword)) &&
        stageReviewMatchesConditions(review, conditions, currentUser?.id)
      );
    },
    [search, conditions, currentUser?.id]
  );

  const { sidebarGroups, rowsOf, reviewsOf } = useStageReviewGrouping({ reviews, stages, isHit, settings });

  // 选中的组不在当前分组栏里（切了分组方式、被筛没了）就落到第一组，同工作项
  const isGrouped = settings.groupBy !== "none";
  const activeGroup = isGrouped
    ? (sidebarGroups.find((group) => group.id === selectedGroupId) ?? sidebarGroups[0] ?? null)
    : null;
  const rows = isGrouped ? rowsOf(activeGroup?.id ?? null) : rowsOf(null);
  const summaryReviews = isGrouped ? (activeGroup ? reviewsOf(activeGroup.id) : []) : reviews;
  const summaryLabel = isGrouped ? (activeGroup?.name ?? "") : t(`${I18N}.list.all_reviews`);

  // 摘要图例与筛选行里的「状态」是同一个条件
  const statusCondition = conditions.find((condition) => condition.property === "status");
  const activeStatuses = (toFilterArray(statusCondition?.value as never) ?? []).map(String) as EStageReviewStatus[];

  const handleToggleStatus = (status: EStageReviewStatus) => {
    if (!statusCondition) {
      filter.addCondition(
        LOGICAL_OPERATOR.AND,
        { property: "status", operator: COLLECTION_OPERATOR.IN, value: [status] },
        false
      );
      filter.toggleVisibility(true);
      return;
    }
    const next = activeStatuses.includes(status)
      ? activeStatuses.filter((value) => value !== status)
      : [...activeStatuses, status];
    if (next.length === 0) filter.removeCondition(statusCondition.id);
    else filter.updateConditionValue(statusCondition.id, next);
  };

  const handleClearAll = () => {
    setSearch("");
    void filter.clearFilters();
  };

  if (isLoading) {
    return (
      <Loader className="flex h-full gap-4 p-4">
        <Loader.Item height="100%" width="240px" />
        <div className="flex flex-1 flex-col gap-3">
          <Loader.Item height="96px" />
          <Loader.Item height="320px" />
        </div>
      </Loader>
    );
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-14 font-medium text-primary">{t(`${I18N}.error_title`)}</p>
          <p className="mt-1 text-12 text-tertiary">{error}</p>
        </div>
      </div>
    );
  }

  const renderBody = () => {
    if (reviews.length === 0) {
      return (
        <div className="grid h-full place-items-center px-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <ClipboardCheck className="size-8 text-tertiary" />
            <p className="text-14 font-medium text-primary">{t(`${I18N}.empty.title`)}</p>
            <p className="max-w-80 text-12 leading-relaxed text-tertiary">{t(`${I18N}.empty.description`)}</p>
          </div>
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="grid h-full place-items-center px-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <SearchX className="size-8 text-tertiary" />
            <p className="text-14 font-medium text-primary">{t(`${I18N}.list.empty_filtered_title`)}</p>
            <p className="max-w-80 text-12 leading-relaxed text-tertiary">
              {t(`${I18N}.list.empty_filtered_description`)}
            </p>
            <Button variant="secondary" size="sm" className="mt-1" onClick={handleClearAll}>
              {t(`${I18N}.list.clear_filters`)}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <StageReviewTable
        rows={rows}
        settings={settings}
        today={today}
        activeReviewId={openReviewId}
        onOpen={setOpenReviewId}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FiltersRow filter={filter} />

      <div className="flex min-h-0 flex-1">
        {isGrouped && (
          <StageReviewGroupSidebar
            groupBy={settings.groupBy}
            groups={sidebarGroups}
            selectedGroupId={activeGroup?.id ?? null}
            onSelectGroup={setSelectedGroupId}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {(!isGrouped || activeGroup) && reviews.length > 0 && (
            <StageReviewSummary
              label={summaryLabel}
              reviews={summaryReviews}
              activeStatuses={activeStatuses}
              onToggleStatus={handleToggleStatus}
            />
          )}
          <div className="min-h-0 flex-1 overflow-auto">{renderBody()}</div>
        </div>
      </div>

      <StageReviewDrawer
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        reviewId={openReviewId}
        canManage={canManage}
        onClose={() => setOpenReviewId(null)}
        onUpdated={applyReview}
      />

      {actionsHost &&
        createPortal(
          <>
            <PageSearchInput
              searchQuery={search}
              updateSearchQuery={setSearch}
              placeholder={t(`${I18N}.list.search_placeholder`)}
            />
            <FiltersToggle filter={filter} enableQuickAddFilter={false} />
            <StageReviewDisplayDropdown settings={settings} onChange={updateSettings} />
          </>,
          actionsHost
        )}
      {countHost && reviews.length > 0 && createPortal(<CountChip count={reviews.length} />, countHost)}
    </div>
  );
});
