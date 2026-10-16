/**
 * 创建基线弹窗的 dry-run 结果卡：大号收录数 + 「收录的不是当前内容」清单 + 「不收录」药丸。
 */
import { useState } from "react";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementBaselinePreview } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";

/** 不收录的需求平时只露前几个，多了折成「+N」 */
const SKIPPED_PREVIEW_LIMIT = 6;

type TProps = {
  preview: TRequirementBaselinePreview | null;
  isLoading: boolean;
};

export function BaselinePreviewCard({ preview, isLoading }: TProps) {
  const { t } = useTranslation();
  const [isSkippedExpanded, setIsSkippedExpanded] = useState(false);

  if (isLoading || !preview) {
    return (
      <div className="rounded-xl border border-subtle bg-layer-1 px-4 py-4">
        {isLoading ? (
          <Loader className="space-y-2">
            <Loader.Item height="26px" width="200px" />
          </Loader>
        ) : (
          <p className="text-13 text-tertiary">{t("workspace_products.requirements.baseline.form.preview.unavailable")}</p>
        )}
      </div>
    );
  }

  const { entry_count: entryCount, stale, skipped } = preview;
  const total = entryCount + skipped.length;
  const visibleSkipped = isSkippedExpanded ? skipped : skipped.slice(0, SKIPPED_PREVIEW_LIMIT);
  const hiddenSkippedCount = skipped.length - visibleSkipped.length;

  return (
    <div className="overflow-hidden rounded-xl border border-subtle bg-layer-1">
      <div className="flex items-baseline gap-2.5 px-4 pt-4 pb-3.5">
        <span className="text-[26px] leading-none font-bold text-accent-primary tabular-nums">{entryCount}</span>
        <span className="text-14 font-medium text-primary">
          {t("workspace_products.requirements.baseline.form.preview.will_include")}
        </span>
        <span className="ml-auto text-13 text-tertiary">
          {t("workspace_products.requirements.baseline.form.preview.total", { count: total })}
        </span>
      </div>

      {stale.length > 0 && (
        <section className="border-t border-subtle px-4 py-3">
          <h4 className="flex items-center gap-2 text-13 font-semibold text-warning-primary">
            <AlertTriangle className="size-3.75 shrink-0" />
            {t("workspace_products.requirements.baseline.form.preview.stale", { count: stale.length })}
            <span className="ml-auto text-12 font-normal text-tertiary">
              {t("workspace_products.requirements.baseline.form.preview.stale_hint")}
            </span>
          </h4>
          <ul className="scrollbar-sm vertical-scrollbar mt-1 max-h-40 overflow-y-auto">
            {stale.map((item) => (
              <li key={item.requirement_id} className="flex h-7.5 min-w-0 items-center gap-2 pl-5.75 text-13">
                <span className="min-w-0 flex-1 truncate text-secondary" title={item.title}>
                  {item.title}
                </span>
                <span className="shrink-0 text-tertiary">
                  {t("workspace_products.requirements.baseline.form.preview.included_version")}{" "}
                  <span className="font-mono text-12 font-medium">v{item.version}</span>
                  {" · "}
                  {t(`workspace_products.requirements.baseline.form.preview.stale_reason.${item.reason}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {skipped.length > 0 && (
        <section className="border-t border-subtle px-4 py-3">
          <h4 className="flex items-center gap-2 text-13 font-semibold text-secondary">
            <Info className="size-3.75 shrink-0" />
            {t("workspace_products.requirements.baseline.form.preview.skipped", { count: skipped.length })}
            {skipped.length > SKIPPED_PREVIEW_LIMIT && (
              <button
                type="button"
                onClick={() => setIsSkippedExpanded((current) => !current)}
                className="ml-auto flex items-center gap-1 text-12 font-normal text-tertiary hover:text-primary"
              >
                {t(isSkippedExpanded ? "workspace_products.requirements.baseline.form.preview.collapse" : "workspace_products.requirements.baseline.form.preview.expand")}
                <ChevronDown className={cn("size-3.25 transition-transform", isSkippedExpanded && "rotate-180")} />
              </button>
            )}
          </h4>
          <div className="scrollbar-sm vertical-scrollbar flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pt-2 pb-0.5 pl-5.75">
            {visibleSkipped.map((item) => (
              <span
                key={item.requirement_id}
                title={item.title}
                className="inline-flex h-5.5 max-w-60 items-center truncate rounded-[5px] border border-subtle bg-surface-1 px-1.75 text-12 text-secondary"
              >
                <span className="truncate">{item.title}</span>
              </span>
            ))}
            {hiddenSkippedCount > 0 && (
              <button
                type="button"
                onClick={() => setIsSkippedExpanded(true)}
                className="inline-flex h-5.5 items-center rounded-[5px] border border-subtle bg-surface-1 px-1.75 text-12 text-tertiary hover:text-primary"
              >
                +{hiddenSkippedCount}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
