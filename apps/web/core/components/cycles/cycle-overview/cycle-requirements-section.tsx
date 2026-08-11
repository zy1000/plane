"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectRequirement, TRequirementProjectStage } from "@plane/types";
import { AlertModalCore, Button, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";

/**
 * 迭代概览「关联需求」tab 的列表区。
 *
 * 阶段胶囊是**只读**的：阶段由关联事实（迭代/发布单）在服务端派生，这里没有任何
 * 写入口。刻意不复用 projects/requirements 下的阶段单元格组件 —— 那个组件带
 * 下拉交互与 sticky portal 逻辑，这里只要一枚胶囊，抄配色比跨目录耦合便宜。
 */
const STAGE_PILL_CLASS: Record<TRequirementProjectStage, string> = {
  linked: "bg-layer-3 text-secondary",
  planned: "bg-accent-subtle text-accent-primary",
  in_progress: "bg-warning-subtle text-warning-primary",
  done: "bg-success-subtle text-success-primary",
  pending_verification: "bg-warning-subtle text-warning-primary",
  released: "bg-success-subtle text-success-primary",
};

type TProps = {
  requirements: TProjectRequirement[];
  isLoading: boolean;
  error: string | null;
  /** 无 PROJECT_REQUIREMENT_LINK_MANAGE 权限（或迭代已归档）时隐藏关联/解除入口 */
  canManage: boolean;
  unlinkingRequirementId: string | null;
  onOpenLinkModal: () => void;
  onUnlink: (requirementId: string) => Promise<void>;
};

export const CycleRequirementsSection = (props: TProps) => {
  const { requirements, isLoading, error, canManage, unlinkingRequirementId, onOpenLinkModal, onUnlink } = props;
  const { t } = useTranslation();
  /** 解除关联的二次确认对象。确认框里展示编号 + 标题，避免解错行 */
  const [pendingUnlinkRow, setPendingUnlinkRow] = useState<TProjectRequirement | null>(null);

  const handleUnlinkConfirm = () => {
    if (!pendingUnlinkRow) return;
    void (async () => {
      await onUnlink(pendingUnlinkRow.id);
      setPendingUnlinkRow(null);
    })();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center justify-end pb-2">
        <Button
          variant="link-neutral"
          className="p-0"
          onClick={onOpenLinkModal}
          disabled={!canManage}
          aria-label={t("project_requirements.container.link_button")}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("project_requirements.container.link_button")}
        </Button>
      </div>
      {isLoading ? (
        <Loader className="space-y-2">
          <Loader.Item height="32px" />
          <Loader.Item height="32px" />
          <Loader.Item height="32px" />
        </Loader>
      ) : error ? (
        <p className="text-sm text-danger-primary">{error}</p>
      ) : requirements.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">
          {t("project_requirements.container.empty")}
        </div>
      ) : (
        <div className="min-h-0 max-h-[min(360px,50vh)] flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
          {requirements.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-2 border-b border-subtle px-2 py-2 hover:bg-layer-1"
            >
              {row.display_id && <RequirementIdentifier displayId={row.display_id} />}
              <Tooltip tooltipContent={row.title}>
                <span className="min-w-0 flex-1 truncate text-sm text-primary">{row.title}</span>
              </Tooltip>
              <span
                className={cn(
                  "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-11 font-medium",
                  STAGE_PILL_CLASS[row.stage]
                )}
              >
                {t(`project_requirements.stage.${row.stage}`)}
              </span>
              {canManage && (
                <Button
                  variant="link-neutral"
                  className="shrink-0 p-0 text-11"
                  loading={unlinkingRequirementId === row.id}
                  disabled={unlinkingRequirementId !== null}
                  onClick={() => setPendingUnlinkRow(row)}
                  aria-label={t("project_requirements.container.unlink")}
                >
                  {t("project_requirements.container.unlink")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertModalCore
        isOpen={pendingUnlinkRow !== null}
        isSubmitting={pendingUnlinkRow !== null && unlinkingRequirementId === pendingUnlinkRow.id}
        handleClose={() => setPendingUnlinkRow(null)}
        handleSubmit={handleUnlinkConfirm}
        title={t("project_requirements.container.unlink")}
        content={
          pendingUnlinkRow
            ? [pendingUnlinkRow.display_id, pendingUnlinkRow.title].filter(Boolean).join(" · ")
            : ""
        }
        // AlertModalCore 的按钮默认是英文硬编码，本仓库其余调用点也都显式传
        primaryButtonText={{ default: t("project_requirements.container.unlink"), loading: t("loading") }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
};
