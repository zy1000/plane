import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";

/** 裁剪表弹窗统一的头：图标方块 + 标题 + 关闭。版式与新建裁剪表弹窗一致，不带副标题 */
export const TailoringModalHeader = ({
  icon,
  title,
  onClose,
}: {
  icon: ReactNode;
  title: string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3.5 px-6 pt-5.5 pb-4.5">
      <span className="grid size-10.5 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent-primary">
        {icon}
      </span>
      <h2 className="flex-1 text-18 font-semibold text-primary">{title}</h2>
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
