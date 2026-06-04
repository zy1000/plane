import { globalEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";

export const CASE_PICKER_MODAL_CLASS = "qa-case-picker-modal";

const priorityPillStyle: Record<number, { bg: string; text: string; dot: string }> = {
  0: { bg: "var(--label-indigo-bg)", text: "var(--label-indigo-text)", dot: "var(--priority-low)" },
  1: { bg: "var(--label-yellow-bg)", text: "var(--label-yellow-text)", dot: "var(--priority-medium)" },
  2: { bg: "var(--label-orange-bg)", text: "var(--label-orange-text)", dot: "var(--priority-high)" },
};

const getEnumLabel = (group: "case_type" | "case_priority", value?: number | null) => {
  if (value === null || value === undefined) return "";
  const map = (globalEnums.Enums as any)?.[group] || {};
  return map[value] ?? map[String(value)] ?? "";
};

export const CaseTypePill = ({ value }: { value?: number | null }) => {
  const label = getEnumLabel("case_type", value);
  if (!label) return <span className="text-placeholder">-</span>;
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs"
      style={{ background: "var(--label-grey-bg)", color: "var(--label-grey-text)" }}
    >
      {label}
    </span>
  );
};

export const CasePriorityPill = ({ value }: { value?: number | null }) => {
  const label = getEnumLabel("case_priority", value);
  if (!label) return <span className="text-placeholder">-</span>;
  const style =
    value !== null && value !== undefined
      ? priorityPillStyle[value]
      : {
          bg: "var(--label-grey-bg)",
          text: "var(--label-grey-text)",
          dot: "var(--priority-none)",
        };

  const fallbackStyle = {
    bg: "var(--label-grey-bg)",
    text: "var(--label-grey-text)",
    dot: "var(--priority-none)",
  };

  const safeStyle = style ?? fallbackStyle;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs"
      style={{ background: safeStyle.bg, color: safeStyle.text }}
    >
      <span className="size-1.5 rounded-full" style={{ background: safeStyle.dot }} />
      {label}
    </span>
  );
};

