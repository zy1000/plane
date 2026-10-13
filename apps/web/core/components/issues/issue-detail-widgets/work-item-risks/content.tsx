/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRisk } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { RiskLevelBadge, RiskStatusBadge } from "@/components/risks/badges";
// hooks
import { getRiskError } from "@/hooks/store/use-risks";

type Props = {
  workspaceSlug: string;
  projectId: string;
  risks: TRisk[];
  /** 传了才渲染行尾的解除按钮（canManage） */
  onUnlink?: (riskId: string) => Promise<void>;
};

/** 风险独立详情页；区块里点行在新标签打开，不打断正在看的缺陷 */
const getRiskDetailHref = (workspaceSlug: string, projectId: string, riskId: string) =>
  `/${workspaceSlug}/projects/${projectId}/risks/${riskId}`;

/**
 * 缺陷已关联的风险行。行几何对齐关联需求区块：左缩进 + 箭头占位，属性收在右侧。
 * 行尾解绑直接执行，不再二次确认。
 */
export const WorkItemRisksCollapsibleContent = (props: Props) => {
  const { workspaceSlug, projectId, risks, onUnlink } = props;
  const { t } = useTranslation();
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const handleUnlink = async (riskId: string) => {
    if (!onUnlink || unlinkingId) return;
    setUnlinkingId(riskId);
    try {
      await onUnlink(riskId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("risk.widget.unlink_success") });
    } catch (error) {
      const { message, code } = getRiskError(error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: code ? t(`risk.errors.${code}`) : message,
      });
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <div className="pb-1">
      {risks.map((risk) => (
        <div
          key={risk.id}
          className="group relative flex h-full min-h-11 w-full items-center py-1 pr-2 transition-all hover:bg-surface-2"
          style={{ paddingLeft: 6 }}
        >
          <div className="flex size-5 shrink-0" aria-hidden />
          <Tooltip tooltipContent={t("risk.widget.open")} position="top">
            <a
              href={getRiskDetailHref(workspaceSlug, projectId, risk.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-3 hover:text-accent-primary"
            >
              <span className="shrink-0 font-mono text-12 text-secondary">{risk.code}</span>
              <span className="min-w-0 max-w-full truncate text-13 text-primary">{risk.name}</span>
            </a>
          </Tooltip>
          <div className="flex shrink-0 items-center gap-2">
            <RiskLevelBadge level={risk.risk_level} />
            <RiskStatusBadge status={risk.status} />
            {onUnlink && (
              <Tooltip tooltipContent={t("risk.widget.unlink")}>
                <button
                  type="button"
                  aria-label={t("risk.widget.unlink")}
                  disabled={unlinkingId !== null}
                  onClick={() => handleUnlink(risk.id)}
                  className={cn(
                    // 悬停行时才出现，避免一排 × 抢视线
                    "grid size-6 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity",
                    "group-hover:opacity-100 focus-visible:opacity-100 hover:bg-layer-2 hover:text-secondary disabled:opacity-50"
                  )}
                >
                  <X className="size-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
