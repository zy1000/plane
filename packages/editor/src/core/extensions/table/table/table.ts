/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ParentConfig } from "@tiptap/core";
import { callOrReturn, getExtensionField, mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  cellAround,
  CellSelection,
  columnResizing,
  deleteCellSelection,
  deleteTable,
  fixTables,
  goToNextCell,
  isInTable,
  mergeCells,
  selectedRect,
  splitCell,
  tableEditing,
  toggleHeader,
  toggleHeaderCell,
} from "@tiptap/pm/tables";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { TableDragStatePlugin } from "../plugins/drag-state";
import { TableColumnDragHandlePlugin } from "../plugins/drag-handles/column/plugin";
import { TableRowDragHandlePlugin } from "../plugins/drag-handles/row/plugin";
import { TableInsertPlugin } from "../plugins/insert-handlers/plugin";
import { TableView } from "./table-view";
import { createTable } from "./utilities/create-table";
import { deleteColumnOrTable } from "./utilities/delete-column";
import { handleDeleteKeyOnTable } from "./utilities/delete-key-shortcut";
import { deleteRowOrTable } from "./utilities/delete-row";
import { isCellSelection } from "./utilities/helpers";
import { insertLineAboveTableAction } from "./utilities/insert-line-above-table-action";
import { insertLineBelowTableAction } from "./utilities/insert-line-below-table-action";
import { DEFAULT_COLUMN_WIDTH } from ".";

type TableOptions = {
  HTMLAttributes: Record<string, unknown>;
  resizable: boolean;
  handleWidth: number;
  cellMinWidth: number;
  lastColumnResizable: boolean;
  allowTableNodeSelection: boolean;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.TABLE]: {
      insertTable: (options?: { rows?: number; cols?: number; withHeaderRow?: boolean }) => ReturnType;
      addColumnBefore: () => ReturnType;
      addColumnAfter: () => ReturnType;
      deleteColumn: () => ReturnType;
      addRowBefore: () => ReturnType;
      addRowAfter: () => ReturnType;
      deleteRow: () => ReturnType;
      deleteTable: () => ReturnType;
      mergeCells: () => ReturnType;
      splitCell: () => ReturnType;
      toggleHeaderColumn: () => ReturnType;
      toggleHeaderRow: () => ReturnType;
      toggleHeaderCell: () => ReturnType;
      clearSelectedCells: () => ReturnType;
      mergeOrSplit: () => ReturnType;
      setCellAttribute: (name: string, value: any) => ReturnType;
      goToNextCell: () => ReturnType;
      goToPreviousCell: () => ReturnType;
      fixTables: () => ReturnType;
      setCellSelection: (position: { anchorCell: number; headCell?: number }) => ReturnType;
    };
  }

  interface NodeConfig<Options, Storage> {
    tableRole?:
      | string
      | ((this: {
          name: string;
          options: Options;
          storage: Storage;
          parent: ParentConfig<NodeConfig<Options>>["tableRole"];
        }) => string);
  }
}

