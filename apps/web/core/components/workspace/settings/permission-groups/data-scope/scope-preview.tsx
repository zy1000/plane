/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { TDataScopeMode, TDataScopePreview } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";

const CHIP_LIMIT = 8;
const ROW_LIMIT = 8;

type Props = {
  kind: "projects" | "products";
  mode: TDataScopeMode;
  preview: TDataScopePreview | null;
  error: string | null;
};

/**
 * 数据权限一段的命中预览（数据由上层 useDataScopePreview 取）：
 * 「全部」列前几个名字 +「等 N 个」；「按条件」列前几条的表格。「指定」由勾选表自己展示，这里不画。
 */
export const DataScopePreview = observer(function DataScopePreview({ kind, mode, preview, error }: Props) {
  const { getProjectById } = useProject();
  const { getUserDetails } = useMember();
  const unit = kind === "projects" ? "个项目" : "个产品";

  if (error) return <p className="text-13 text-danger-primary">{error}</p>;
  if (!preview || mode === "selected") return null;

  if (mode === "all") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {preview.items.slice(0, CHIP_LIMIT).map((item) => (
          <span
            key={item.id}
            className="inline-flex h-8 items-center rounded-full bg-layer-1 px-3.5 text-13 whitespace-nowrap text-secondary"
          >
            {item.name}
          </span>
        ))}
        {preview.count > CHIP_LIMIT && <span className="pl-1 text-13 text-tertiary">等 {preview.count} 个</span>}
      </div>
    );
  }

  if (preview.count === 0) {
    return (
      <p className="rounded-lg border border-subtle py-8 text-center text-13 text-placeholder">当前没有满足条件的{unit.slice(1)}</p>
    );
  }

  const grid = kind === "projects" ? "grid-cols-[minmax(0,1fr)_120px_150px]" : "grid-cols-[minmax(0,1fr)_120px]";
  return (
    <div className="overflow-hidden rounded-lg border border-subtle">
      <div className={`grid ${grid} h-10 items-center gap-x-4 bg-layer-1 px-4 text-13 font-medium text-tertiary`}>
        <span>{kind === "projects" ? "项目" : "产品"}</span>
        <span>代号</span>
        {kind === "projects" && <span>负责人</span>}
      </div>
      {preview.items.slice(0, ROW_LIMIT).map((item) => {
        const leadValue = kind === "projects" ? getProjectById(item.id)?.project_lead : undefined;
        const leadId = typeof leadValue === "string" ? leadValue : leadValue?.id;
        const lead = leadId ? getUserDetails(leadId) : undefined;
        return (
          <div key={item.id} className={`grid ${grid} h-11 items-center gap-x-4 border-t border-subtle px-4 text-14`}>
            <span className="truncate text-primary">{item.name}</span>
            <span className="truncate text-tertiary tabular-nums">{item.identifier}</span>
            {kind === "projects" &&
              (lead ? (
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={lead.display_name} src={getFileURL(lead.avatar_url ?? "")} size="sm" />
                  <span className="truncate text-secondary">{lead.display_name}</span>
                </span>
              ) : (
                <span className="text-placeholder">—</span>
              ))}
          </div>
        );
      })}
      <div className="flex h-11 items-center justify-between border-t border-subtle bg-layer-1 px-4 text-13 text-tertiary">
        <span className="tabular-nums">
          共 {preview.count} {unit}
        </span>
        {preview.count > ROW_LIMIT && <span className="tabular-nums">显示前 {ROW_LIMIT} 个</span>}
      </div>
    </div>
  );
});
