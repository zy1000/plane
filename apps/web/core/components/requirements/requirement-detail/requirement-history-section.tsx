"use client";

import { useCallback, useState } from "react";
import { History } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementTrailEntry, TRequirementTypeSchema } from "@plane/types";
import { cn } from "@plane/utils";
import { RequirementChangeTrail } from "./requirement-change-trail";
import { DetailSectionHeader } from "./requirement-detail-section";
import { RequirementVersionHistory } from "./requirement-version-history";

type TTab = "trail" | "versions";

/**
 * 详情底部的「历史」区：变更轨迹与版本历史收成一个区块、两个页签。
 *
 * 两块讲的是同一条时间线上的事（轨迹含待审与被驳回的改动，版本只有通过审批的那些），
 * 各自带一个折叠标题会变成两个「打开看看」。页签默认停在轨迹 ——
 * 它随详情一起加载、信息更全；版本历史仍是切过去才拉数据。
 *
 * 轨迹里点版本徽章 -> 切到版本页签并高亮那一版，这是两个列表之间唯一的联动。
 */
export const RequirementHistorySection = ({
  workspaceSlug,
  productId,
  requirementId,
  requirementType,
  trail,
  approvedVersion,
  canRollback,
  onRolledBack,
}: {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  requirementType: TRequirementTypeSchema | null;
  trail: TRequirementTrailEntry[];
  approvedVersion: number | null;
  canRollback: boolean;
  onRolledBack?: () => void;
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TTab>("trail");
  // token 保证同一版重复点也能再触发一次
  const [versionFocus, setVersionFocus] = useState<{ version: number; token: number } | null>(null);
  const focusVersion = useCallback((version: number) => {
    setTab("versions");
    setVersionFocus((prev) => ({ version, token: (prev?.token ?? 0) + 1 }));
  }, []);

  const tabs: { key: TTab; label: string; count?: number }[] = [
    { key: "trail", label: t("requirement_detail.change_trail"), count: trail.length },
    { key: "versions", label: t("requirement_detail.versions.label") },
  ];

  return (
    <section className="flex flex-col gap-3">
      <DetailSectionHeader
        icon={History}
        title={t("requirement_detail.history.label")}
        actions={
          <div role="tablist" className="flex items-center gap-0.5 rounded-md bg-layer-1 p-0.5">
            {tabs.map((item) => {
              const isActive = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(item.key)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded px-2 text-caption-md-medium transition-colors",
                    isActive ? "bg-surface-1 text-primary shadow-raised-100" : "text-tertiary hover:text-secondary"
                  )}
                >
                  {item.label}
                  {typeof item.count === "number" && item.count > 0 && (
                    <span
                      className={cn(
                        "rounded px-1 text-10 font-medium tabular-nums",
                        isActive ? "bg-layer-1 text-tertiary" : "bg-layer-3 text-tertiary"
                      )}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        }
      />

      {tab === "trail" ? (
        <RequirementChangeTrail
          variant="plain"
          entries={trail}
          requirementType={requirementType}
          onFocusVersion={focusVersion}
        />
      ) : (
        <RequirementVersionHistory
          variant="plain"
          workspaceSlug={workspaceSlug}
          productId={productId}
          requirementId={requirementId}
          requirementType={requirementType}
          approvedVersion={approvedVersion}
          canRollback={canRollback}
          focusRequest={versionFocus}
          onRolledBack={onRolledBack}
        />
      )}
    </section>
  );
};
