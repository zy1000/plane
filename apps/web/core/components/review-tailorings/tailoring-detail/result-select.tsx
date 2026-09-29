import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

const MENU_WIDTH = 120;
/** 两项 × 32px + 上下内边距，用来判断下方放不放得下 */
const MENU_HEIGHT = 74;

/** 只读的裁剪结果：保留是正文色，裁剪标红 */
export const ResultText = ({ value, className }: { value: boolean; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span className={cn("whitespace-nowrap", value ? "text-primary" : "font-medium text-danger-primary", className)}>
      {t(value ? "review_tailoring.matrix.keep" : "review_tailoring.matrix.cut")}
    </span>
  );
};

/**
 * 格子里的「保留 / 裁剪」下拉。
 *
 * 一张表几百个格子，所以平时只是一个按钮，点开才把菜单挂到 body 上（fixed 定位）——
 * 既不会被表格的滚动容器裁掉，也不用给每个格子常驻一套弹层。滚动、缩放、Esc、点空白都会收起。
 * 「保留」可能被锁（模板已停用，不能新增保留），锁住时那一项置灰并写明原因。
 */
export const ResultSelect = ({
  value,
  keepLockReason,
  onChange,
}: {
  /** true = 保留 */
  value: boolean;
  keepLockReason?: string | null;
  onChange: (keep: boolean) => void;
}) => {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor]);

  const pick = (keep: boolean) => {
    setAnchor(null);
    if (keep !== value) onChange(keep);
  };

  const isKeepLocked = !value && Boolean(keepLockReason);
  const options = [
    { keep: true, label: t("review_tailoring.matrix.keep"), disabled: isKeepLocked },
    { keep: false, label: t("review_tailoring.matrix.cut"), disabled: false },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={Boolean(anchor)}
        className={cn(
          "-mx-1.5 flex h-7 w-[calc(100%+0.75rem)] items-center justify-between gap-1 rounded px-1.5 text-13 hover:bg-layer-transparent-hover",
          anchor && "bg-layer-transparent-hover"
        )}
        onClick={() => setAnchor(anchor ? null : (buttonRef.current?.getBoundingClientRect() ?? null))}
      >
        <ResultText value={value} />
        <ChevronDown className="size-3 shrink-0 text-placeholder" />
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setAnchor(null)} aria-hidden />
            <ul
              role="listbox"
              className="fixed z-[61] rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-200"
              style={{
                width: Math.max(anchor.width, MENU_WIDTH),
                left: anchor.left,
                top:
                  anchor.bottom + MENU_HEIGHT + 8 > window.innerHeight
                    ? anchor.top - MENU_HEIGHT - 4
                    : anchor.bottom + 4,
              }}
            >
              {options.map((option) => (
                <li key={String(option.keep)}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.keep === value}
                    disabled={option.disabled}
                    title={option.disabled ? (keepLockReason ?? undefined) : undefined}
                    className={cn(
                      "flex h-8 w-full items-center justify-between rounded px-2 text-left text-13",
                      option.disabled
                        ? "cursor-not-allowed text-placeholder"
                        : "hover:bg-layer-transparent-hover",
                      option.keep === value && "bg-layer-1"
                    )}
                    onClick={() => pick(option.keep)}
                  >
                    <span
                      className={cn(!option.disabled && (option.keep ? "text-primary" : "text-danger-primary"))}
                    >
                      {option.label}
                    </span>
                    {option.keep === value && <Check className="size-3.5 text-accent-primary" strokeWidth={2.4} />}
                  </button>
                </li>
              ))}
            </ul>
          </>,
          document.body
        )}
    </>
  );
};
