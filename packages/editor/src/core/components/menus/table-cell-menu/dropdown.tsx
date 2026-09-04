/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { TableCellsMerge, TableCellsSplit } from "lucide-react";
import type { LucideIcon } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// extensions
import { TableDragHandleDropdownColorSelector } from "@/extensions/table/plugins/drag-handles/color-selector";

const DROPDOWN_ITEMS: {
  key: string;
  label: string;
  icon: LucideIcon;
  isDisabled: (editor: Editor) => boolean;
  action: (editor: Editor) => void;
}[] = [
  {
    key: "merge-cells",
    label: "Merge cells",
    icon: TableCellsMerge,
    isDisabled: (editor) => !editor.can().mergeCells(),
    action: (editor) => editor.chain().focus().mergeCells().run(),
  },
  {
    key: "split-cell",
    label: "Split cell",
    icon: TableCellsSplit,
    isDisabled: (editor) => !editor.can().splitCell(),
    action: (editor) => editor.chain().focus().splitCell().run(),
  },
];

type Props = {
  editor: Editor;
  onClose: () => void;
};

export function TableCellOptionsDropdown(props: Props) {
  const { editor, onClose } = props;

  return (
    <>
      <TableDragHandleDropdownColorSelector editor={editor} onSelect={onClose} />
      <hr className="my-2 border-subtle" />
      {DROPDOWN_ITEMS.map((item) => {
        const isDisabled = item.isDisabled(editor);

        return (
          <button
            key={item.key}
            type="button"
            disabled={isDisabled}
            className={cn(
              "flex w-full items-center gap-2 truncate rounded-sm px-1 py-1.5 text-left text-11 text-secondary",
              isDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-layer-1"
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              item.action(editor);
              onClose();
            }}
          >
            <item.icon className="size-3 shrink-0" />
            <div className="flex-grow truncate">{item.label}</div>
          </button>
        );
      })}
    </>
  );
}
