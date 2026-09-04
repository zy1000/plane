/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { autoUpdate, flip, FloatingPortal, shift, useDismiss, useFloating, useInteractions } from "@floating-ui/react";
import type { Editor } from "@tiptap/core";
import { cellAround } from "@tiptap/pm/tables";
import { useCallback, useEffect, useRef, useState } from "react";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// extensions
import { isCellSelection } from "@/extensions/table/table/utilities/helpers";
// local imports
import { TableCellOptionsDropdown } from "./dropdown";

type Props = {
  editor: Editor;
};

/**
 * @description Resolve the table cell element owned by this editor under an event target.
 */
const getTableCellElement = (editor: Editor, target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof Element)) return null;

  const cellElement = target.closest<HTMLElement>("td, th");
  if (!cellElement || !editor.view.dom.contains(cellElement)) return null;

  return cellElement;
};

/**
 * @description Right-click menu for table cells: background color, merge and split.
 */
export function TableCellContextMenu(props: Props) {
  const { editor } = props;
  // states
  const [isOpen, setIsOpen] = useState(false);
  // refs
  const virtualReferenceRef = useRef<{ getBoundingClientRect: () => DOMRect }>({
    getBoundingClientRect: () => new DOMRect(),
  });

  const setIsMenuOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        editor.commands.addActiveDropbarExtension(CORE_EXTENSIONS.TABLE);
      } else {
        setTimeout(() => {
          editor.commands.removeActiveDropbarExtension(CORE_EXTENSIONS.TABLE);
        }, 0);
      }
    },
    [editor]
  );

  // floating ui, anchored to the pointer position
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsMenuOpen,
    placement: "bottom-start",
    middleware: [flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  const closeMenu = useCallback(() => setIsMenuOpen(false), [setIsMenuOpen]);

  useEffect(() => {
    // a right-click moves the caret, which would collapse a multi-cell selection before the menu opens;
    // stopping propagation also keeps ProseMirror's (and prosemirror-tables') mousedown tracking out of it
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 2 || !editor.isEditable) return;
      if (!getTableCellElement(editor, event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (!editor.isEditable) return;
      const cellElement = getTableCellElement(editor, event.target);
      if (!cellElement) return;

      const { doc, selection } = editor.state;
      const $cell = cellAround(doc.resolve(editor.view.posAtDOM(cellElement, 0)));
      if (!$cell) return;

      event.preventDefault();

      // keep an existing selection that already covers the clicked cell, otherwise select just that cell
      let isCellSelected = false;
      if (isCellSelection(selection)) {
        selection.forEachCell((_node, pos) => {
          if (pos === $cell.pos) isCellSelected = true;
        });
      }
      if (!isCellSelected) {
        editor.commands.setCellSelection({ anchorCell: $cell.pos });
      }

      virtualReferenceRef.current = {
        getBoundingClientRect: () => new DOMRect(event.clientX, event.clientY, 0, 0),
      };
      refs.setReference(virtualReferenceRef.current);
      setIsMenuOpen(true);
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [editor, refs, setIsMenuOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("scroll", closeMenu, true);
    return () => document.removeEventListener("scroll", closeMenu, true);
  }, [isOpen, closeMenu]);

  if (!isOpen) return null;

  return (
    <FloatingPortal>
      <div
        className="w-[12rem] rounded-md border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 shadow-raised-200"
        ref={refs.setFloating}
        {...getFloatingProps()}
        style={{
          ...floatingStyles,
          zIndex: 100,
        }}
      >
        <TableCellOptionsDropdown editor={editor} onClose={closeMenu} />
      </div>
    </FloatingPortal>
  );
}
