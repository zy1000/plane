/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { KeyboardEvent } from "react";
import { useTranslation } from "@plane/i18n";
import { PriorityIcon, StateGroupIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
import { Assignees } from "@/components/core/modals/add-work-items-modal/work-item-picker-table";
import { WorkItemTypeIcon } from "@/components/issues/work-item-type-icon";
import type { TProductWorkItem } from "@/types/product-work-items";

const COLUMNS = [
  { key: "identifier", width: "w-[150px]" },
  { key: "name", width: "" },
  { key: "type", width: "w-[120px]" },
  { key: "state", width: "w-[130px]" },
  { key: "priority", width: "w-[84px]" },
  { key: "assignees", width: "w-[130px]" },
  { key: "project", width: "w-[170px]" },
  { key: "module", width: "w-[110px]" },
  { key: "target_date", width: "w-[108px]" },
] as const;

const CLOSED_STATE_GROUPS = new Set(["completed", "cancelled"]);

const todayString = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const Placeholder = () => <span className="text-placeholder">—</span>;

type TProps = {
  rows: TProductWorkItem[];
  onOpen: (row: TProductWorkItem) => void;
};

/** 跨项目只读表：点一行打开工作项详情抽屉 */
export const ProductWorkItemsTable = ({ rows, onOpen }: TProps) => {
  const { t } = useTranslation();
  const today = todayString();

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: TProductWorkItem) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(row);
    }
  };

  return (
    <table className="w-full min-w-[1100px] table-fixed border-collapse text-left">
      <thead className="sticky top-0 z-[1] bg-layer-1">
        <tr className="border-b border-subtle text-12 font-medium text-tertiary">
          {COLUMNS.map((column, index) => (
            <th key={column.key} className={cn("h-10 px-3 font-medium", index === 0 && "pl-5", column.width)}>
              {t(`workspace_products.work_items.columns.${column.key}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isOverdue =
            !!row.target_date && row.target_date < today && !CLOSED_STATE_GROUPS.has(row.state?.group ?? "");
          return (
            <tr
              key={row.id}
              tabIndex={0}
              className="h-12 cursor-pointer border-b border-subtle text-13 hover:bg-layer-transparent-hover focus-visible:bg-layer-transparent-hover focus-visible:outline-none"
              onClick={() => onOpen(row)}
              onKeyDown={(event) => handleKeyDown(event, row)}
            >
              <td className="truncate pr-3 pl-5 text-12 text-tertiary tabular-nums">
                {row.project_identifier}-{row.sequence_id}
              </td>
              <td className="truncate px-3 font-medium text-primary" title={row.name}>
                {row.from_product_set && (
                  <span className="mr-2 inline-flex h-5 items-center rounded bg-accent-subtle px-1.5 align-middle text-11 font-medium text-accent-primary">
                    {t("workspace_product_sets.title")}
                  </span>
                )}
                {row.name}
              </td>
              <td className="px-3">
                {row.type ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-secondary">
                    <WorkItemTypeIcon typeName={row.type.name} fallbackIcon={row.type.logo_props?.icon} size={16} />
                    <span className="min-w-0 truncate">{row.type.name}</span>
                  </span>
                ) : (
                  <Placeholder />
                )}
              </td>
              <td className="px-3">
                {row.state ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-secondary">
                    <StateGroupIcon stateGroup={row.state.group} color={row.state.color} />
                    <span className="min-w-0 truncate">{row.state.name}</span>
                  </span>
                ) : (
                  <Placeholder />
                )}
              </td>
              <td className="px-3">
                <span className="flex min-w-0 items-center gap-1.5 text-secondary">
                  <PriorityIcon priority={row.priority ?? "none"} />
                  <span className="truncate">{t(row.priority ?? "none")}</span>
                </span>
              </td>
              <td className="px-3">
                <Assignees ids={row.assignee_ids} />
              </td>
              <td className="truncate px-3 text-secondary" title={row.project_name}>
                {row.project_name}
              </td>
              <td className="px-3">
                {row.product_module ? (
                  <span
                    className="inline-block max-w-full truncate rounded bg-layer-1 px-1.5 py-0.5 align-middle text-12 text-secondary"
                    title={row.product_module.name}
                  >
                    {row.product_module.name}
                  </span>
                ) : (
                  <Placeholder />
                )}
              </td>
              <td className={cn("px-3 tabular-nums", isOverdue ? "font-medium text-danger-primary" : "text-secondary")}>
                {row.target_date ?? <Placeholder />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
