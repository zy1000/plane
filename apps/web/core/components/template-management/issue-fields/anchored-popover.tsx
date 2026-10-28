import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import type { Placement } from "@popperjs/core";
import { useOutsideClickDetector } from "@plane/hooks";
import { cn } from "@plane/utils";

type Props = {
  buttonClassName?: string;
  buttonContent: ReactNode;
  ariaLabel?: string;
  placement?: Placement;
  panelClassName?: string;
  /** 面板内容；close 用于选完收起 */
  children: (close: () => void) => ReactNode;
};

/** 点按钮弹出的浮层（挂到 body，fixed 定位，点外面收起）：字段类型筛选、「+N」类型列表共用 */
export function AnchoredPopover({
  buttonClassName,
  buttonContent,
  ariaLabel,
  placement = "bottom-start",
  panelClassName,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement,
    strategy: "fixed",
    modifiers: [
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "offset", options: { offset: [0, 4] } },
    ],
  });

  useOutsideClickDetector(containerRef, () => setIsOpen(false), true);

  const close = () => setIsOpen(false);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        ref={setReferenceElement}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        className={buttonClassName}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {buttonContent}
      </button>
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
            data-prevent-outside-click
            className={cn(
              "z-50 rounded-lg border border-subtle bg-surface-1 p-1 shadow-raised-200",
              panelClassName
            )}
          >
            {children(close)}
          </div>,
          document.body
        )}
    </div>
  );
}
