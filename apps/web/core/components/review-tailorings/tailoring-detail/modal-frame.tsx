import type { ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

/** 输入框、下拉触发器共用的外观 */
export const MODAL_INPUT =
  "h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-14 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong disabled:bg-layer-1 disabled:text-secondary";

export const MODAL_TEXTAREA =
  "w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-14 leading-relaxed text-primary outline-none placeholder:text-placeholder focus:border-accent-strong disabled:bg-layer-1 disabled:text-secondary";

/**
 * 裁剪表弹窗统一的头：标题 + 关闭，下面一道线。
 *
 * `subtitle` 只写「这是哪一张表 / 哪一轮」这类定位信息，不是给弹窗加说明文字的地方。
 * `onBack` 给「弹窗里从列表点进某一条」的情形：标题前多一个返回。
 */
export const TailoringModalHeader = ({
  title,
  subtitle,
  extra,
  onBack,
  onClose,
}: {
  title: string;
  subtitle?: string;
  /** 关闭按钮左边的附加动作（「打开裁剪表」） */
  extra?: ReactNode;
  onBack?: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-subtle pr-4 pl-6">
      {onBack && (
        <button
          type="button"
          className="-ml-2 flex h-8 shrink-0 items-center gap-0.5 rounded-md pr-2 pl-1 text-13 text-secondary hover:bg-layer-transparent-hover"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" />
          {t("review_tailoring.approval.back")}
        </button>
      )}
      <h2 className="shrink-0 text-16 font-semibold text-primary">{title}</h2>
      {subtitle && (
        <span className="min-w-0 truncate text-13 text-tertiary" title={subtitle}>
          {subtitle}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {extra}
        <button
          type="button"
          aria-label={t("cancel")}
          className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </span>
    </div>
  );
};

/** 弹窗底部：左边一句提示（可无），右边按钮 */
export const TailoringModalFooter = ({ hint, children }: { hint?: ReactNode; children: ReactNode }) => (
  <div className="flex min-h-16 shrink-0 items-center justify-end gap-2.5 border-t border-subtle px-6 py-3">
    {hint && <span className="mr-auto min-w-0 text-13 text-tertiary">{hint}</span>}
    {children}
  </div>
);

/** 表单的一项：标签在上，控件在下，再下面是提示或报错 */
export const TailoringField = ({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
    <label htmlFor={htmlFor} className="text-13 font-medium text-secondary">
      {label}
      {required && <span className="ml-1 text-danger-primary">*</span>}
    </label>
    {children}
    {error ? (
      <span className="text-12 text-danger-primary">{error}</span>
    ) : (
      hint && <span className="text-12 text-tertiary">{hint}</span>
    )}
  </div>
);

/** 「标签：值」的说明列表，弹窗顶部交代「这是哪一条」 */
export const TailoringFacts = ({ items }: { items: { label: string; value: ReactNode }[] }) => (
  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-13">
    {items.map((item) => (
      <div key={item.label} className="contents">
        <dt className="whitespace-nowrap text-tertiary">{item.label}</dt>
        <dd className="min-w-0 text-primary">{item.value}</dd>
      </div>
    ))}
  </dl>
);

/** 单选圆点：选中是实心环，禁用是灰底 */
export const RadioDot = ({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) => (
  <span
    aria-hidden
    className={cn(
      "size-4 shrink-0 rounded-full bg-surface-1",
      disabled
        ? "border-[1.5px] border-subtle bg-layer-3"
        : checked
          ? "border-[5px] border-accent-strong"
          : "border-[1.5px] border-strong"
    )}
  />
);

/** 一排单选：整项可点，键盘可达 */
export const RadioOption = ({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={checked}
    className="flex items-center gap-2 text-14 text-primary"
    onClick={onSelect}
  >
    <RadioDot checked={checked} />
    {children}
  </button>
);

/** 弹窗列表上方的搜索框 */
export const ModalSearch = ({
  id,
  value,
  placeholder,
  onChange,
  className,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}) => (
  <input
    id={id}
    aria-label={placeholder}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    className={cn(
      "h-8 w-52 rounded-md border border-subtle bg-surface-1 px-2.5 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong",
      className
    )}
  />
);
