import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateReviewTailoringPayload } from "@plane/types";
import { EReviewTailoringKind } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useReviewTailoringStageOptions } from "@/hooks/store/use-review-tailoring-stage-options";
import { CreateTailoringStageSelect } from "./create-stage-select";
import { toDescriptionHtml } from "./description-text";
import { TAILORING_KIND_ORDER } from "./list/filters";
import {
  MODAL_INPUT,
  MODAL_TEXTAREA,
  RadioOption,
  TailoringField,
  TailoringModalFooter,
  TailoringModalHeader,
} from "./tailoring-detail/modal-frame";

const I18N = "review_tailoring.form";

/**
 * 新建裁剪表：标题、裁剪类型必填，描述选填。
 *
 * 过程评审裁剪不绑阶段 —— 纵轴一次铺开全部阶段的模板树。O阶段评审裁剪要再选一个阶段
 * （只能是阶段类型为 O阶段 的项目阶段，单选），纵轴只在这个阶段下展开。评审与产品不在
 * 这里选，进详情页逐个加。裁剪类型与阶段建完不可改，所以在这里必须选。
 */
export const CreateTailoringModal = observer(function CreateTailoringModal({
  isOpen,
  workspaceSlug,
  projectId,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: TCreateReviewTailoringPayload) => void;
}) {
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EReviewTailoringKind | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  const needsStage = kind === EReviewTailoringKind.O_STAGE;
  const stageOptions = useReviewTailoringStageOptions(workspaceSlug, projectId, isOpen && needsStage);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setKind(null);
    setStageId(null);
    setDescription("");
    setTouched(false);
  }, [isOpen]);

  // 只有一个可选阶段时替用户选上
  useEffect(() => {
    if (needsStage && stageOptions?.length === 1) setStageId(stageOptions[0].id);
  }, [needsStage, stageOptions]);

  const titleError = touched && !title.trim();
  const kindError = touched && !kind;
  const stageError = touched && needsStage && !stageId;
  const noStageOptions = needsStage && stageOptions?.length === 0;

  const handleSubmit = () => {
    setTouched(true);
    if (!title.trim() || !kind || (needsStage && !stageId)) return;
    const text = description.trim();
    onSubmit({
      title: title.trim(),
      tailoring_kind: kind,
      ...(needsStage && stageId ? { stage_id: stageId } : {}),
      ...(text ? { description_html: toDescriptionHtml(text) } : {}),
    });
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <TailoringModalHeader title={t(`${I18N}.create_title`)} onClose={onClose} />

      <div className="flex flex-col gap-4.5 px-6 py-5">
        <TailoringField
          label={t(`${I18N}.title_label`)}
          htmlFor="create-tailoring-title"
          required
          error={titleError ? t(`${I18N}.title_required`) : undefined}
        >
          <input
            id="create-tailoring-title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSubmit();
            }}
            placeholder={t(`${I18N}.title_placeholder`)}
            className={cn(MODAL_INPUT, titleError && "border-danger-strong focus:border-danger-strong")}
          />
        </TailoringField>

        <div className="flex flex-col gap-1.5">
          <span id="create-tailoring-kind-label" className="text-13 font-medium text-secondary">
            {t(`${I18N}.kind_label`)}
            <span className="ml-1 text-danger-primary">*</span>
          </span>
          <div role="radiogroup" aria-labelledby="create-tailoring-kind-label" className="flex h-9 items-center gap-8">
            {TAILORING_KIND_ORDER.map((option) => (
              <RadioOption
                key={option}
                checked={kind === option}
                onSelect={() => {
                  setKind(option);
                  setStageId(null);
                }}
              >
                {t(`review_tailoring.kind.${option}`)}
              </RadioOption>
            ))}
          </div>
          {kindError ? (
            <span className="text-12 text-danger-primary">{t(`${I18N}.kind_required`)}</span>
          ) : (
            !needsStage && <span className="text-12 text-tertiary">{t(`${I18N}.kind_locked`)}</span>
          )}
        </div>

        {needsStage && (
          <TailoringField
            label={t(`${I18N}.stage_label`)}
            required
            error={stageError && !noStageOptions ? t(`${I18N}.stage_required`) : undefined}
            hint={t(`${I18N}.kind_stage_locked`)}
          >
            {noStageOptions ? (
              <p className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-subtle px-3 py-2 text-13 text-secondary">
                {t(`${I18N}.stage_empty`)}
                <Link
                  href={`/${workspaceSlug}/projects/${projectId}/stages`}
                  className="text-accent-primary hover:underline"
                >
                  {t(`${I18N}.stage_empty_action`)}
                </Link>
              </p>
            ) : (
              <CreateTailoringStageSelect
                options={stageOptions ?? []}
                value={stageId}
                hasError={stageError}
                onChange={setStageId}
              />
            )}
          </TailoringField>
        )}

        <TailoringField label={t(`${I18N}.description_label`)} htmlFor="create-tailoring-description">
          <textarea
            id="create-tailoring-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={MODAL_TEXTAREA}
          />
        </TailoringField>
      </div>

      <TailoringModalFooter>
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          loading={isSubmitting}
          disabled={isSubmitting || noStageOptions}
          onClick={handleSubmit}
        >
          {t(`${I18N}.submit`)}
        </Button>
      </TailoringModalFooter>
    </ModalCore>
  );
});
