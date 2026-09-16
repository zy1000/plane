import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";

/**
 * 裁剪表弹窗统一的头：图标方块 + 标题 + 关闭。版式与新建裁剪表弹窗一致。
 *
 * `subtitle` 只给「改的是哪一条」这类弹窗用（明细里点开某一格的裁剪原因），不是给弹窗加说明文字的地方。
 */
export const TailoringModalHeader = ({
  icon,
  title,
  subtitle,
  onClose,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3.5 px-6 pt-5.5 pb-4.5">
      <span className="grid size-10.5 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-18 font-semibold text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-12 text-tertiary">{subtitle}</p>}
      </div>
      <button
        type="button"
        aria-label={t("cancel")}
        className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover"
        onClick={onClose}
      >
        <X className="size-4" />
      </button>
    </div>
  );
};

/** 弹窗列表上方的搜索框 */
export const ModalSearch = ({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) => (
  <label htmlFor={id} className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle px-4 text-13">
    <Search className="size-3.5 shrink-0 text-placeholder" />
    <input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-placeholder"
    />
  </label>
);
