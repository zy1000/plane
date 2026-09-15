import { Link2, MoreHorizontal, PenLine, Send, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { getIconButtonStyling } from "@plane/propel/icon-button";
import type { TReviewTailoringDetail } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "review_tailoring";

/**
 * 顶栏右侧：一个主按钮 + 「⋯」。
 *
 * 主按钮按状态只出一个 —— 可编辑时是「提交签批」，已生效时是「开始修订」；签批中是签批进度 +
 * 「签批」（本轮在等我签时是主按钮，否则是「签批详情」次按钮，都打开签批弹窗）。低频动作（取消修订、复制链接、删除）收进「⋯」，
 * 不再和「添加评审 / 添加产品 / 保存」挤成一排。
 */
export const DetailHeaderActions = ({
  detail,
  canManage,
  isMutating,
  currentUserId,
  onSubmit,
  onRevise,
  onOpenApproval,
  onCancelRevision,
  onCopyLink,
  onDelete,
}: {
  detail: TReviewTailoringDetail;
  canManage: boolean;
  isMutating: boolean;
  currentUserId?: string;
  onSubmit: () => void;
  onRevise: () => void;
  onOpenApproval: () => void;
  onCancelRevision: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const { status } = detail;
  const isEditable = status === EReviewTailoringStatus.DRAFT || status === EReviewTailoringStatus.REVISING;
  // 与列表行的删除入口同一口径：只有从未生效过的草稿能删
  const canDelete = canManage && status === EReviewTailoringStatus.DRAFT && detail.revision === 0;
  const isPending = status === EReviewTailoringStatus.PENDING;
  const myApproval = detail.approvals.find((approval) => approval.approver === currentUserId);
  const canSign = isPending && Boolean(myApproval && !myApproval.action);
  const approvedCount = detail.approvals.filter((approval) => approval.action === "approved").length;

  return (
    <>
      {isPending && detail.approvals.length > 0 && (
        <span className="mr-1 flex items-center gap-2 text-12 whitespace-nowrap text-tertiary tabular-nums">
          <span className="flex w-8 gap-0.5">
            {detail.approvals.map((approval) => (
              <span
                key={approval.id}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  approval.action === "approved"
                    ? "bg-success-primary"
                    : approval.action === "rejected"
                      ? "bg-danger-primary"
                      : "bg-layer-3"
                )}
              />
            ))}
          </span>
          {t(`${I18N}.approval.progress`, { approved: approvedCount, total: detail.approvals.length })}
        </span>
      )}
      <CustomMenu
        // CustomMenu 自己包了一层 <button>，这里只画样子
        customButton={
          <span className={getIconButtonStyling("secondary", "lg")} aria-label={t(`${I18N}.detail.more`)}>
            <MoreHorizontal className="size-4" />
          </span>
        }
        placement="bottom-end"
        closeOnSelect
      >
        {canManage && status === EReviewTailoringStatus.REVISING && (
          <CustomMenu.MenuItem onClick={onCancelRevision} className="flex items-center gap-2">
            <Undo2 className="size-3.5" />
            {t(`${I18N}.actions.cancel_revision`)}
          </CustomMenu.MenuItem>
        )}
        <CustomMenu.MenuItem onClick={onCopyLink} className="flex items-center gap-2">
          <Link2 className="size-3.5" />
          {t(`${I18N}.list.copy_link`)}
        </CustomMenu.MenuItem>
        {canDelete && (
          <CustomMenu.MenuItem onClick={onDelete} className="flex items-center gap-2 text-danger-primary">
            <Trash2 className="size-3.5" />
            {t(`${I18N}.actions.delete`)}
          </CustomMenu.MenuItem>
        )}
      </CustomMenu>

      {canManage && isEditable && (
        <Button variant="primary" size="lg" prependIcon={<Send />} disabled={isMutating} onClick={onSubmit}>
          {t(`${I18N}.approval.submit`)}
        </Button>
      )}
      {canManage && status === EReviewTailoringStatus.APPROVED && (
        <Button variant="primary" size="lg" prependIcon={<PenLine />} disabled={isMutating} onClick={onRevise}>
          {t(`${I18N}.actions.revise`)}
        </Button>
      )}
      {isPending && (
        <Button variant={canSign ? "primary" : "secondary"} size="lg" prependIcon={<PenLine />} onClick={onOpenApproval}>
          {t(canSign ? `${I18N}.approval.sign` : `${I18N}.approval.view`)}
        </Button>
      )}
    </>
  );
};
