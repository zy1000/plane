/**
 * 一份基线的详情：头部信息 + 收录的需求表格。
 *
 * 内容不可改，能改的只有名字和说明 —— 想「更新基线」就再打一份新的，那正是快照该有的
 * 语义。列表复用总览网格，点开抽屉也只渲染收录时的 snapshot。
 */
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementBaseline, TRequirementBaselineEntry, TRequirementTypeSchema } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { RequirementDefaultViewGrid } from "../requirement-default-view-grid";
import { baselineEntryToRequirement } from "./baseline-entry-adapter";
import { BaselineRequirementPeek } from "./baseline-requirement-peek";

type TProps = {
  workspaceSlug: string;
  productId: string;
  baseline: TRequirementBaseline | null;
  entries: TRequirementBaselineEntry[];
  totalCount: number;
  isLoading: boolean;
  isEntriesLoading: boolean;
  error: string | null;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  requirementTypes: TRequirementTypeSchema[];
  activeRequirementTypeId?: string;
  peekRequirementId: string | null;
  onRequirementTypeChange: (requirementTypeId: string | undefined) => void;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
  onOpenPeek: (requirementId: string | null) => void;
  onBack: () => void;
};

export function BaselineDetail(props: TProps) {
  const {
    workspaceSlug,
    productId,
    baseline,
    entries,
    totalCount,
    isLoading,
    isEntriesLoading,
    error,
    perPage,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    requirementTypes,
    activeRequirementTypeId,
    peekRequirementId,
    onRequirementTypeChange,
    onPerPageChange,
    onCursorChange,
    onOpenPeek,
    onBack,
  } = props;
  const { t } = useTranslation();
  const requirements = useMemo(
    () => entries.map((entry) => baselineEntryToRequirement(entry, productId)),
    [entries, productId]
  );

  if (isLoading && !baseline) {
    return (
      <div className="p-4">
        <Loader className="space-y-2">
          <Loader.Item height="64px" />
          {Array.from({ length: 5 }, (_, index) => (
            <Loader.Item key={index} height="40px" />
          ))}
        </Loader>
      </div>
    );
  }

  if (error || !baseline) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <div>
          <p className="text-13 font-medium text-primary">
            {t("workspace_products.requirements.baseline.error_title")}
          </p>
          <p className="mt-1 text-12 text-secondary">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={onBack}>
            {t("workspace_products.requirements.baseline.detail.back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-subtle px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-11 text-secondary hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          {t("workspace_products.requirements.baseline.detail.back")}
        </button>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-15 font-semibold text-primary">{baseline.name}</h2>
          <span className="text-11 text-tertiary">
            {t("workspace_products.requirements.baseline.detail.frozen_at", {
              date: renderFormattedDate(baseline.created_at),
              name: baseline.created_by_detail?.display_name ?? "",
            })}
          </span>
        </div>
        {baseline.description && <p className="mt-1 text-12 leading-5 text-secondary">{baseline.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TypeChip
            label={t("workspace_products.requirements.baseline.detail.all_types", { count: baseline.entry_count })}
            isActive={!activeRequirementTypeId}
            onClick={() => onRequirementTypeChange(undefined)}
          />
          {baseline.requirement_type_stats.map((stat) => (
            <TypeChip
              key={stat.id}
              label={`${stat.name || t("workspace_products.requirements.baseline.detail.deleted_type")} · ${stat.requirement_count}`}
              isActive={activeRequirementTypeId === stat.id}
              onClick={() => onRequirementTypeChange(stat.id)}
            />
          ))}
        </div>
      </header>

      <RequirementDefaultViewGrid
        workspaceSlug={workspaceSlug}
        productId={productId}
        requirementTypes={requirementTypes}
        requirements={requirements}
        totalCount={totalCount}
        perPage={perPage}
        nextCursor={nextCursor}
        prevCursor={prevCursor}
        nextPageResults={nextPageResults}
        prevPageResults={prevPageResults}
        isLoading={isEntriesLoading}
        isMutating={false}
        error={null}
        readOnly
        hideToolbar
        skipRemoteParentTitles
        emptyText={t("workspace_products.requirements.baseline.detail.empty")}
        search=""
        onSearchChange={() => undefined}
        onCursorChange={onCursorChange}
        onPerPageChange={onPerPageChange}
        onDelete={async () => undefined}
        onDuplicate={async () => undefined}
        onOpenDetail={onOpenPeek}
      />

      <BaselineRequirementPeek
        workspaceSlug={workspaceSlug}
        productId={productId}
        requirementId={peekRequirementId}
        entries={entries}
        requirementTypes={requirementTypes}
        onClose={() => onOpenPeek(null)}
        onOpenRequirement={onOpenPeek}
        shareHref={(requirementId) =>
          `${workspaceSlug}/products/${productId}/requirements?tab=baselines&bl=${baseline.id}&peek=${requirementId}`
        }
      />
    </div>
  );
}

function TypeChip({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-11 transition-colors",
        isActive
          ? "border-accent-primary bg-accent-subtle text-accent-primary"
          : "border-subtle text-secondary hover:text-primary"
      )}
    >
      {label}
    </button>
  );
}
