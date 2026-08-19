/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { CalendarDays, Link2Off } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectRequirement } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
// components
import { ProductChip } from "@/components/products/product-chip";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { RequirementStatusCell } from "@/components/requirements/requirement-status-cell";

type Props = {
  requirements: TProjectRequirement[];
  /** 传了才渲染行尾的解除按钮（canManage） */
  onUnlink?: (requirementId: string) => Promise<void>;
};

/**
 * 工作项已关联的需求行。行几何对齐子工作项 / 用例：左缩进 + 箭头占位，属性收在右侧。
 * 行尾解绑直接执行，不再二次确认。
 */
export const WorkItemRequirementsCollapsibleContent = (props: Props) => {
  const { requirements, onUnlink } = props;
  const { t } = useTranslation();
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const handleUnlink = async (requirementId: string) => {
    if (!onUnlink || unlinkingId) return;
    setUnlinkingId(requirementId);
    try {
      await onUnlink(requirementId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_requirements.container.toast_unlinked") });
    } catch (error) {
      const payload = error as { error?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("project_requirements.container.toast_failed"),
        message: payload?.error ?? t("project_requirements.toast.failed"),
      });
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <div className="pb-1">
      {requirements.map((requirement) => (
        <div
          key={requirement.id}
          className={cn(
            "group relative flex h-full min-h-11 w-full items-center py-1 pr-2 transition-all hover:bg-surface-2",
            // 已关闭的需求：已有关联保留，只在展示上置灰
            requirement.status === "closed" && "opacity-60"
          )}
          style={{ paddingLeft: 6 }}
        >
          <div className="flex size-5 shrink-0" aria-hidden />
          <span className="flex min-w-0 flex-1 items-center gap-3">
            {requirement.display_id && <RequirementIdentifier displayId={requirement.display_id} />}
            <Tooltip tooltipContent={requirement.title} position="top">
              <span className="min-w-0 max-w-full truncate text-13 text-primary">{requirement.title}</span>
            </Tooltip>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <RequirementStatusCell variant="chip" showDot={false} status={requirement.status} />
            <span className="inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-11 text-secondary">
              <CalendarDays className="h-3 w-3 shrink-0" />
              {requirement.created_at ? renderFormattedDate(requirement.created_at) : "—"}
            </span>
            {/* 项目可以同时引用多个产品，两条同名需求只能靠所属产品徽标区分 */}
            <ProductChip
              identifier={requirement.product_identifier}
              name={requirement.product_name}
              hideName
              className="shrink-0"
            />
            {onUnlink && (
              <Tooltip tooltipContent={t("project_requirements.container.unlink")}>
                <button
                  type="button"
                  aria-label={t("project_requirements.container.unlink")}
                  disabled={unlinkingId !== null}
                  onClick={() => handleUnlink(requirement.id)}
                  className="grid size-6 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-secondary disabled:opacity-50"
                >
                  <Link2Off className="size-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
