import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateStageReviewPayload, TStageReview } from "@plane/types";
import { EStageReviewKind, STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT } from "@plane/types";
import { CustomSearchSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "stage_review";
const NONE = "__none__";

/**
 * 手工新建一条评审。
 *
 * **不进裁剪表**：模板留空，不回写任何裁剪格子，下次修订裁剪表也不会把它删掉 ——
 * 属于流程之外的补充。
 *
 * 类型不让随便选：选了「挂在哪条评审下」就只能是该评审对应的活动类型（父子必须同族），
 * 不挂父才允许在评审 / O阶段评审里挑。这条规则后端 clean() 也会拦，这里挡住是为了
 * 不让人填完一屏才被退回来。
 */
export const CreateStageReviewModal = ({
  isOpen,
  stageId,
  stageLabel,
  reviews,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  stageId: string | null;
  stageLabel: string;
  /** 当前阶段已有的评审：产品列与「所属评审」都从这里来 */
  reviews: TStageReview[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: TCreateStageReviewPayload) => void;
}) => {
  const { t } = useTranslation();
  const [productId, setProductId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [kind, setKind] = useState<EStageReviewKind>(EStageReviewKind.REVIEW);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setProductId(null);
    setParentId(null);
    setKind(EStageReviewKind.REVIEW);
    setTitle("");
  }, [isOpen]);

  const products = useMemo(() => {
    const map = new Map<string, string>();
    for (const review of reviews) {
      if (review.product_detail) map.set(review.product_detail.id, review.product_detail.name);
    }
    return [...map.entries()];
  }, [reviews]);

  /** 能当父的只有本产品下的顶层评审（树最多两层） */
  const parents = useMemo(
    () => reviews.filter((review) => !review.parent_id && (!productId || review.product_id === productId)),
    [reviews, productId]
  );

  const parent = parents.find((review) => review.id === parentId) ?? null;
  const effectiveKind = parent ? STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT[parent.kind] : kind;
  const canSubmit = Boolean(productId && stageId && title.trim());

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-6 pt-5.5">
        <h3 className="text-18 font-semibold text-primary">{t(`${I18N}.create.title`)}</h3>
        <p className="mt-1 text-12 text-tertiary">{t(`${I18N}.create.description`, { stage: stageLabel })}</p>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <label className="mb-1.5 block text-12 font-medium text-primary">
            {t(`${I18N}.fields.product`)}
            <span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <CustomSearchSelect
            value={productId}
            options={products.map(([id, name]) => ({ value: id, query: name, content: <span>{name}</span> }))}
            onChange={(value: string) => {
              setProductId(value);
              // 换产品后原来的父评审多半不属于新产品，直接清掉
              setParentId(null);
            }}
            label={
              <span className={cn("text-13", productId ? "text-primary" : "text-tertiary")}>
                {products.find(([id]) => id === productId)?.[1] ?? t(`${I18N}.create.pick_product`)}
              </span>
            }
            buttonClassName="w-full justify-between"
            maxHeight="lg"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-12 font-medium text-primary">{t(`${I18N}.create.parent`)}</label>
          <CustomSearchSelect
            value={parentId ?? NONE}
            options={[
              { value: NONE, query: t(`${I18N}.create.no_parent`), content: <span>{t(`${I18N}.create.no_parent`)}</span> },
              ...parents.map((review) => ({
                value: review.id,
                query: review.title,
                content: <span>{review.title}</span>,
              })),
            ]}
            onChange={(value: string) => setParentId(value === NONE ? null : value)}
            label={<span className="text-13 text-primary">{parent?.title ?? t(`${I18N}.create.no_parent`)}</span>}
            buttonClassName="w-full justify-between"
            maxHeight="lg"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-12 font-medium text-primary">{t(`${I18N}.fields.kind`)}</label>
          {parent ? (
            <p className="rounded-lg bg-layer-1 px-3 py-2 text-12 text-tertiary">
              {t(`${I18N}.create.kind_locked`, {
                kind: t(`workspace_templates.reviews.kind.${effectiveKind}`),
                parent: parent.title,
              })}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {[EStageReviewKind.REVIEW, EStageReviewKind.O_STAGE_REVIEW].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={cn(
                    "grid h-9.5 place-items-center rounded-lg border border-subtle bg-surface-1 text-13 text-secondary",
                    kind === option &&
                      "border-accent-strong bg-accent-subtle font-semibold text-accent-primary ring-1 ring-accent-primary"
                  )}
                >
                  {t(`workspace_templates.reviews.kind.${option}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-12 font-medium text-primary">
            {t(`${I18N}.fields.title`)}
            <span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t(`${I18N}.create.title_placeholder`)}
            className="w-full"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 px-6 pb-5.5">
        <Button variant="neutral-primary" size="sm" onClick={onClose}>
          {t(`${I18N}.actions.cancel`)}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canSubmit || isSubmitting}
          onClick={() =>
            onSubmit({
              product_id: productId as string,
              stage_id: stageId as string,
              kind: effectiveKind,
              parent_id: parentId,
              title: title.trim(),
            })
          }
        >
          {t(`${I18N}.actions.create_confirm`)}
        </Button>
      </div>
    </ModalCore>
  );
};
