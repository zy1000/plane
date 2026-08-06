/**
 * 两份基线的差异。
 *
 * 差异条目的形状与变更单条目一致，所以直接复用单条需求的竖排两栏 diff —— 「这两份基线
 * 差在哪」和「这张单改了什么」读起来是同一件事，不该有两套视觉语言。
 */
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementBaselineCompareResponse, TRequirementField } from "@plane/types";
import { Loader } from "@plane/ui";
import { ChangeRequestRequirementDiff } from "../change/change-request-requirement-diff";
import { BaselinePagination } from "./baseline-pagination";

type TProps = {
  workspaceSlug: string;
  comparison: TRequirementBaselineCompareResponse | null;
  /** 全部需求类型字段的扁平并集，按条目所属类型裁一次再传给 diff */
  fields: TRequirementField[];
  isLoading: boolean;
  error: string | null;
  perPage: number;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
  onBack: () => void;
};

export function BaselineCompare(props: TProps) {
  const { workspaceSlug, comparison, fields, isLoading, error, perPage, onPerPageChange, onCursorChange, onBack } =
    props;
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="p-4">
        <Loader className="space-y-2">
          <Loader.Item height="48px" />
          {Array.from({ length: 4 }, (_, index) => (
            <Loader.Item key={index} height="120px" />
          ))}
        </Loader>
      </div>
    );
  }

  if (error || !comparison) {
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
        <h2 className="mt-2 text-15 font-semibold text-primary">
          {t("workspace_products.requirements.baseline.compare.title", {
            from: comparison.from_baseline.name,
            to: comparison.to_baseline.name,
          })}
        </h2>
        <p className="mt-1 text-12 text-secondary">
          {t("workspace_products.requirements.baseline.compare.total", { count: comparison.total_count ?? 0 })}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 md:px-6">
        {!comparison.results.length ? (
          <p className="py-16 text-center text-13 text-tertiary">
            {t("workspace_products.requirements.baseline.compare.empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {comparison.results.map((item) => (
              <ChangeRequestRequirementDiff
                key={item.id}
                item={item}
                fields={fields.filter((field) => field.requirement_type_id === item.requirement_type_id)}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </div>
        )}
      </div>

      <BaselinePagination
        label={t("workspace_products.requirements.baseline.compare.total", { count: comparison.total_count ?? 0 })}
        perPage={perPage}
        nextCursor={comparison.next_cursor}
        prevCursor={comparison.prev_cursor}
        nextPageResults={comparison.next_page_results}
        prevPageResults={comparison.prev_page_results}
        onPerPageChange={onPerPageChange}
        onCursorChange={onCursorChange}
      />
    </div>
  );
}
