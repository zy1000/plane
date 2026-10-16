/** 「变更记录」工具栏左侧的状态分段：全部 / 审批中 / 已通过 / 已拒绝，带各自计数。 */
import { useTranslation } from "@plane/i18n";
import type { TRequirementChangeStatus } from "@plane/types";
import { CHANGE_STATUS_FILTERS } from "./use-change-request-status-counts";
import type { TChangeStatusCounts } from "./use-change-request-status-counts";

type TProps = {
  value: TRequirementChangeStatus | undefined;
  counts: TChangeStatusCounts;
  onChange: (value: TRequirementChangeStatus | undefined) => void;
};

export function ChangeStatusSegment(props: TProps) {
  const { value, counts, onChange } = props;
  const { t } = useTranslation();
  const options = [
    { key: "all" as const, value: undefined, label: t("workspace_products.requirements.change.status_filter.all") },
    ...CHANGE_STATUS_FILTERS.map((status) => ({
      key: status,
      value: status,
      label: t(`workspace_products.requirements.change.statuses.${status}`),
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("workspace_products.requirements.change.status_filter.label")}
      className="inline-flex gap-0.5 rounded-lg bg-layer-1 p-[3px]"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const count = counts[option.key];
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-13 font-medium whitespace-nowrap transition-colors ${
              isActive ? "bg-surface-1 text-primary shadow-raised-200" : "text-secondary hover:text-primary"
            }`}
          >
            {option.label}
            {count !== undefined && <span className="text-12 font-medium text-tertiary tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
