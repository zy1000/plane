import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringDetail } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { ReviewTailoringStatusBadge } from "../status-badge";

const I18N = "review_tailoring";

/**
 * 详情页头部：身份信息 + 按状态分派的操作区。
 *
 * 标题就地可改（表头是元数据，不走签批）；操作按钮按状态出：
 * 草稿 / 修订中 → 保存、提交签批、添加产品、（修订中另有）取消修订；
 * 已生效 → 开始修订；签批中 → 操作全在底部签批条上，这里只显示状态。
 */
export const TailoringHeader = ({
  detail,
  canManage,
  isDirty,
  isMutating,
  onTitleSave,
  onSaveCells,
  onSubmit,
  onAddProducts,
  onAddReviews,
  onRevise,
  onCancelRevision,
}: {
  detail: TReviewTailoringDetail;
  canManage: boolean;
  isDirty: boolean;
  isMutating: boolean;
  onTitleSave: (title: string) => void;
  onSaveCells: () => void;
  onSubmit: () => void;
  onAddProducts: () => void;
  onAddReviews: () => void;
  onRevise: () => void;
  onCancelRevision: () => void;
}) => {
  const { t } = useTranslation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(detail.title);

  useEffect(() => setDraftTitle(detail.title), [detail.title]);

  const isEditable =
    detail.status === EReviewTailoringStatus.DRAFT || detail.status === EReviewTailoringStatus.REVISING;

  return (
    <div className="border-b border-subtle px-6 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setDraftTitle(detail.title);
                    setIsEditingTitle(false);
                  }
                  if (event.key === "Enter" && draftTitle.trim()) {
                    onTitleSave(draftTitle.trim());
                    setIsEditingTitle(false);
                  }
                }}
                className="focus:border-accent-primary h-8 min-w-0 flex-1 rounded border border-subtle bg-surface-1 px-2 text-15 font-semibold text-primary outline-none"
              />
              <button
                type="button"
                className="rounded p-1 text-tertiary hover:bg-layer-2 hover:text-primary"
                onClick={() => {
                  if (draftTitle.trim()) onTitleSave(draftTitle.trim());
                  setIsEditingTitle(false);
                }}
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-tertiary hover:bg-layer-2 hover:text-primary"
                onClick={() => {
                  setDraftTitle(detail.title);
                  setIsEditingTitle(false);
                }}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="group flex items-center gap-2">
              <h1 className="truncate text-15 font-semibold text-primary">{detail.title}</h1>
              {canManage && (
                <button
                  type="button"
                  title={t(`${I18N}.actions.edit_header`)}
                  className="rounded p-1 text-tertiary opacity-0 transition group-hover:opacity-100 hover:bg-layer-2 hover:text-primary"
                  onClick={() => setIsEditingTitle(true)}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-11 text-tertiary">
            <ReviewTailoringStatusBadge status={detail.status} />
            <span>
              {detail.revision === 0
                ? t(`${I18N}.list.never_effective`)
                : `${t(`${I18N}.list.revision`)} ${t(`${I18N}.list.revision_value`, { count: detail.revision })}`}
            </span>
            {detail.approved_at && (
              <span>
                {t(`${I18N}.list.approved_at`)} {renderFormattedDate(detail.approved_at)}
              </span>
            )}
            <span>
              {t(`${I18N}.list.axis_value`, {
                reviews: detail.review_count,
                products: detail.product_count,
              })}
            </span>
            <span>
              {t(`${I18N}.list.selected_value`, {
                selected: detail.selected_count,
                total: detail.item_count,
              })}
            </span>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {isEditable && (
              <>
                <Button variant="secondary" size="sm" disabled={isMutating} onClick={onAddReviews}>
                  {t(`${I18N}.actions.add_reviews`)}
                </Button>
                <Button variant="secondary" size="sm" disabled={isMutating} onClick={onAddProducts}>
                  {t(`${I18N}.actions.add_products`)}
                </Button>
                {detail.status === EReviewTailoringStatus.REVISING && (
                  <Button variant="secondary" size="sm" disabled={isMutating} onClick={onCancelRevision}>
                    {t(`${I18N}.actions.cancel_revision`)}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!isDirty || isMutating}
                  onClick={onSaveCells}
                  className={cn(isDirty && "border-accent-primary text-accent-primary")}
                >
                  {isDirty ? t(`${I18N}.matrix.save`) : t(`${I18N}.matrix.saved`)}
                </Button>
                <Button variant="primary" size="sm" disabled={isMutating} onClick={onSubmit}>
                  {t(`${I18N}.approval.submit`)}
                </Button>
              </>
            )}
            {detail.status === EReviewTailoringStatus.APPROVED && (
              <Button variant="primary" size="sm" disabled={isMutating} onClick={onRevise}>
                {t(`${I18N}.actions.revise`)}
              </Button>
            )}
          </div>
        )}
      </div>

      {isDirty && (
        <p className="mt-2 text-11 text-warning-primary">{t(`${I18N}.matrix.unsaved`)}</p>
      )}
    </div>
  );
};
