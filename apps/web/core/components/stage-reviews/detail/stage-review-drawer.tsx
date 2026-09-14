import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import { Check, CircleX, Info, MoveRight, Play, Send, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TStageReview,
  TStageReviewActivity,
  TStageReviewAttachment,
  TStageReviewComment,
  TStageReviewDetail,
  TSubmitStageReviewPayload,
  TUpdateStageReviewPayload,
} from "@plane/types";
import { EStageReviewResult, EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import useKeypress from "@/hooks/use-keypress";
import { getStageReviewError } from "@/hooks/store/use-stage-reviews";
import { useStageReviewDetail } from "@/hooks/store/use-stage-review-detail";
import { StageReviewStatusBadge } from "../badges";
import { SubmitStageReviewModal } from "../submit-review-modal";
import { StageReviewAttachments } from "./stage-review-attachments";
import { StageReviewContent } from "./stage-review-content";
import { StageReviewSidebar } from "./stage-review-sidebar";
import { StageReviewStepper, useStepHints } from "./stage-review-stepper";
import { StageReviewTimeline } from "./stage-review-timeline";

const I18N = "stage_review";

/** 动作条的按钮：主按钮 36px 带图标，退回始终是描边的幽灵按钮 */
const FOOT_BUTTON = "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-14 font-medium transition disabled:opacity-50";
const FOOT_PRIMARY = cn(FOOT_BUTTON, "bg-accent-primary text-on-color shadow-raised-100 hover:bg-accent-primary-hover");
const FOOT_SUCCESS = cn(FOOT_BUTTON, "bg-success-primary text-on-color shadow-raised-100 hover:opacity-90");
const FOOT_GHOST = cn(FOOT_BUTTON, "border border-strong bg-surface-1 text-secondary hover:bg-layer-2");

/**
 * 动作条左侧那句话。评审中且上次不通过时提醒整改后重提；已评审时从轨迹里找到完成那条，
 * 写成「已于某天由谁审核通过 / 免审完成」；其余按状态给固定提示。
 */
const useFootHint = (detail: TStageReviewDetail, activities: TStageReviewActivity[]) => {
  const { t } = useTranslation();
  if (detail.status === EStageReviewStatus.IN_REVIEW && detail.result === EStageReviewResult.REJECTED) {
    return t(`${I18N}.actions.hint_in_review_rejected`);
  }
  if (detail.status !== EStageReviewStatus.COMPLETED) return t(`${I18N}.actions.hint_${detail.status}`);
  const completion = [...activities]
    .reverse()
    .find((activity) => activity.field === "status" && activity.new_value === EStageReviewStatus.COMPLETED);
  if (!completion) return t(`${I18N}.actions.hint_completed`);
  const key = detail.result === EStageReviewResult.WAIVED ? "completed_waived_by" : "completed_by";
  return t(`${I18N}.actions.${key}`, {
    date: renderFormattedDate(completion.created_at),
    name: completion.actor_detail?.display_name ?? "—",
  });
};

/** 提交审核成功后的提示按结论区分：不通过没有「提交」出去，免审直接完成了 */
const SUBMIT_TOAST: Partial<Record<EStageReviewResult, string>> = {
  [EStageReviewResult.REJECTED]: "rejected",
  [EStageReviewResult.WAIVED]: "waived_completed",
};

/**
 * 评审详情抽屉。**评审与评审活动共用这一套** —— 两者字段几乎一样，只有层级不同。
 *
 * 布局分三段：头（面包屑 / 名片式标题区 / 四段进度）、身（正文 + 右侧属性栏）、脚（动作条）。
 * 正文放「要读的」（描述、工作指引、附件、讨论与轨迹），右栏放「要查的」（产品、阶段、
 * 负责人、日期、结论、O 阶段那两组），**动作条钉在底部**：滚到评论区也能直接推进。
 *
 * 宽度比工作项抽屉宽一档（2xl 下 70%）—— 这一屏要同时铺开正文与 312px 的属性栏。
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
    const next = await run(() => advance(payload), SUBMIT_TOAST[payload.result] ?? "submitted");
    if (next) setIsSubmitOpen(false);
  };

  const portalContainer = typeof document !== "undefined" ? document.getElementById("full-screen-portal") : null;
  if (!portalContainer) return null;

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
          <div className="absolute inset-0 bg-black/25" onClick={onClose} />
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
              "absolute top-0 right-0 bottom-0 flex w-full flex-col border-l border-subtle bg-surface-1 shadow-overlay-200",
              "md:w-[88%] xl:w-[78%] 2xl:w-[70%]"
            )}
          >
            {isLoading || !detail ? (
              <Loader className="space-y-3 p-6">
                <Loader.Item height="28px" />
                <Loader.Item height="44px" />
                <Loader.Item height="320px" />
              </Loader>
            ) : (
              <DrawerBody
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                projectId={projectId}
                detail={detail}
                attachments={attachments}
                comments={comments}
                activities={activities}
                canManage={canManage}
                isMutating={isMutating}
                titleDraft={titleDraft}
                setTitleDraft={setTitleDraft}
                onClose={onClose}
                onUpdate={(payload) => void run(() => updateReview(payload), "updated")}
                onStart={() => void run(advance, "started")}
                onOpenSubmit={() => setIsSubmitOpen(true)}
                onApprove={() => void run(advance, "completed")}
                onRollback={() => void run(rollback, "rolled_back")}
                onUpload={(file) => void run(() => uploadAttachment(file), "attachment_uploaded")}
                onDownload={(assetId) => void downloadAttachment(assetId)}
                onDeleteAttachment={(assetId) => void run(() => deleteAttachment(assetId), "attachment_deleted")}
                onCreateComment={createComment}
                onDeleteComment={deleteComment}
              />
            )}

            {detail && (
              <SubmitStageReviewModal
                isOpen={isSubmitOpen}
                detail={detail}
                isSubmitting={isMutating}
                onClose={() => setIsSubmitOpen(false)}
                onSubmit={handleSubmitResult}
              />
            )}
          </div>
        </Transition.Child>
      </div>
    </Transition>,
    portalContainer
  );
};

type DrawerBodyProps = {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  detail: TStageReviewDetail;
  attachments: TStageReviewAttachment[];
  comments: TStageReviewComment[];
  activities: TStageReviewActivity[];
  canManage: boolean;
  isMutating: boolean;
  titleDraft: string;
  setTitleDraft: (next: string) => void;
  onClose: () => void;
  onUpdate: (payload: TUpdateStageReviewPayload) => void;
  onStart: () => void;
  onOpenSubmit: () => void;
  onApprove: () => void;
  onRollback: () => void;
  onUpload: (file: File) => void;
  onDownload: (assetId: string) => void;
  onDeleteAttachment: (assetId: string) => void;
  onCreateComment: (commentHtml: string) => Promise<unknown>;
  onDeleteComment: (commentId: string) => Promise<unknown>;
};

/** 抽屉有数据之后的整个内容；拆出来是为了让 hooks（进度提示、完成提示）拿到非空的 detail */
const DrawerBody = ({
  workspaceSlug,
  workspaceId,
  projectId,
  detail,
  attachments,
  comments,
  activities,
  canManage,
  isMutating,
  titleDraft,
  setTitleDraft,
  onClose,
  onUpdate,
  onStart,
  onOpenSubmit,
  onApprove,
  onRollback,
  onUpload,
  onDownload,
  onDeleteAttachment,
  onCreateComment,
  onDeleteComment,
}: DrawerBodyProps) => {
  const { t } = useTranslation();
  const stepHints = useStepHints(detail, activities);
  const footHint = useFootHint(detail, activities);

  const isCompleted = detail.status === EStageReviewStatus.COMPLETED;
  const isRejected = detail.status === EStageReviewStatus.IN_REVIEW && detail.result === EStageReviewResult.REJECTED;
  // 已评审是终态，没有上一步可退（与后端 rollback 一致）
  const previousStatus = isCompleted
    ? undefined
    : STAGE_REVIEW_STATUS_ORDER[STAGE_REVIEW_STATUS_ORDER.indexOf(detail.status) - 1];
  // 已评审即定稿：字段与附件都改不了也退不回，要重做去裁剪表取消勾选后重新生成
  const editable = canManage && !isCompleted;
  const source = detail.parent_title
    ? t(`${I18N}.detail.belongs_to`, { title: detail.parent_title })
    : detail.is_manual
      ? t(`${I18N}.detail.source_manual`)
      : t(`${I18N}.detail.source_tailoring`);

  return (
    <>
      {/* 头一行：面包屑 44px，关闭按钮在最左，与工作项 peek 一致；评审活动多一级所属评审 */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-subtle px-2.5 text-13 text-tertiary">
        <button
          type="button"
          onClick={onClose}
          aria-label={t(`${I18N}.actions.close`)}
          className="rounded-md p-1.5 text-tertiary transition hover:bg-layer-2 hover:text-secondary"
        >
          <MoveRight className="size-4" />
        </button>
        <span className="ml-1 flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-secondary">{detail.product_detail?.name ?? "—"}</span>
          <span className="text-placeholder">/</span>
          <span className="whitespace-nowrap font-medium text-secondary">{detail.stage_detail?.label ?? "—"}</span>
          {detail.parent_title && (
            <>
              <span className="text-placeholder">/</span>
              <span className="truncate font-medium text-secondary">{detail.parent_title}</span>
            </>
          )}
          <span className="text-placeholder">/</span>
          <span className="truncate">{detail.title}</span>
        </span>
      </div>

      {/* 名片式标题区：阶段 + 类型 + 来源一行，大标题，状态药丸靠右；下面是四段进度 */}
      <div className="flex shrink-0 flex-col gap-4 border-b border-subtle px-7 pt-5 pb-4">
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2 text-12 text-tertiary">
              {detail.stage_detail?.label && (
                <span className="inline-flex h-5.5 items-center rounded bg-layer-2 px-1.5 text-11 font-medium whitespace-nowrap text-secondary">
                  {detail.stage_detail.label}
                </span>
              )}
              <StageReviewKindBadge kind={detail.kind} />
              <span className="truncate">· {source}</span>
            </div>
            {editable ? (
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  const next = titleDraft.trim();
                  // 标题不允许清空：清了列表里就只剩一行空白
                  if (!next) setTitleDraft(detail.title);
                  else if (next !== detail.title) onUpdate({ title: next });
                }}
                className={cn(
                  "-mx-2 min-w-0 rounded-md border border-transparent px-2 py-0.5 text-22 leading-snug font-semibold",
                  "text-primary hover:border-subtle focus:border-accent-strong focus:outline-none"
                )}
              />
            ) : (
              <h2 className="min-w-0 truncate text-22 leading-snug font-semibold text-primary">{detail.title}</h2>
            )}
          </div>
          <StageReviewStatusBadge
            status={detail.status}
            className="mt-6 h-7.5 gap-2 px-3 text-13 [&>span]:size-2"
          />
        </div>

        <StageReviewStepper status={detail.status} result={detail.result} hints={stepHints} />
      </div>

      {/* 身：正文与属性栏各自滚动 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-7 py-5">
          <StageReviewContent
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            detail={detail}
            editable={editable}
            onUpdate={onUpdate}
          />

          <StageReviewAttachments
            attachments={attachments}
            editable={editable}
            isMutating={isMutating}
            onUpload={onUpload}
            onDownload={onDownload}
            onDelete={onDeleteAttachment}
          />

          <StageReviewTimeline
            detail={detail}
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            comments={comments}
            activities={activities}
            isMutating={isMutating}
            onCreateComment={onCreateComment}
            onDeleteComment={onDeleteComment}
          />
        </div>

        <StageReviewSidebar
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          detail={detail}
          editable={editable}
          onUpdate={onUpdate}
        />
      </div>

      {/* 脚：动作条常驻，提示在左、按钮在右，滚到哪都能推进 */}
      {canManage && (
        <div className="flex h-15 shrink-0 items-center gap-2.5 border-t border-subtle bg-surface-1 pr-5 pl-7">
          <span className="flex min-w-0 items-center gap-1.5 text-13 text-tertiary">
            {isCompleted ? (
              <Check className="size-3.5 shrink-0 text-success-primary" />
            ) : isRejected ? (
              <CircleX className="size-3.5 shrink-0 text-danger-primary" />
            ) : (
              <Info className="size-3.5 shrink-0 text-placeholder" />
            )}
            <span className="truncate">{footHint}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2.5">
            {previousStatus && (
              <button type="button" className={FOOT_GHOST} disabled={isMutating} onClick={onRollback}>
                <Undo2 className="size-3.5" />
                {t(`${I18N}.actions.rollback_plain`)}
              </button>
            )}
            {detail.status === EStageReviewStatus.NOT_STARTED && (
              <button type="button" className={FOOT_PRIMARY} disabled={isMutating} onClick={onStart}>
                <Play className="size-3.5 fill-current" />
                {t(`${I18N}.actions.start`)}
              </button>
            )}
            {detail.status === EStageReviewStatus.IN_REVIEW && (
              <button type="button" className={FOOT_PRIMARY} disabled={isMutating} onClick={onOpenSubmit}>
                <Send className="size-3.5" />
                {t(`${I18N}.actions.submit_for_approval`)}
              </button>
            )}
            {detail.status === EStageReviewStatus.IN_APPROVAL && (
              <button type="button" className={FOOT_SUCCESS} disabled={isMutating} onClick={onApprove}>
                <Check className="size-3.5" strokeWidth={2.5} />
                {t(`${I18N}.actions.approve`)}
              </button>
            )}
          </span>
        </div>
      )}
    </>
  );
};
