import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@plane/i18n";
import type { TPlanDragTarget } from "./use-plan-bar-drag";

const I18N = "project_stage.plan";

export type TPlanBarMenuState = { x: number; y: number; target: TPlanDragTarget };

const MENU_WIDTH = 180;

/**
 * 条上右键的小菜单，目前只有「清除排期」。阶段的开始日期系统不允许清空，所以阶段只清结束（周期跟着清）；
 * 迭代必须有起止，不会打开这个菜单。点外面、按 Esc、滚动都关掉。
 */
export const PlanBarMenu = ({
  menu,
  onClose,
  onClearDates,
}: {
  menu: TPlanBarMenuState | null;
  onClose: () => void;
  onClearDates: (target: TPlanDragTarget) => void;
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const left = Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(menu.y, window.innerHeight - 80);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-30 rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-200"
      style={{ left, top, width: MENU_WIDTH }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-layer-3"
        onClick={() => {
          onClearDates(menu.target);
          onClose();
        }}
      >
        <span className="text-13 text-primary">{t(`${I18N}.clear_dates`)}</span>
        {menu.target.kind === "stage" && (
          <span className="text-11 text-tertiary">{t(`${I18N}.clear_dates_stage_hint`)}</span>
        )}
      </button>
    </div>,
    document.body
  );
};
