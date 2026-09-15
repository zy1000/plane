import type { ReactNode } from "react";
import { Check, Lock, Scissors } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";

const Segment = ({
  isActive,
  tone,
  icon,
  disabled = false,
  onClick,
  children,
}: {
  isActive: boolean;
  tone: "keep" | "cut";
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={isActive}
    disabled={disabled}
    className={cn(
      "flex h-full items-center gap-1 px-2 text-12 whitespace-nowrap transition-colors",
      tone === "cut" && "border-l border-subtle",
      isActive
        ? tone === "keep"
          ? "bg-accent-subtle font-semibold text-accent-primary"
          : "bg-layer-3 font-semibold text-primary"
        : disabled
          ? "cursor-not-allowed text-placeholder"
          : "text-placeholder hover:bg-layer-transparent-hover hover:text-secondary"
    )}
    onClick={onClick}
  >
    {(isActive || disabled) && icon}
    {children}
  </button>
);

/**
 * 格子里的「保留 | 裁剪」两段式控件。两个词始终同时可见，选中的那段亮起 —— 比开关少一次
 * 「开代表什么」的猜测。
 *
 * 只读（签批中 / 已生效）时不画控件，只剩选中那一面的字：保留是绿色勾，裁剪是灰色剪刀。
 * 「保留」一面可能被锁（模板已停用，不能新增保留），锁住时那段换成锁并给出原因。
 */
export const KeepCutSegment = ({
  value,
  editable,
  keepLockReason,
  onChange,
}: {
  /** true = 保留 */
  value: boolean;
  editable: boolean;
  keepLockReason?: string | null;
  onChange: (keep: boolean) => void;
}) => {
  const { t } = useTranslation();
  const keepLabel = t("review_tailoring.matrix.keep");
  const cutLabel = t("review_tailoring.matrix.cut");

  if (!editable) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-12 font-medium whitespace-nowrap",
          value ? "text-success-primary" : "text-secondary"
        )}
      >
        {value ? <Check className="size-3" strokeWidth={2.6} /> : <Scissors className="size-3" strokeWidth={2.2} />}
        {value ? keepLabel : cutLabel}
      </span>
    );
  }

  const isKeepLocked = !value && Boolean(keepLockReason);

  return (
    <span
      role="radiogroup"
      className="inline-flex h-6.5 shrink-0 overflow-hidden rounded-[7px] border border-strong bg-surface-1"
    >
      <Tooltip tooltipContent={keepLockReason ?? ""} disabled={!isKeepLocked}>
        <span className="flex">
          <Segment
            isActive={value}
            tone="keep"
            disabled={isKeepLocked}
            icon={
              isKeepLocked ? <Lock className="size-3" /> : <Check className="size-3" strokeWidth={2.6} />
            }
            onClick={() => {
              if (!value) onChange(true);
            }}
          >
            {keepLabel}
          </Segment>
        </span>
      </Tooltip>
      <Segment
        isActive={!value}
        tone="cut"
        icon={<Scissors className="size-3" strokeWidth={2.2} />}
        onClick={() => {
          if (value) onChange(false);
        }}
      >
        {cutLabel}
      </Segment>
    </span>
  );
};