export const CasePickerModalStyles = () => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
        .qa-case-picker-modal .custom-tree-indent .ant-tree-indent-unit {
          width: 12px !important;
        }
        .qa-case-picker-modal .custom-tree-indent .ant-tree-switcher {
          width: 16px !important;
          margin-inline-end: 4px !important;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .qa-case-picker-modal .custom-tree-indent .ant-tree-node-content-wrapper {
          padding-inline: 6px !important;
        }
        /* Tree */
        .qa-case-picker-modal .ant-tree {
          background: transparent;
          color: var(--txt-primary);
          font-size: inherit;
        }
        .qa-case-picker-modal .ant-tree .ant-tree-treenode {
          width: 100%;
          padding: 1px 0;
          align-items: center;
        }
        .qa-case-picker-modal .ant-tree .ant-tree-node-content-wrapper {
          min-height: 30px;
          display: flex;
          align-items: center;
          border-radius: 6px;
          transition: background-color 0.15s ease;
        }
        .qa-case-picker-modal .ant-tree .ant-tree-node-content-wrapper:hover {
          background: var(--bg-layer-1-hover);
        }
        .qa-case-picker-modal .ant-tree .ant-tree-node-content-wrapper.ant-tree-node-selected {
          background: var(--bg-accent-subtle);
        }
        .qa-case-picker-modal .ant-tree .ant-tree-checkbox {
          align-self: center;
          margin: 0 4px 0 0;
        }
        .qa-case-picker-modal .ant-tree .ant-tree-checkbox-inner {
          border-radius: 4px;
          border-color: var(--border-strong);
          background: var(--bg-surface-1);
        }
        .qa-case-picker-modal .ant-tree .ant-tree-checkbox-checked .ant-tree-checkbox-inner {
          background: var(--bg-accent-primary);
          border-color: var(--bg-accent-primary);
        }
        .qa-case-picker-modal .ant-tree .ant-tree-checkbox-indeterminate .ant-tree-checkbox-inner::after {
          background: var(--bg-accent-primary);
        }
        .qa-case-picker-modal .ant-tree .ant-tree-checkbox:hover .ant-tree-checkbox-inner {
          border-color: var(--bg-accent-primary);
        }
        /* Input */
        .qa-case-picker-modal .ant-input-affix-wrapper {
          border-radius: 8px;
          border-color: var(--border-subtle);
          background: var(--bg-surface-1);
          font-size: inherit;
        }
        .qa-case-picker-modal .ant-input-affix-wrapper:hover {
          border-color: var(--border-strong);
        }
        .qa-case-picker-modal .ant-input-affix-wrapper-focused,
        .qa-case-picker-modal .ant-input-affix-wrapper:focus-within {
          border-color: var(--bg-accent-primary);
          box-shadow: 0 0 0 2px var(--bg-accent-subtle);
        }
        .qa-case-picker-modal .ant-input {
          background: transparent;
          color: var(--txt-primary);
          font-size: inherit;
        }
        .qa-case-picker-modal .ant-input::placeholder {
          color: var(--txt-placeholder);
        }
        .qa-case-picker-modal .ant-input-prefix {
          color: var(--txt-tertiary);
          margin-inline-end: 8px;
        }
        /* Table */
        .qa-case-picker-modal .ant-table-wrapper,
        .qa-case-picker-modal .ant-table {
          background: transparent;
          font-size: inherit;
        }
        .qa-case-picker-modal .ant-table {
          color: var(--txt-primary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
        }
        .qa-case-picker-modal .ant-table-container {
          border-radius: 10px;
          overflow: hidden;
        }
        .qa-case-picker-modal .ant-table-thead > tr > th {
          background: var(--bg-surface-2) !important;
          color: var(--text-color-secondary) !important;
          font-weight: 500 !important;
          font-size: inherit !important;
          border-bottom: 1px solid var(--border-subtle) !important;
          padding: 10px 12px !important;
        }
        .qa-case-picker-modal .ant-table-thead > tr > th::before {
          display: none !important;
        }
        .qa-case-picker-modal .ant-table-tbody > tr > td {
          border-bottom: 1px solid var(--border-subtle) !important;
          padding: 9px 12px !important;
          font-size: inherit;
        }
        .qa-case-picker-modal .ant-table-tbody > tr:last-child > td {
          border-bottom: none !important;
        }
        .qa-case-picker-modal .ant-table-tbody > tr.ant-table-row:hover > td,
        .qa-case-picker-modal .ant-table-cell-row-hover {
          background: var(--bg-layer-1-hover) !important;
        }
        .qa-case-picker-modal .ant-table-tbody > tr.ant-table-row-selected > td {
          background: var(--bg-accent-subtle) !important;
        }
        /* Checkbox */
        .qa-case-picker-modal .ant-checkbox-inner {
          border-radius: 4px;
          border-color: var(--border-strong);
          background: var(--bg-surface-1);
        }
        .qa-case-picker-modal .ant-checkbox-checked .ant-checkbox-inner {
          background: var(--bg-accent-primary);
          border-color: var(--bg-accent-primary);
        }
        .qa-case-picker-modal .ant-checkbox-indeterminate .ant-checkbox-inner::after {
          background: var(--bg-accent-primary);
        }
        .qa-case-picker-modal .ant-checkbox:hover .ant-checkbox-inner,
        .qa-case-picker-modal .ant-checkbox-wrapper:hover .ant-checkbox-inner {
          border-color: var(--bg-accent-primary);
        }
        .qa-case-picker-modal .ant-checkbox-checked::after {
          border-color: var(--bg-accent-primary);
        }
        /* Pagination */
        .qa-case-picker-modal .modal-pagination-bar .ant-pagination {
          margin: 0 !important;
          color: var(--txt-secondary);
          font-size: inherit;
        }
        .qa-case-picker-modal .modal-pagination-bar .ant-pagination .ant-pagination-simple-pager {
          color: var(--txt-secondary);
        }
        .qa-case-picker-modal .modal-pagination-bar .ant-pagination .ant-pagination-simple-pager input {
          width: 40px;
          border-radius: 6px;
          border-color: var(--border-subtle);
          background: var(--bg-surface-1);
          color: var(--txt-primary);
        }
        .qa-case-picker-modal .modal-pagination-bar .ant-pagination .ant-pagination-options-size-changer {
          margin-inline-start: 8px;
        }
        .qa-case-picker-modal .modal-pagination-bar .ant-pagination .ant-select-selector {
          border-radius: 6px !important;
          border-color: var(--border-subtle) !important;
          background: var(--bg-surface-1) !important;
          color: var(--txt-secondary) !important;
        }
        .qa-case-picker-modal .modal-pagination-bar .ant-pagination .ant-pagination-prev .ant-pagination-item-link,
        .qa-case-picker-modal .modal-pagination-bar .ant-pagination .ant-pagination-next .ant-pagination-item-link {
          color: var(--txt-secondary);
        }
        /* Scroll areas: always show vertical scrollbar */
        .qa-case-picker-modal .tree-scroll,
        .qa-case-picker-modal .table-scroll {
          scrollbar-gutter: stable;
          overflow-y: scroll;
          scrollbar-width: thin;
          scrollbar-color: var(--scrollbar-thumb) transparent;
        }
        .qa-case-picker-modal .tree-scroll::-webkit-scrollbar,
        .qa-case-picker-modal .table-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
          display: block;
        }
        .qa-case-picker-modal .tree-scroll::-webkit-scrollbar-track,
        .qa-case-picker-modal .table-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .qa-case-picker-modal .tree-scroll::-webkit-scrollbar-thumb,
        .qa-case-picker-modal .table-scroll::-webkit-scrollbar-thumb {
          background-color: var(--scrollbar-thumb);
          border-radius: 999px;
        }
        .qa-case-picker-modal .tree-scroll::-webkit-scrollbar-thumb:hover,
        .qa-case-picker-modal .table-scroll::-webkit-scrollbar-thumb:hover {
          background-color: color-mix(in oklch, var(--scrollbar-thumb) 85%, var(--txt-primary));
        }
      `,
    }}
  />
);
