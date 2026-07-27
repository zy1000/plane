/**
 * 数据 / 配置 Tab 顶部的状态提示条，避免用户误以为草稿改动已生效。
 *
 * draft 且从未发布、以及 published 状态都不渲染 —— 前者没有已发布内容可对比，
 * 后者本身就是生效内容。
 */
import { Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirement } from "@plane/types";

export function RequirementStateBanner({
  requirement,
  onViewChangeRequest,
}: {
  requirement: TRequirement;
  onViewChangeRequest: () => void;
}) {
  const { t } = useTranslation();

  if (requirement.status === "in_review") {
    return (
      <div className="flex items-center gap-2 border-b border-accent-subtle bg-accent-subtle px-4 py-2.5 text-12 text-accent-primary md:px-6">
        <Info className="size-3.5 shrink-0" />
        <span>{t("workspace_products.requirements.state.in_review_banner")}</span>
        {requirement.pending_change_request_id && (
          <button type="button" onClick={onViewChangeRequest} className="font-medium underline underline-offset-2">
            {t("workspace_products.requirements.state.view_change_request")}
          </button>
        )}
      </div>
    );
  }

  if (requirement.status !== "draft" || requirement.current_version === null) return null;

  return (
    <div className="flex items-center gap-2 border-b border-warning-subtle bg-warning-subtle px-4 py-2.5 text-12 text-warning-primary md:px-6">
      <Info className="size-3.5 shrink-0" />
      <span>
        {t("workspace_products.requirements.state.draft_banner", { version: requirement.current_version })}
      </span>
    </div>
  );
}
