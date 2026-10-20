import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { Maximize2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ModalFieldLabel } from "@/components/common/form-modal";
import { RISK_I18N } from "../constants";

/**
 * 随内容长高的多行文本框：高度跟着内容走，外面用 max-h + overflow-y-auto 封顶，超出在框里滚。
 * 风险的三段文本（描述 / 影响描述 / 应对措施）是纯文本（与简道云一致），弹窗与详情页都用它。
 */
export const AutoGrowTextArea = ({
  value,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      className={cn("block w-full resize-none bg-transparent outline-none", className)}
      {...rest}
    />
  );
};

/** 弹窗里的文本框外观：圆角边框盒，出错红边、聚焦蓝边 */
const boxClass = (hasError: boolean, extra?: string) =>
  cn(
    "vertical-scrollbar scrollbar-sm rounded-[10px] border bg-layer-2 px-3.5 py-3 text-14 leading-relaxed text-primary transition-colors placeholder:text-placeholder focus:border-accent-strong",
    hasError ? "border-danger-strong" : "border-subtle-1",
    extra
  );

/**
 * 一段多行文本字段：字段名一行（右侧「放大编辑」）+ 文本框。
 * 放大编辑是一个大弹窗，里面是同一份值的大文本框，改动实时写回表单。
 */
export const RiskTextAreaField = ({
  id,
  label,
  required = false,
  note,
  error,
  value,
  placeholder,
  minHeightClass,
  maxHeightClass,
  onChange,
}: {
  id: string;
  label: string;
  required?: boolean;
  /** 字段名后的小字说明；出错时换成红字错误 */
  note?: ReactNode;
  error?: string;
  value: string;
  placeholder?: string;
  minHeightClass: string;
  /** 行内框的高度上限：超出在框里滚动，长内容用「放大编辑」 */
  maxHeightClass: string;
  onChange: (next: string) => void;
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const expandLabel = t(`${RISK_I18N}.form.expand`);
  const hasError = Boolean(error);

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <ModalFieldLabel
          htmlFor={`risk-form-${id}`}
          required={required}
          note={error ? <span className="text-danger-primary">{error}</span> : note}
        >
          <span className={error ? "text-danger-primary" : undefined}>{label}</span>
        </ModalFieldLabel>
        <Tooltip tooltipContent={expandLabel} position="top">
          <button
            type="button"
            aria-label={`${expandLabel} · ${label}`}
            onClick={() => setIsExpanded(true)}
            className="-mt-1 grid size-6 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </Tooltip>
      </div>

      <AutoGrowTextArea
        id={`risk-form-${id}`}
        value={value}
        placeholder={placeholder}
        data-modal-wheel-scroll
        onChange={(event) => onChange(event.target.value)}
        className={boxClass(hasError, cn("overflow-y-auto", minHeightClass, maxHeightClass))}
      />

      <ModalCore
        isOpen={isExpanded}
        handleClose={() => setIsExpanded(false)}
        position={EModalPosition.CENTER}
        width={EModalWidth.VIIXL}
        className="rounded-2xl"
      >
        <div className="flex h-[min(86vh,56rem)] min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-2 px-6 pt-5 pb-3">
            <h3 className="text-16 font-semibold text-primary">
              {label}
              {required && <span className="ml-0.5 text-danger-primary">*</span>}
            </h3>
            {note && !error && <span className="text-12 text-placeholder">{note}</span>}
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              aria-label={t("close")}
              className="ml-auto grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 px-6">
            {isExpanded && (
              <textarea
                autoFocus
                value={value}
                placeholder={placeholder}
                aria-label={label}
                data-modal-wheel-scroll
                onChange={(event) => onChange(event.target.value)}
                className={boxClass(false, "block h-full w-full resize-none overflow-y-auto px-5 py-4 outline-none")}
              />
            )}
          </div>
          <div className="flex shrink-0 justify-end border-t border-subtle px-6 py-3.5">
            <Button type="button" variant="primary" size="lg" onClick={() => setIsExpanded(false)}>
              {t(`${RISK_I18N}.form.expand_done`)}
            </Button>
          </div>
        </div>
      </ModalCore>
    </div>
  );
};
