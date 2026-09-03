"use client";

import { useCallback, useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementTrailEntry, TRequirementTypeSchema } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { DetailSectionHeader } from "./requirement-detail-section";
import { RequirementHistoryChangeEntry } from "./requirement-history-change-entry";
import { RequirementHistoryComparePanel } from "./requirement-history-compare-panel";
import type { THistoryFilter } from "./requirement-history-model";
import { RequirementHistorySchemaGroup } from "./requirement-history-schema-group";
import { HistoryEmpty, HistoryTimeline } from "./requirement-history-timeline";
import { RequirementHistoryToolbar } from "./requirement-history-toolbar";
import { EMPTY_SNAPSHOT_DIFF } from "./requirement-snapshot-diff";
import { useRequirementHistoryItems } from "./use-requirement-history-items";
import { useRequirementRollback } from "./use-requirement-rollback";
import { useRequirementVersions } from "./use-requirement-versions";

/**
 * 详情底部的「历史」区：一条时间线。
 *
 * 版本只在变更单通过时写入，与轨迹里「已通过」的条目一一对应 —— 分成「变更轨迹 / 版本历史」
 * 两个页签是把同一件事讲两遍。这里合成一条：通过的改动就是版本节点，行内长出版本动作；
 * 没通过的只是圆点；过滤代替页签，「只看版本」就是原来的版本页。
 *
 * 版本链随区块一起拉（不再懒加载）：版本节点的动作、当前版判断、「对比两版」能不能点，
 * 首屏就要用；一条需求的版本数是个位数。从未提交过评审的需求不打这个请求。
 */
export const RequirementHistorySection = ({
  workspaceSlug,
  productId,
  requirementId,
  requirementType,
  trail,
  approvedVersion,
  canRollback,
  onRolledBack,
}: {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  requirementType: TRequirementTypeSchema | null;
  trail: TRequirementTrailEntry[];
  approvedVersion: number | null;
  canRollback: boolean;
  onRolledBack?: () => void;
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<THistoryFilter>("all");
  const [isComparing, setIsComparing] = useState(false);

  const { versions, isLoading, isRollingBack, error, refresh, rollback } = useRequirementVersions({
    workspaceSlug,
    productId,
    requirementId,
    enabled: trail.length > 0 || approvedVersion !== null,
  });
  const { items, visibleItems, counts, sortedVersions, diffByItemId } = useRequirementHistoryItems({
    trail,
    versions,
    requirementType,
    approvedVersion,
    filter,
  });

  // 回滚不写版本也不写变更项，但活行变了：先刷版本链（防御），再让调用方刷详情与轨迹
  const handleRolledBack = useCallback(async () => {
    await refresh();
    onRolledBack?.();
  }, [onRolledBack, refresh]);
  const rollbackFlow = useRequirementRollback({ rollback, approvedVersion, onDone: handleRolledBack });

  const canCompare = sortedVersions.length >= 2;
  const showHiddenNote = filter === "versions" && (counts.nonVersionChanges > 0 || counts.schema > 0);

  return (
    <section className="flex flex-col gap-3">
      <DetailSectionHeader
        icon={History}
        title={t("requirement_detail.history.label")}
        meta={
          items.length > 0
            ? t("requirement_detail.history.meta", { versions: counts.versions, changes: counts.changes })
            : undefined
        }
        actions={
          <RequirementHistoryToolbar
            filter={filter}
            onFilterChange={setFilter}
            counts={counts}
            canCompare={canCompare}
            isComparing={isComparing}
            onToggleCompare={() => setIsComparing((current) => !current)}
          />
        }
      />

      {isComparing && canCompare && (
        <RequirementHistoryComparePanel
          versions={sortedVersions}
          approvedVersion={approvedVersion}
          requirementType={requirementType}
          workspaceSlug={workspaceSlug}
          onClose={() => setIsComparing(false)}
        />
      )}

      {items.length === 0 ? (
        isLoading ? (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="28px" />
            <Loader.Item height="28px" />
          </Loader>
        ) : (
          <HistoryEmpty
            title={t("requirement_detail.history.empty")}
            description={t("requirement_detail.history.empty_description")}
          />
        )
      ) : visibleItems.length === 0 ? (
        <div className="flex items-center gap-2 py-3 pl-8 text-body-xs-regular text-tertiary">
          <span>{t("requirement_detail.history.filter_empty")}</span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="inline-flex items-center gap-0.5 text-secondary transition-colors hover:text-accent-primary"
          >
            {t("requirement_detail.history.show_all")}
            <ChevronRight className="size-3" />
          </button>
        </div>
      ) : (
        <HistoryTimeline>
          {visibleItems.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === visibleItems.length - 1;
            return item.kind === "schema" ? (
              <RequirementHistorySchemaGroup
                key={item.id}
                group={item}
                isFirst={isFirst}
                isLast={isLast}
                forceExpanded={filter === "schema"}
              />
            ) : (
              <RequirementHistoryChangeEntry
                key={item.id}
                item={item}
                diff={diffByItemId.get(item.id) ?? EMPTY_SNAPSHOT_DIFF}
                workspaceSlug={workspaceSlug}
                requirementType={requirementType}
                canRollback={canRollback}
                isFirst={isFirst}
                isLast={isLast}
                onRollback={rollbackFlow.request}
              />
            );
          })}
        </HistoryTimeline>
      )}

      {showHiddenNote && (
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-subtle-1 pt-2.5 pl-[42px] text-caption-md-regular text-placeholder">
          <span>
            {t("requirement_detail.history.hidden_summary", {
              changes: counts.nonVersionChanges,
              schema: counts.schema,
            })}
          </span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="inline-flex items-center gap-0.5 text-tertiary transition-colors hover:text-accent-primary"
          >
            {t("requirement_detail.history.show_all")}
            <ChevronRight className="size-3" />
          </button>
        </div>
      )}

      {error && <p className="text-caption-md-regular text-danger-secondary">{t("requirement_detail.history.load_error")}</p>}

      <AlertModalCore
        isOpen={rollbackFlow.target !== null}
        isSubmitting={isRollingBack}
        handleClose={rollbackFlow.cancel}
        handleSubmit={() => void rollbackFlow.confirm()}
        title={t("requirement_detail.versions.rollback_title", { version: rollbackFlow.target ?? 0 })}
        content={t("requirement_detail.versions.rollback_description", { version: rollbackFlow.target ?? 0 })}
        primaryButtonText={{
          default: t("requirement_detail.versions.rollback_confirm"),
          loading: t("requirement_detail.versions.rollback_confirm"),
        }}
        secondaryButtonText={t("cancel")}
      />
    </section>
  );
};
