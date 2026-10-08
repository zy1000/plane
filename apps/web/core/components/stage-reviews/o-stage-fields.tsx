import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
import type { TProductionMode, TShipmentAssessment } from "@plane/types";
import { EStageReviewKind, PRODUCTION_MODES, SHIPMENT_ASSESSMENTS } from "@plane/types";
import { cn } from "@plane/utils";

const I18N = "stage_review";

/** 生产方式 / 出货评估只出现在这两种类型上（评审与评审活动都有） */
export const STAGE_REVIEW_O_STAGE_KINDS: EStageReviewKind[] = [
  EStageReviewKind.O_STAGE_REVIEW,
  EStageReviewKind.O_STAGE_ACTIVITY,
];

export type TOStageField = "production_mode" | "shipment_assessment";
export type TOStageFieldValue = TProductionMode | TShipmentAssessment;

const OPTIONS: Record<TOStageField, readonly TOStageFieldValue[]> = {
  production_mode: PRODUCTION_MODES,
  shipment_assessment: SHIPMENT_ASSESSMENTS,
};

/** 两个字段的取值共用一套口径：正常绿、出货前刷新结论蓝、风险琥珀 */
const DOT_CLASS: Record<TOStageFieldValue, string> = {
  normal: "bg-success-primary",
  refresh: "bg-accent-primary",
  risk: "bg-warning-primary",
};

/**
 * 一个取值：圆点 + 文字。风险值连文字也染成琥珀色 —— 表格里一眼扫出来；
 * 下拉选项里传 `plain`，只留圆点，免得四行里一行突然变色像是选中了。
 */
export const OStageValue = ({
  field,
  value,
  plain = false,
  className,
}: {
  field: TOStageField;
  value: TOStageFieldValue;
  plain?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2",
        !plain && value === "risk" && "font-medium text-warning-primary",
        className
      )}
    >
      <span className={cn("size-1.75 shrink-0 rounded-full", DOT_CLASS[value])} />
      <span className="truncate">{t(`${I18N}.${field}.${value}`)}</span>
    </span>
  );
};

/**
 * 单选下拉：触发器由调用方给样式（右栏是就地编辑格，批量面板是字段外框），浮层是固定的
 * 选项列表。选完即关、即回调，不另设确认。两项都是提交审核的必填项，所以没有「清除」。
 */
export const OStageFieldSelect = ({
  field,
  value,
  placeholder,
  buttonClassName,
  placement = "bottom-start",
  onChange,
}: {
  field: TOStageField;
  value: TOStageFieldValue | "";
  placeholder: string;
  buttonClassName?: string;
  /** 批量面板贴着屏幕底部，浮层要往上开 */
  placement?: "bottom-start" | "top-start";
  onChange: (value: TOStageFieldValue) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const pick = (next: TOStageFieldValue) => {
    setIsOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button className={cn("flex min-w-0 cursor-pointer items-center text-left outline-none", buttonClassName)}>
        {value ? (
          <OStageValue field={field} value={value} />
        ) : (
          <span className="truncate text-placeholder">{placeholder}</span>
        )}
      </Popover.Button>
      <Popover.Panel
        placement={placement}
        sideOffset={4}
        // 层级要给定位层：批量面板浮在列表上，层级写在 Popup 上不生效
        positionerClassName="z-40"
        className="w-52 rounded-lg border border-subtle bg-surface-1 p-1 shadow-overlay-200"
      >
        {OPTIONS[field].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => pick(option)}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-2 text-14 text-primary hover:bg-layer-transparent-hover",
              option === value && "bg-layer-transparent-hover"
            )}
          >
            <OStageValue field={field} value={option} plain className="flex-1" />
            {option === value && <Check className="size-3.5 shrink-0 text-accent-primary" />}
          </button>
        ))}
      </Popover.Panel>
    </Popover>
  );
};
