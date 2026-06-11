/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Placement } from "@popperjs/core";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { cn } from "@plane/utils";

type TDropdownPanelProps = {
  isOpen: boolean;
  referenceElement: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  placement?: Placement;
  minWidth?: number;
};

export const DropdownPanel: FC<TDropdownPanelProps> = ({
  isOpen,
  referenceElement,
  onClose,
  children,
  className,
  placement = "bottom-start",
  minWidth = 260,
}) => {
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const panelWidth = referenceElement ? Math.max(referenceElement.offsetWidth, minWidth) : minWidth;

  const { styles, attributes, update } = usePopper(referenceElement, popperElement, {
    placement,
    modifiers: [
      {
        name: "offset",
        options: {
          offset: [0, 4],
        },
      },
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
      {
        name: "flip",
        options: {
          padding: 12,
        },
      },
    ],
  });

  useEffect(() => {
    if (!isOpen) return;
    void update?.();
  }, [isOpen, panelWidth, update]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (referenceElement?.contains(target)) return;
      if (popperElement?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, popperElement, referenceElement]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={setPopperElement}
      style={{ ...styles.popper, width: panelWidth, minWidth: panelWidth }}
      {...attributes.popper}
      className={cn("z-40 rounded-md border border-subtle bg-surface-1 shadow-lg", className)}
      data-prevent-outside-click="true"
    >
      {children}
    </div>,
    document.body
  );
};
