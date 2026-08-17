/**
 * 状态筛选项：工作项同款 chip（状态 is --）+ 可搜索下拉。
 * 放在筛选行里，由漏斗按钮展开；选项跟随 REQUIREMENT_STATUSES，每档带计数。
 *
 * 计数口径由服务端定死：这些数字跟随当前选中的产品，但**不**跟随状态自身 ——
 * 选了「研发中」之后其余各段的数字必须保持不变，否则用户点进去就回不来了。
 * 见 utils/requirement_project.requirement_facets。
 */
import type { FC } from "react";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import type { TRequirementItemStatus } from "@plane/types";
import { REQUIREMENT_STATUSES } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { REQUIREMENT_STATUS_STYLE } from "@/components/requirements";

export const STATUS_PARAM = "status";

const ALL_KEY = "all";

/** 把 URL 里的 status 规整为受支持的状态；非法值（含旧的 stage 取值）回落「全部」。照 getDefectPreset 的范式 */
export const getStatusFromParam = (value: string | null | undefined): TRequirementItemStatus | undefined =>
  value && (REQUIREMENT_STATUSES as string[]).includes(value) ? (value as TRequirementItemStatus) : undefined;

type TProps = {
  value: TRequirementItemStatus | undefined;
  counts: Record<TRequirementItemStatus, number> | undefined;
  /** 「全部」那一档的计数 */
  totalCount: number;
  onChange: (status: TRequirementItemStatus | undefined) => void;
  /** 点 × 移除这条筛选条件（chip 从筛选行消失）。不传则只清空值 */
  onRemove?: () => void;
};

const StatusGlyph = ({ status }: { status: TRequirementItemStatus | typeof ALL_KEY }) => {
  if (status === ALL_KEY) {
    return (
      <span aria-hidden className="size-3 shrink-0 rounded-full border-[1.5px] border-dashed border-tertiary" />
    );
  }
  return <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", REQUIREMENT_STATUS_STYLE[status].dot)} />;
};

const StatusOptionRow = ({
  status,
  label,
  count,
}: {
  status: TRequirementItemStatus | typeof ALL_KEY;
  label: string;
  count: number | undefined;
}) => {
  const isZero = status !== ALL_KEY && count === 0;
  return (
    <span className={cn("flex w-full items-center gap-2", isZero && "opacity-50")}>
      <StatusGlyph status={status} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" && (
        <span className="shrink-0 tabular-nums text-placeholder">{count}</span>
      )}
    </span>
  );
};

export const ProjectRequirementStatusFilter: FC<TProps> = ({ value, counts, totalCount, onChange, onRemove }) => {
  const { t } = useTranslation();

  const allLabel = t("project_requirements.all_statuses");
  const selectedLabel = value ? t(`requirement_fields.statuses.${value}`) : undefined;

  const options = [
    {
      value: ALL_KEY,
      query: allLabel.toLowerCase(),
      content: <StatusOptionRow status={ALL_KEY} label={allLabel} count={totalCount} />,
    },
    ...REQUIREMENT_STATUSES.map((status) => {
      const label = t(`requirement_fields.statuses.${status}`);
      return {
        value: status,
        query: label.toLowerCase(),
        content: <StatusOptionRow status={status} label={label} count={counts?.[status]} />,
      };
    }),
  ];

  const handleSelect = (next: string) => {
    if (next === ALL_KEY || next === value) {
      onChange(undefined);
      return;
    }
    onChange(next as TRequirementItemStatus);
  };

  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-sm border border-subtle bg-surface-1">
      <div className="flex h-full items-center gap-1 border-r border-subtle-1 px-2 py-[5px] text-11 text-tertiary">
        <span aria-hidden className="size-3 shrink-0 rounded-full border-[1.5px] border-tertiary" />
        <span className="truncate">{t("requirement_fields.builtin.status")}</span>
      </div>
      <div className="flex h-full items-center border-r border-subtle-1 px-2 text-13 text-secondary">is</div>
      <CustomSearchSelect
        value={value ?? ALL_KEY}
        onChange={handleSelect}
        options={options}
        customButtonClassName="h-full min-w-[64px] border-r border-subtle-1 px-2 text-13 font-regular"
        optionsClassName="w-56"
        maxHeight="md"
        defaultOpen={!value}
        customButton={
          <span className="flex h-full min-w-0 items-center gap-1.5">
            {value ? (
              <>
                <StatusGlyph status={value} />
                <span className="max-w-24 truncate text-secondary">{selectedLabel}</span>
              </>
            ) : (
              <span className="text-placeholder">--</span>
            )}
          </span>
        }
      />
      <button
        type="button"
        onClick={() => (onRemove ? onRemove() : onChange(undefined))}
        className="bg-layer-transparent px-1.5 text-placeholder hover:bg-layer-transparent-hover hover:text-tertiary focus:outline-none"
        aria-label="移除筛选"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
};
