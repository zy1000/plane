import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

/** 一个选项。`hint` 是右侧那行小字（可添加几条），`dim` 表示这一项没什么可选的 */
export type TMultiFilterOption = {
  id: string;
  label: string;
  hint?: string;
  dim?: boolean;
  /** 子阶段缩进一级 */
  depth?: number;
};

const I18N = "review_tailoring.actions";

/** 选项前的勾：画出来的，不是 input —— 整行是一个按钮，按钮里不能再套表单控件 */
const CheckMark = ({ checked }: { checked: boolean }) => (
  <span
    aria-hidden
    className={cn(
      "grid size-4 shrink-0 place-items-center rounded-sm border-[1.5px]",
      checked ? "border-accent-strong bg-accent-primary text-on-color" : "border-strong bg-surface-1"
    )}
  >
    {checked && <Check className="size-3" strokeWidth={3} />}
  </span>
);

/**
 * 弹窗工具栏里的多选筛选药丸：「阶段 D阶段、O-F1 ✕」，点开是带搜索的勾选清单，
 * 底部「全选 / 清空」。没选时显示「全部」，选了之后药丸变蓝、尾巴换成清除。
 *
 * 浮层就地绝对定位、不走 portal：它长在 ModalCore 里，portal 到 body 的浮层会被
 * 弹窗当成「点了外面」直接关掉。Esc 只关浮层，不往上冒到弹窗。
 */
export const MultiSelectFilterChip = ({
  icon: Icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  options: TMultiFilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClickDetector(ref, () => setIsOpen(false));

  const picked = new Set(value);
  const active = value.length > 0;
  const shown = options.filter((option) => picked.has(option.id)).map((option) => option.label);
  const keyword = query.trim().toLowerCase();
  const visible = keyword ? options.filter((option) => option.label.toLowerCase().includes(keyword)) : options;

  const toggle = (id: string) => onChange(picked.has(id) ? value.filter((entry) => entry !== id) : [...value, id]);

  return (
    <div ref={ref} className="relative shrink-0">
      <div
        className={cn(
          "flex h-8 items-center rounded-md border text-13 whitespace-nowrap transition-colors",
          active ? "border-accent-subtle-1 bg-accent-subtle" : "border-subtle bg-surface-1 hover:bg-layer-1",
          isOpen && "border-accent-strong"
        )}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          className="flex h-full items-center gap-1.5 pr-1.5 pl-2.5"
          onClick={() => {
            setIsOpen((current) => !current);
            setQuery("");
          }}
        >
          <Icon className={cn("size-3.5 shrink-0", active ? "text-accent-primary" : "text-placeholder")} />
          <span className={active ? "text-accent-primary" : "text-tertiary"}>{label}</span>
          <span className={cn("max-w-40 truncate font-medium", active ? "text-accent-primary" : "text-primary")}>
            {active ? shown.join("、") : t(`${I18N}.add_axes_filter_all`)}
          </span>
          {!active && <ChevronDown className="size-3.5 shrink-0 text-placeholder" />}
        </button>
        {active && (
          <button
            type="button"
            aria-label={t("common.clear")}
            className="mr-1.5 grid size-5 place-items-center rounded text-accent-primary hover:bg-accent-subtle-hover"
            onClick={() => onChange([])}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className="absolute top-full left-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-overlay-200"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setIsOpen(false);
          }}
        >
          <label className="flex h-9 items-center gap-2 border-b border-subtle px-3">
            <Search className="size-3.5 shrink-0 text-placeholder" />
            <input
              // 点开就能直接打字筛选项
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={query}
              aria-label={t(`${I18N}.add_axes_filter_search`, { label })}
              placeholder={t(`${I18N}.add_axes_filter_search`, { label })}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            />
          </label>
          <div className="max-h-72 overflow-y-auto p-1">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-12 text-placeholder">{t(`${I18N}.add_axes_filter_no_match`)}</p>
            ) : (
              visible.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={picked.has(option.id)}
                  className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-13 text-primary hover:bg-layer-transparent-hover"
                  onClick={() => toggle(option.id)}
                >
                  <CheckMark checked={picked.has(option.id)} />
                  <span
                    className={cn("min-w-0 flex-1 truncate text-left", option.dim && "text-tertiary")}
                    style={option.depth ? { paddingLeft: option.depth * 12 } : undefined}
                  >
                    {option.depth ? <span className="mr-1 text-placeholder">└</span> : null}
                    {option.label}
                  </span>
                  {option.hint && <span className="shrink-0 text-12 text-placeholder tabular-nums">{option.hint}</span>}
                </button>
              ))
            )}
          </div>
          <div className="flex items-center gap-3 border-t border-subtle bg-layer-1 px-3 py-2 text-12">
            <span className="mr-auto text-tertiary tabular-nums">
              {t(`${I18N}.add_axes_filter_selected`, { count: value.length })}
            </span>
            <button
              type="button"
              className="font-medium text-accent-primary hover:underline"
              onClick={() => onChange([...new Set([...value, ...visible.map((option) => option.id)])])}
            >
              {t(`${I18N}.add_axes_select_all`)}
            </button>
            <button type="button" className="text-tertiary hover:text-secondary" onClick={() => onChange([])}>
              {t(`${I18N}.add_axes_clear_all`)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
