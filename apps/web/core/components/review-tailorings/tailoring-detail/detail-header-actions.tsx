import { FileText, Link2, MoreHorizontal, PenLine, Send, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { getIconButtonStyling } from "@plane/propel/icon-button";
import type { TReviewTailoringDetail } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { CustomMenu } from "@plane/ui";

const I18N = "review_tailoring";

/**
 * 顶栏右侧：一个主按钮 + 「⋯」。
 *
 * 主按钮按状态只出一个 —— 可编辑时是「提交签批」，已生效时是「开始修订」，签批中没有
 * （操作都在签批面板上）。低频动作（编辑描述、取消修订、复制链接、删除）收进「⋯」，
 * 不再和「添加评审 / 添加产品 / 保存」挤成一排。
 */
export const DetailHeaderActions = ({
  detail,
  canManage,
  isMutating,
  onSubmit,
  onRevise,
  onEditDescription,
  onCancelRevision,
  onCopyLink,
  onDelete,
}: {
  detail: TReviewTailoringDetail;
  canManage: boolean;
  isMutating: boolean;
  onSubmit: () => void;
  onRevise: () => void;
  onEditDescription: () => void;
  onCancelRevision: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const { status } = detail;
  const isEditable = status === EReviewTailoringStatus.DRAFT || status === EReviewTailoringStatus.REVISING;
  // 与列表行的删除入口同一口径：只有从未生效过的草稿能删
  const canDelete = canManage && status === EReviewTailoringStatus.DRAFT && detail.revision === 0;

  return (
    <>
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
        {canManage && (
          <CustomMenu.MenuItem onClick={onEditDescription} className="flex items-center gap-2">
            <FileText className="size-3.5" />
            {t(`${I18N}.detail.edit_description`)}
          </CustomMenu.MenuItem>
        )}
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
    </>
  );
};
