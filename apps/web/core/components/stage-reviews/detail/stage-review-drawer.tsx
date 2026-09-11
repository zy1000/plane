import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import { MoveRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TStageReview, TSubmitStageReviewPayload } from "@plane/types";
import { EStageReviewResult, EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import useKeypress from "@/hooks/use-keypress";
import { getStageReviewError } from "@/hooks/store/use-stage-reviews";
import { useStageReviewDetail } from "@/hooks/store/use-stage-review-detail";
import { StageReviewResultBadge, StageReviewStatusBadge } from "../badges";
import { SubmitStageReviewModal } from "../submit-review-modal";
import { StageReviewAttachments } from "./stage-review-attachments";
import { StageReviewContent } from "./stage-review-content";
import { StageReviewSidebar } from "./stage-review-sidebar";
import { StageReviewStepper } from "./stage-review-stepper";
import { StageReviewTabs } from "./stage-review-tabs";

const I18N = "stage_review";

/**
 * 评审详情抽屉。**评审与评审活动共用这一套** —— 两者字段几乎一样，只有层级不同。
 *
 * 布局分三段：头（面包屑 / 标题 / 四步进度）、身（正文 + 右侧属性栏）、脚（动作条）。
 * 正文放「要读的」（描述、工作指引、附件、讨论与轨迹），右栏放「要查的」（产品、阶段、
 * 负责人、日期、结论、O 阶段那两组），**动作条钉在底部**：滚到评论区也能直接推进。
 *
 * 宽度跟工作项抽屉同一个口径（`md:w-[80%] 2xl:w-[55%]`）—— 这一屏要同时铺开正文与属性栏。
 */
export const StageReviewDrawer = ({
  workspaceSlug,
  workspaceId,
  projectId,
  reviewId,
  canManage,
  onClose,
  onUpdated,
}: {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  reviewId: string | null;
  canManage: boolean;
  onClose: () => void;
  onUpdated: (review: TStageReview) => void;
}) => {
  const { t } = useTranslation();
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const {
    detail,
    attachments,
    comments,
    activities,
    isLoading,
    isMutating,
    updateReview,
    advance,
    rollback,
    uploadAttachment,
    deleteAttachment,
    downloadAttachment,
    createComment,
    deleteComment,
  } = useStageReviewDetail(workspaceSlug, projectId, reviewId);

  // 换一条评审、或标题存完回灌时跟上
  useEffect(() => setTitleDraft(detail?.title ?? ""), [detail?.id, detail?.title]);

  const isOpen = Boolean(reviewId);
  useKeypress("Escape", () => {
    if (isOpen && !isSubmitOpen) onClose();
  });

  /** 动作统一在这里吞错：领域错误码有中文文案，其余回落到服务端原文 */
  const run = async (action: () => Promise<unknown>, successKey: string) => {
    try {
      const next = (await action()) as TStageReview | undefined;
      if (next) onUpdated(next);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.${successKey}`) });
      return next;
    } catch (error) {
      const { message, code } = getStageReviewError(error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${I18N}.toast.failed`),
        message: code ? t(`${I18N}.errors.${code}`, { defaultValue: message }) : message,
      });
      return undefined;
    }
  };

  const handleSubmitResult = async (payload: TSubmitStageReviewPayload) => {
    const next = await run(() => advance(payload), "submitted");
    if (next) setIsSubmitOpen(false);
  };

  const portalContainer = typeof document !== "undefined" ? document.getElementById("full-screen-portal") : null;
  if (!portalContainer) return null;

  const previousStatus = detail
    ? STAGE_REVIEW_STATUS_ORDER[STAGE_REVIEW_STATUS_ORDER.indexOf(detail.status) - 1]
    : undefined;
  // 已评审之后字段不再可改：要改先退回上一步，这样轨迹里不会出现「评完了还在改」
  const editable = Boolean(detail) && canManage && detail?.status !== EStageReviewStatus.COMPLETED;

  return createPortal(
    <Transition show={isOpen} as={Fragment}>
      <div className="absolute inset-0 z-[25]">
        <Transition.Child
          as={Fragment}
          enter="transition-opacity duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="absolute inset-0 bg-black/20" onClick={onClose} />
        </Transition.Child>

        <Transition.Child
          as={Fragment}
          enter="transition-transform duration-200 ease-out"
          enterFrom="translate-x-full"
          enterTo="translate-x-0"
          leave="transition-transform duration-150 ease-in"
          leaveFrom="translate-x-0"
          leaveTo="translate-x-full"
        >
          <div
            className={cn(
              "absolute top-0 right-0 bottom-0 flex w-full flex-col border-l border-subtle bg-surface-1",
              "md:w-[80%] 2xl:w-[55%]"
            )}
          >
            {isLoading || !detail ? (
              <Loader className="space-y-3 p-6">
                <Loader.Item height="28px" />
                <Loader.Item height="44px" />
                <Loader.Item height="320px" />
              </Loader>
            ) : (
              <>
                {/* 头：面包屑一条 40px，关闭按钮在最左，与工作项 peek 一致 */}
                <div className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle px-3 text-12 text-tertiary">
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={t(`${I18N}.actions.close`)}
                    className="rounded p-1 text-tertiary transition hover:bg-layer-2 hover:text-secondary"
                  >
                    <MoveRight className="size-4" />
                  </button>
                  <span className="truncate">{detail.product_detail?.name ?? "—"}</span>
                  <span className="text-placeholder">/</span>
                  <span className="whitespace-nowrap">{detail.stage_detail?.label ?? "—"}</span>
                </div>

                <div className="flex shrink-0 flex-col gap-3 px-5 pt-4 pb-3.5">
                  <div className="flex items-center gap-2.5">
                    {editable ? (
                      <input
                        value={titleDraft}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        onBlur={() => {
                          const next = titleDraft.trim();
                          // 标题不允许清空：清了列表里就只剩一行空白
                          if (!next) setTitleDraft(detail.title);
                          else if (next !== detail.title) void run(() => updateReview({ title: next }), "updated");
                        }}
                        className={cn(
                          "-mx-1.5 min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 text-18 font-semibold",
                          "text-primary hover:border-subtle focus:border-accent-strong focus:outline-none"
                        )}
                      />
                    ) : (
                      <h3 className="min-w-0 flex-1 truncate text-18 font-semibold text-primary">{detail.title}</h3>
                    )}
                    <StageReviewKindBadge kind={detail.kind} />
                    <StageReviewStatusBadge status={detail.status} />
                    {detail.result && <StageReviewResultBadge result={detail.result} />}
                  </div>

                  <StageReviewStepper status={detail.status} />
                </div>

                {/* 身：正文与属性栏各自滚动 */}
                <div className="flex min-h-0 flex-1 flex-col border-t border-subtle lg:flex-row">
                  <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
                    {detail.result === EStageReviewResult.CONDITIONAL && detail.conditional_reason && (
                      <p className="rounded-r-lg border-l-2 border-warning-strong bg-warning-subtle px-3.5 py-2.5 text-13 leading-relaxed text-warning-primary">
                        <b className="font-semibold">{t(`${I18N}.result.conditional`)}</b>：{detail.conditional_reason}
                      </p>
                    )}

                    <StageReviewContent
                      workspaceSlug={workspaceSlug}
                      workspaceId={workspaceId}
                      projectId={projectId}
                      detail={detail}
                      editable={Boolean(editable)}
                      onUpdate={(payload) => void run(() => updateReview(payload), "updated")}
                    />

                    <StageReviewAttachments
                      attachments={attachments}
                      editable={Boolean(editable)}
                      isMutating={isMutating}
                      onUpload={(file) => void run(() => uploadAttachment(file), "attachment_uploaded")}
                      onDownload={(assetId) => void downloadAttachment(assetId)}
                      onDelete={(assetId) => void run(() => deleteAttachment(assetId), "attachment_deleted")}
                    />

                    <StageReviewTabs
                      reviewId={detail.id}
                      workspaceSlug={workspaceSlug}
                      workspaceId={workspaceId}
                      projectId={projectId}
                      comments={comments}
                      activities={activities}
                      isMutating={isMutating}
                      onCreateComment={createComment}
                      onDeleteComment={deleteComment}
                    />
                  </div>

                  <StageReviewSidebar
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    detail={detail}
                    editable={Boolean(editable)}
                    onUpdate={(payload) => void run(() => updateReview(payload), "updated")}
                  />
                </div>

                {/* 脚：动作条常驻，滚到哪都能推进 */}
                {canManage && (
                  <div className="flex shrink-0 items-center gap-2.5 border-t border-subtle bg-surface-1 px-5 py-3">
                    {detail.status === EStageReviewStatus.NOT_STARTED && (
                      <Button variant="primary" size="sm" disabled={isMutating} onClick={() => run(advance, "started")}>
                        {t(`${I18N}.actions.start`)}
                      </Button>
                    )}
                    {detail.status === EStageReviewStatus.IN_REVIEW && (
                      <Button variant="primary" size="sm" disabled={isMutating} onClick={() => setIsSubmitOpen(true)}>
                        {t(`${I18N}.actions.submit_for_approval`)}
                      </Button>
                    )}
                    {detail.status === EStageReviewStatus.IN_APPROVAL && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isMutating}
                        onClick={() => run(advance, "completed")}
                      >
                        {t(`${I18N}.actions.approve`)}
                      </Button>
                    )}
                    {previousStatus && (
                      <Button
                        variant="neutral-primary"
                        size="sm"
                        disabled={isMutating}
                        onClick={() => run(rollback, "rolled_back")}
                      >
                        {t(`${I18N}.actions.rollback`, { status: t(`${I18N}.status.${previousStatus}`) })}
                      </Button>
                    )}
                    <span className="ml-auto text-12 text-tertiary">{t(`${I18N}.actions.hint_${detail.status}`)}</span>
                  </div>
                )}

                <SubmitStageReviewModal
                  isOpen={isSubmitOpen}
                  detail={detail}
                  isSubmitting={isMutating}
                  onClose={() => setIsSubmitOpen(false)}
                  onSubmit={handleSubmitResult}
                />
              </>
            )}
          </div>
        </Transition.Child>
      </div>
    </Transition>,
    portalContainer
  );
};
