/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { ListChecks, Plus, Unlink } from "lucide-react";
import { Popconfirm } from "antd";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProjectRequirement } from "@plane/types";
import { cn } from "@plane/utils";
// 阶段配色与项目需求列表共用一份，保证同一档阶段两处长得一样
import { REQUIREMENT_STAGE_PILL } from "@/components/projects/requirements/project-requirement-stage-cell";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";

// 视觉壳层与 release-scope-tab.tsx 的各 section 保持一致
const SECTION_CARD = "flex min-h-[380px] flex-col rounded-xl border border-subtle bg-surface-1";
const SECTION_BODY = "flex min-h-0 flex-1 flex-col border-t border-subtle px-5 py-3";
const TABLE_HEAD_CLASS =
  "text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]";

type Props = {
  requirements: TProjectRequirement[];
  requirementsLoading: boolean;
  requirementsError: string | null;
  unlinkingRequirementId: string | null;
  canManageReleaseRequirements: boolean;
  onOpenRequirementAssociate: () => void;
  onUnlinkRequirement: (requirementId: string) => Promise<void> | void;
  className?: string;
};

/**
 * 发布单「关联需求」section。
 *
 * 行内容量刻意收着：编号、标题、阶段胶囊（只读，阶段由服务端按关联事实派生）、
 * 在途变更黄标（is_locked）。需求内容本身由产品维护，这里不给任何编辑入口，
 * 唯一的操作是解除关联。
 */
export const ReleaseRequirementsSection: React.FC<Props> = ({
  requirements,
  requirementsLoading,
  requirementsError,
  unlinkingRequirementId,
  canManageReleaseRequirements,
  onOpenRequirementAssociate,
  onUnlinkRequirement,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <section className={cn(SECTION_CARD, className)}>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="h-4 w-4 text-[#f59e0b]" aria-hidden />
          <h2 className="text-sm font-semibold text-primary">{t("project_requirements.container.title")}</h2>
          <span className="rounded-full bg-layer-2 px-2 py-0.5 text-[11px] font-medium text-placeholder tabular-nums">
            {requirements.length}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!canManageReleaseRequirements) return;
            onOpenRequirementAssociate();
          }}
          disabled={!canManageReleaseRequirements}
          aria-disabled={!canManageReleaseRequirements}
          className={cn(!canManageReleaseRequirements && "cursor-not-allowed opacity-60")}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          <span className="ml-1">{t("project_requirements.container.link_button")}</span>
        </Button>
      </div>
      <div className={SECTION_BODY}>
        {requirementsLoading ? (
          <div className="flex min-h-40 flex-1 items-center justify-center py-8 text-sm text-secondary">加载中...</div>
        ) : requirementsError ? (
          <p className="text-sm text-danger-primary">{requirementsError}</p>
        ) : requirements.length === 0 ? (
          <div className="grid min-h-40 flex-1 place-items-center text-sm text-placeholder">
            {t("project_requirements.container.empty")}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="min-w-full table-fixed">
              <thead>
                <tr className={TABLE_HEAD_CLASS}>
                  <th className="w-[110px] px-2 py-2 text-sm font-medium text-primary">编号</th>
                  <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">需求</th>
                  <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">
                    {t("project_requirements.stage_column")}
                  </th>
                  <th className="w-[120px] py-2 pr-2 pl-10 text-left text-sm font-medium text-primary">操作</th>
                </tr>
              </thead>
              <tbody>
                {requirements.map((row) => (
                  <tr key={row.id} className="border-b border-subtle last:border-b-0 hover:bg-layer-1">
                    <td className="px-2 py-2">
                      <RequirementIdentifier displayId={row.display_id} />
                    </td>
                    <td className="truncate px-2 py-2 text-sm text-primary" title={row.title}>
                      {row.title}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex h-5 min-w-0 items-center whitespace-nowrap rounded px-1.5 text-11 font-medium",
                            REQUIREMENT_STAGE_PILL[row.stage]
                          )}
                        >
                          <span className="truncate">{t(`project_requirements.stage.${row.stage}`)}</span>
                        </span>
                        {/* 在途变更黄标：这条需求正走变更评审。发布不会被它阻塞，纯提示 */}
                        {row.is_locked && (
                          <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded bg-warning-subtle px-1.5 text-11 font-medium text-warning-primary">
                            {t("requirement_approval.state.in_review")}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-2 pl-10 text-left">
                      <Popconfirm
                        title={`${t("project_requirements.container.unlink")}？`}
                        okText={t("project_requirements.container.unlink")}
                        cancelText={t("cancel")}
                        disabled={!canManageReleaseRequirements}
                        onConfirm={() => void onUnlinkRequirement(row.id)}
                      >
                        <Button
                          variant="link-neutral"
                          className="p-0"
                          loading={unlinkingRequirementId === row.id}
                          disabled={unlinkingRequirementId === row.id || !canManageReleaseRequirements}
                          aria-label={t("project_requirements.container.unlink")}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </Popconfirm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
