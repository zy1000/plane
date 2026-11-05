"use client";

import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import type { TRequirementEditSession } from "./use-requirement-edit-session";

type TProps = {
  session: TRequirementEditSession;
  /** 内容可改（页面级写权限 + 未锁定 + 未关闭）才给「编辑」入口；评审中 / 已关闭的行只剩状态可改 */
  canEdit: boolean;
  className?: string;
};

/**
 * 需求详情抽屉 / 整页共用的「编辑」与「编辑中 · 取消 / 保存」。
 * 文字按钮不带图标；编辑中的标记与按钮放一起，让人一眼看出此刻改的东西还没落库。
 */
export const RequirementEditModeActions = ({ session, canEdit, className }: TProps) => {
  const { t } = useTranslation();
  if (!canEdit) return null;

  if (!session.isEditing) {
    return (
      <Button variant="secondary" size="lg" onClick={session.startEditing} className={className}>
        {t("edit")}
      </Button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="mr-1 inline-flex items-center gap-2 text-body-xs-medium text-primary">
        <span aria-hidden className="size-2 rounded-full bg-accent-primary ring-4 ring-accent-primary/20" />
        编辑中
      </span>
      <Button variant="secondary" size="lg" onClick={session.cancel} disabled={session.isSaving}>
        {t("cancel")}
      </Button>
      <Button variant="primary" size="lg" onClick={() => void session.save()} loading={session.isSaving}>
        {session.isSaving ? `${t("saving")}…` : t("save")}
      </Button>
    </div>
  );
};
