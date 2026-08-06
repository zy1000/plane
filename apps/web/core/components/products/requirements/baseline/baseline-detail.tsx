/**
 * 一份基线的详情：头部信息 + 收录的需求。
 *
 * 内容不可改，能改的只有名字和说明 —— 想「更新基线」就再打一份新的，那正是快照该有的
 * 语义。展开一条才渲染它的完整快照，一页 20 条全渲染会把几百个字段一次铺出来。
 */
import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementBaseline, TRequirementBaselineEntry, TRequirementTypeSchema } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { BaselineEntrySnapshot } from "./baseline-entry-snapshot";
import { BaselinePagination } from "./baseline-pagination";

type TProps = {
  workspaceSlug: string;
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
  onRequirementTypeChange: (requirementTypeId: string | undefined) => void;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
  onBack: () => void;
};

export function BaselineDetail(props: TProps) {
  const {
    workspaceSlug,
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
    onRequirementTypeChange,
    onPerPageChange,
    onCursorChange,
    onBack,
  } = props;
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 md:px-6">
        {isEntriesLoading ? (
          <Loader className="space-y-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Loader.Item key={index} height="40px" />
            ))}
          </Loader>
        ) : !entries.length ? (
          <p className="py-16 text-center text-13 text-tertiary">
            {t("workspace_products.requirements.baseline.detail.empty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const typeName = requirementTypes.find((item) => item.id === entry.requirement_type_id)?.name;
              return (
                <li key={entry.id} className="rounded-md border border-subtle">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-12 text-primary">
                      {entry.snapshot.title || t("requirement_detail.untitled")}
                    </span>
                    {typeName && <span className="shrink-0 text-11 text-tertiary">{typeName}</span>}
                    <span className="shrink-0 text-11 text-tertiary tabular-nums">v{entry.version_number}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <BaselineEntrySnapshot entry={entry} workspaceSlug={workspaceSlug} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BaselinePagination
        label={t("workspace_products.requirements.baseline.entry_count", { count: totalCount })}
        perPage={perPage}
        nextCursor={nextCursor}
        prevCursor={prevCursor}
        nextPageResults={nextPageResults}
        prevPageResults={prevPageResults}
        onPerPageChange={onPerPageChange}
        onCursorChange={onCursorChange}
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