export const Table = Node.create<TableOptions>({
  name: CORE_EXTENSIONS.TABLE,

  addOptions() {
    return {
      HTMLAttributes: {},
      resizable: true,
      handleWidth: 5,
      cellMinWidth: 100,
      lastColumnResizable: true,
      allowTableNodeSelection: true,
    };
  },

  content: "tableRow+",

  tableRole: "table",

  isolating: true,

  group: "block",

  allowGapCursor: false,

  parseHTML() {
    return [{ tag: "table" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["table", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ["tbody", 0]];
  },

  addCommands() {
    return {
      insertTable:
        ({ rows = 3, cols = 3, withHeaderRow = false } = {}) =>
        ({ tr, dispatch, editor }) => {
          const node = createTable({
            schema: editor.schema,
            rowsCount: rows,
            colsCount: cols,
            withHeaderRow,
            columnWidth: DEFAULT_COLUMN_WIDTH,
          });
          if (dispatch) {
            const offset = tr.selection.anchor + 1;

            tr.replaceSelectionWith(node)
              .scrollIntoView()
              .setSelection(TextSelection.near(tr.doc.resolve(offset)));
          }

          return true;
        },
      addColumnBefore:
        () =>
        ({ state, dispatch }) =>
          addColumnBefore(state, dispatch),
      addColumnAfter:
        () =>
        ({ state, dispatch }) =>
          addColumnAfter(state, dispatch),
      deleteColumn: deleteColumnOrTable,
      addRowBefore:
        () =>
        ({ state, dispatch }) =>
          addRowBefore(state, dispatch),
      addRowAfter:
        () =>
        ({ state, dispatch }) =>
          addRowAfter(state, dispatch),
      deleteRow: deleteRowOrTable,
      deleteTable:
        () =>
        ({ state, dispatch }) =>
          deleteTable(state, dispatch),
      mergeCells:
        () =>
        ({ state, tr, dispatch }) => {
          if (!isCellSelection(state.selection)) return false;

          // prosemirror-tables pads the merged cell's colwidth with zeros, which turns the covered
          // columns into auto width; capture the widths of the covered columns and restore them after merging
          const rect = selectedRect(state);
          const widths: number[] = [];
          for (let col = rect.left; col < rect.right; col++) {
            const cellPos = rect.map.map[rect.top * rect.map.width + col];
            const colwidth = rect.table.nodeAt(cellPos)?.attrs.colwidth as number[] | null | undefined;
            widths.push(colwidth?.[col - rect.map.colCount(cellPos)] || DEFAULT_COLUMN_WIDTH);
          }

          if (!mergeCells(state, dispatch)) return false;

          // mergeCells leaves the merged cell selected
          if (dispatch && isCellSelection(tr.selection)) {
            const $cell = tr.selection.$anchorCell;
            if ($cell.nodeAfter) {
              tr.setNodeMarkup($cell.pos, null, { ...$cell.nodeAfter.attrs, colwidth: widths });
            }
          }

          return true;
        },
      splitCell:
        () =>
        ({ state, dispatch }) =>
          splitCell(state, dispatch),
      toggleHeaderColumn:
        () =>
        ({ state, dispatch }) =>
          toggleHeader("column")(state, dispatch),
      toggleHeaderRow:
        () =>
        ({ state, dispatch }) =>
          toggleHeader("row")(state, dispatch),
      toggleHeaderCell:
        () =>
        ({ state, dispatch }) =>
          toggleHeaderCell(state, dispatch),
      clearSelectedCells:
        () =>
        ({ state, dispatch }) =>
          deleteCellSelection(state, dispatch),
      mergeOrSplit:
        () =>
        ({ commands }) =>
          commands.mergeCells() || commands.splitCell(),
      // own implementation instead of prosemirror-tables' setCellAttr, which bails out entirely
      // when the head cell already has the value, leaving the rest of the selection untouched
      setCellAttribute:
        (name, value) =>
        ({ state, tr, dispatch }) => {
          if (!isInTable(state)) return false;

          const { selection } = state;
          const cells: { node: ProseMirrorNode; pos: number }[] = [];
          if (isCellSelection(selection)) {
            selection.forEachCell((node, pos) => cells.push({ node, pos }));
          } else {
            const $cell = cellAround(selection.$head);
            if (!$cell?.nodeAfter) return false;
            cells.push({ node: $cell.nodeAfter, pos: $cell.pos });
          }

          if (dispatch) {
            cells.forEach(({ node, pos }) => {
              if (node.attrs[name] !== value) {
                tr.setNodeMarkup(pos, null, { ...node.attrs, [name]: value });
              }
            });
          }

          return true;
        },
      goToNextCell:
        () =>
        ({ state, dispatch }) =>
          goToNextCell(1)(state, dispatch),
      goToPreviousCell:
        () =>
        ({ state, dispatch }) =>
          goToNextCell(-1)(state, dispatch),
      fixTables:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            fixTables(state);
          }

          return true;
        },
      setCellSelection:
        (position) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const selection = CellSelection.create(tr.doc, position.anchorCell, position.headCell);
            tr.setSelection(selection);
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (!this.editor.isActive(CORE_EXTENSIONS.TABLE)) return false;

        if (this.editor.isActive(CORE_EXTENSIONS.LIST_ITEM) || this.editor.isActive(CORE_EXTENSIONS.TASK_ITEM)) {
          return false;
        }

        if (this.editor.commands.goToNextCell()) {
          return true;
        }

        if (!this.editor.can().addRowAfter()) {
          return false;
        }

        return this.editor.chain().addRowAfter().goToNextCell().run();
      },
      "Shift-Tab": () => {
        if (!this.editor.isActive(CORE_EXTENSIONS.TABLE)) return false;

        if (this.editor.isActive(CORE_EXTENSIONS.LIST_ITEM) || this.editor.isActive(CORE_EXTENSIONS.TASK_ITEM)) {
          return false;
        }

        return this.editor.commands.goToPreviousCell();
      },
      Backspace: handleDeleteKeyOnTable,
      "Mod-Backspace": handleDeleteKeyOnTable,
      Delete: handleDeleteKeyOnTable,
      "Mod-Delete": handleDeleteKeyOnTable,
      ArrowDown: insertLineBelowTableAction,
      ArrowUp: insertLineAboveTableAction,
    };
  },

  addNodeView() {
    return ({ editor, node, decorations, getPos }) => {
      const { cellMinWidth } = this.options;

      return new TableView(node, cellMinWidth, decorations, editor, getPos);
    };
  },

  addProseMirrorPlugins() {
    const isResizable = this.options.resizable && this.editor.isEditable;

    const plugins = [
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
      TableDragStatePlugin,
      TableInsertPlugin(this.editor),
      TableColumnDragHandlePlugin(this.editor),
      TableRowDragHandlePlugin(this.editor),
    ];

    if (isResizable) {
      plugins.unshift(
        columnResizing({
          handleWidth: this.options.handleWidth,
          cellMinWidth: this.options.cellMinWidth,
          // View: TableView,
          lastColumnResizable: this.options.lastColumnResizable,
        })
      );
    }

    return plugins;
  },

  extendNodeSchema(extension) {
    const context = {
      name: extension.name,
      options: extension.options,
      storage: extension.storage,
    };

    return {
      tableRole: callOrReturn(getExtensionField(extension, "tableRole", context)),
    };
  },
});
