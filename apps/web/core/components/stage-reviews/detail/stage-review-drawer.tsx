import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Transition } from "@headlessui/react";
import { Check, ExternalLink, MoveRight, Play, Send, Undo2 } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
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
import { cn } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import useKeypress from "@/hooks/use-keypress";
import { getStageReviewError } from "@/hooks/store/use-stage-reviews";
import type { TStageReviewSaveState } from "@/hooks/store/use-stage-review-detail";
import { useStageReviewDetail } from "@/hooks/store/use-stage-review-detail";
import { ApproveStageReviewModal } from "../approve-review-modal";
import { StageReviewStatusBadge } from "../badges";
import { RollbackStageReviewModal } from "../rollback-review-modal";
import { SubmitStageReviewModal } from "../submit-review-modal";
import type { TStageReviewActionGuard } from "./stage-review-action-guard";
import { getStageReviewActionGuard } from "./stage-review-action-guard";
import { StageReviewAttachments } from "./stage-review-attachments";
import { StageReviewContent } from "./stage-review-content";
import { StageReviewSaveStatus } from "./stage-review-save-status";
import { StageReviewSidebar } from "./stage-review-sidebar";
import { StageReviewStepper, useStepHints } from "./stage-review-stepper";
import { StageReviewTimeline } from "./stage-review-timeline";

const I18N = "stage_review";

/** 标题：编辑态与只读态同一个盒子，切换时不跳；悬停出浅底，聚焦才出蓝边 —— 与右栏就地编辑格同一口径 */
const TITLE_CLASS =
  "-mx-2 h-9 min-w-0 rounded-md border border-transparent px-2 text-20 leading-snug font-semibold text-primary";

/** 退回之后落到哪一步。已评审是终态，没有上一步可退（与后端 rollback 一致） */
const previousStatusOf = (detail: TStageReviewDetail) =>
  detail.status === EStageReviewStatus.COMPLETED
    ? undefined
    : STAGE_REVIEW_STATUS_ORDER[STAGE_REVIEW_STATUS_ORDER.indexOf(detail.status) - 1];

type TTranslate = ReturnType<typeof useTranslation>["t"];

/** 按钮被拦的原因。推进与退回在「不是本人」时文案不同，「没指定人」共用 */
const blockedText = (t: TTranslate, action: "advance" | "rollback", guard: TStageReviewActionGuard) => {
  if (guard.allowed) return "";
  const isNotOwner = guard.reason === "not_leader" || guard.reason === "not_auditor";
  const key = isNotOwner && action === "rollback" ? `rollback_${guard.reason}` : guard.reason;
  return t(`${I18N}.actions.blocked_${key}`, { name: guard.ownerName || "—" });
};

/** 被拦的按钮包一层 Tooltip 说原因；disabled 的 button 收不到指针事件，所以套在 span 上 */
const GuardedAction = ({ guard, text, children }: { guard: TStageReviewActionGuard; text: string; children: ReactNode }) =>
  guard.allowed ? (
    <>{children}</>
  ) : (
    <Tooltip tooltipContent={text} position="bottom-end">
      <span className="inline-flex">{children}</span>
    </Tooltip>
  );

/**
 * 评审详情抽屉。**评审与评审活动共用这一套** —— 两者字段几乎一样，只有层级不同。
 *
 * 布局分两段：头（面包屑 + 保存状态 / 名片式标题区 + 动作按钮 / 四段进度）、身（正文 + 右侧属性栏）。
 * 正文放「要读的」（描述、工作指引、附件、活动），右栏放「要查的」（产品、阶段、负责人、日期、
 * 结论、O 阶段那两组）。**动作按钮住在标题行右侧**，紧挨着状态药丸：状态和「下一步」读在一起。
 *
 * 写入分两种回执：开始 / 提交 / 审核 / 退回 是动作，成功弹 toast；改字段、传删附件、发评论是
 * 随手改，只在顶栏显示保存状态，失败才弹 toast —— 右下角的 toast 不该每改一个字段就冒一次。
 *
 * 宽度比工作项抽屉宽一档（2xl 下 70%）—— 这一屏要同时铺开正文与 312px 的属性栏。
 *
 * `projectId` 永远是**这条评审自己的项目**：产品页里一屏评审横跨多个项目，所有读写都要打到
 * 评审所在项目的端点上。`showProjectCrumb` 给产品页用：面包屑第一段换成项目名，右侧多一个
 * 「在项目中打开」。
 */
export const StageReviewDrawer = ({
  workspaceSlug,
  workspaceId,
  projectId,
  reviewId,
  canManage,
  currentUserId,
  showProjectCrumb = false,
  onClose,
  onUpdated,
}: {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  reviewId: string | null;
  canManage: boolean;
  /** 推进 / 退回只认负责人、审核者本人，按钮要拿它判断能不能点 */
  currentUserId: string | undefined;
  showProjectCrumb?: boolean;
  onClose: () => void;
  onUpdated: (review: TStageReview) => void;
}) => {
  const { t } = useTranslation();
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const {
    detail,
    attachments,
    comments,
    activities,
    isLoading,
    isMutating,
    saveState,
    retryLastSave,
    updateReview,
    advance,
    rollback,
    uploadAttachment,
    deleteAttachment,
    downloadAttachment,
    getAttachmentUrl,
    createComment,
    deleteComment,
  } = useStageReviewDetail(workspaceSlug, projectId, reviewId);

  // 换一条评审、或标题存完回灌时跟上
  useEffect(() => setTitleDraft(detail?.title ?? ""), [detail?.id, detail?.title]);

  const isOpen = Boolean(reviewId);
  useKeypress("Escape", () => {
    if (isOpen && !isSubmitOpen && !isApproveOpen) onClose();
  });

  /** 领域错误码有中文文案，其余回落到服务端原文 */
  const toastError = (error: unknown) => {
    const { message, code } = getStageReviewError(error);
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t(`${I18N}.toast.failed`),
      message: code ? t(`${I18N}.errors.${code}`, { defaultValue: message }) : message,
    });
  };

  /** 动作：成功弹 toast 作回执，并把新状态同步回列表 */
  const runAction = async (action: () => Promise<TStageReview | undefined>, successKey: string) => {
    try {
      const next = await action();
      if (next) onUpdated(next);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.${successKey}`) });
      return next;
    } catch (error) {
      toastError(error);
      return undefined;
    }
  };

  /** 随手改：成功只看顶栏保存状态（hook 维护），失败才弹 toast */
  const runSave = async <T,>(save: () => Promise<T>) => {
    try {
      return await save();
    } catch (error) {
      toastError(error);
      return undefined;
    }
  };

  const handleUpdate = (payload: TUpdateStageReviewPayload) =>
    void runSave(async () => {
      const next = await updateReview(payload);
      if (next) onUpdated(next);
    });

  const handleSubmitResult = async (payload: TSubmitStageReviewPayload) => {
    // 不通过没有「提交」出去，状态留在评审中，提示要跟着换
    const toastKey = payload.result === EStageReviewResult.REJECTED ? "rejected" : "submitted";
    const next = await runAction(() => advance(payload), toastKey);
    if (next) setIsSubmitOpen(false);
  };

  const handleRollback = async (reason: string) => {
    const next = await runAction(() => rollback({ reason }), "rolled_back");
    if (next) setIsRollbackOpen(false);
  };

  const handleApprove = async (comment: string) => {
    const next = await runAction(() => advance({ approval_comment: comment }), "completed");
    if (next) setIsApproveOpen(false);
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
                currentUserId={currentUserId}
                showProjectCrumb={showProjectCrumb}
                isMutating={isMutating}
                saveState={saveState}
                titleDraft={titleDraft}
                setTitleDraft={setTitleDraft}
                onClose={onClose}
                onRetrySave={() => void runSave(retryLastSave)}
                onUpdate={handleUpdate}
                onStart={() => void runAction(advance, "started")}
                onOpenSubmit={() => setIsSubmitOpen(true)}
                onApprove={() => setIsApproveOpen(true)}
                onRollback={() => setIsRollbackOpen(true)}
                onUpload={(file, onProgress) => runSave(() => uploadAttachment(file, onProgress))}
                onDownload={(assetId) => void downloadAttachment(assetId)}
                onDeleteAttachment={(assetId) => runSave(() => deleteAttachment(assetId))}
                getAttachmentUrl={getAttachmentUrl}
                onCreateComment={(commentHtml) => runSave(() => createComment(commentHtml))}
                onDeleteComment={deleteComment}
              />
            )}

            {detail && (
              <>
                <SubmitStageReviewModal
                  isOpen={isSubmitOpen}
                  detail={detail}
                  isSubmitting={isMutating}
                  onClose={() => setIsSubmitOpen(false)}
                  onSubmit={handleSubmitResult}
                />
                <RollbackStageReviewModal
                  isOpen={isRollbackOpen}
                  targetStatus={previousStatusOf(detail)}
                  isSubmitting={isMutating}
                  onClose={() => setIsRollbackOpen(false)}
                  onSubmit={handleRollback}
                />
                <ApproveStageReviewModal
                  isOpen={isApproveOpen}
                  isSubmitting={isMutating}
                  onClose={() => setIsApproveOpen(false)}
                  onSubmit={handleApprove}
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

type DrawerBodyProps = {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  detail: TStageReviewDetail;
  attachments: TStageReviewAttachment[];
  comments: TStageReviewComment[];
  activities: TStageReviewActivity[];
  canManage: boolean;
  currentUserId: string | undefined;
  showProjectCrumb: boolean;
  isMutating: boolean;
  saveState: TStageReviewSaveState;
  titleDraft: string;
  setTitleDraft: (next: string) => void;
  onClose: () => void;
  onRetrySave: () => void;
  onUpdate: (payload: TUpdateStageReviewPayload) => void;
  onStart: () => void;
  onOpenSubmit: () => void;
  onApprove: () => void;
  onRollback: () => void;
  onUpload: (file: File, onProgress: (percentage: number) => void) => Promise<unknown>;
  onDownload: (assetId: string) => void;
  onDeleteAttachment: (assetId: string) => Promise<unknown>;
  getAttachmentUrl: (assetId: string) => Promise<string | undefined>;
  onCreateComment: (commentHtml: string) => Promise<unknown>;
  onDeleteComment: (commentId: string) => Promise<unknown>;
};

/** 抽屉有数据之后的整个内容；拆出来是为了让 hooks（进度提示）拿到非空的 detail */
const DrawerBody = ({
  workspaceSlug,
  workspaceId,
  projectId,
  detail,
  attachments,
  comments,
  activities,
  canManage,
  currentUserId,
  showProjectCrumb,
  isMutating,
  saveState,
  titleDraft,
  setTitleDraft,
  onClose,
  onRetrySave,
  onUpdate,
  onStart,
  onOpenSubmit,
  onApprove,
  onRollback,
  onUpload,
  onDownload,
  onDeleteAttachment,
  getAttachmentUrl,
  onCreateComment,
  onDeleteComment,
}: DrawerBodyProps) => {
  const { t } = useTranslation();
  const stepHints = useStepHints(detail, activities);
  const guard = getStageReviewActionGuard(detail, currentUserId);
  const advanceBlockedText = blockedText(t, "advance", guard.advance);

  const isCompleted = detail.status === EStageReviewStatus.COMPLETED;
  const previousStatus = previousStatusOf(detail);
  // 已评审即定稿：字段与附件都改不了也退不回，要重做去裁剪表取消勾选后重新生成
  const editable = canManage && !isCompleted;
  const hasActions = canManage && !isCompleted;
  const source = detail.parent_title
    ? t(`${I18N}.detail.belongs_to`, { title: detail.parent_title })
    : detail.is_manual
      ? t(`${I18N}.detail.source_manual`)
      : t(`${I18N}.detail.source_tailoring`);

  return (
    <>
      {/* 头一行：面包屑 44px，关闭按钮在最左，与工作项 peek 一致；评审活动多一级所属评审。右侧是保存状态 */}
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
          <span className="truncate font-medium text-secondary">
            {(showProjectCrumb ? detail.project_detail?.name : detail.product_detail?.name) ?? "—"}
          </span>
          <span className="text-placeholder">/</span>
          <span className="font-medium whitespace-nowrap text-secondary">{detail.stage_detail?.label ?? "—"}</span>
          {detail.parent_title && (
            <>
              <span className="text-placeholder">/</span>
              <span className="truncate font-medium text-secondary">{detail.parent_title}</span>
            </>
          )}
          <span className="text-placeholder">/</span>
          <span className="truncate">{detail.title}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 pl-3">
          <StageReviewSaveStatus state={saveState} onRetry={onRetrySave} />
          {showProjectCrumb && (
            <Link
              to={`/${workspaceSlug}/projects/${detail.project_id}/stage-reviews?review=${detail.id}`}
              className="inline-flex h-6.5 items-center gap-1.5 rounded-md px-2 text-13 text-tertiary transition hover:bg-layer-2 hover:text-secondary"
            >
              <ExternalLink className="size-3.5" />
              {t(`${I18N}.detail.open_in_project`)}
            </Link>
          )}
        </span>
      </div>

      {/* 名片式标题区：阶段 + 类型 + 来源一行，标题一行（右侧状态药丸 + 动作按钮）；下面是四段进度 */}
      <div className="flex shrink-0 flex-col gap-4 border-b border-subtle px-7 pt-5 pb-4">
        <div className="flex items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2 text-12 text-tertiary">
              {detail.stage_detail?.label && (
                <span className="inline-flex h-5.5 items-center rounded-md bg-layer-2 px-2 text-12 font-medium whitespace-nowrap text-secondary">
                  {detail.stage_detail.label}
                </span>
              )}
              <StageReviewKindBadge kind={detail.kind} className="rounded-md px-2 text-12" />
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
                className={cn(TITLE_CLASS, "hover:bg-layer-2 focus:border-accent-strong focus:bg-surface-1 focus:outline-none")}
              />
            ) : (
              <h2 className={cn(TITLE_CLASS, "flex items-center truncate")}>{detail.title}</h2>
            )}
          </div>

          {/* 状态药丸 · 竖线 · 退回 · 主动作。按钮是 Plane 标准按钮 lg 档（28px） */}
          <div className="flex h-9 shrink-0 items-center gap-2">
            <StageReviewStatusBadge status={detail.status} size="md" />
            {hasActions && (
              <>
                <span className="mx-1 h-4.5 border-l border-subtle" aria-hidden />
                {previousStatus && (
                  <GuardedAction guard={guard.rollback} text={blockedText(t, "rollback", guard.rollback)}>
                    <Button
                      variant="secondary"
                      size="lg"
                      prependIcon={<Undo2 />}
                      disabled={isMutating || !guard.rollback.allowed}
                      onClick={onRollback}
                    >
                      {t(`${I18N}.actions.rollback_plain`)}
                    </Button>
                  </GuardedAction>
                )}
                {detail.status === EStageReviewStatus.NOT_STARTED && (
                  <GuardedAction guard={guard.advance} text={advanceBlockedText}>
                    <Button
                      variant="primary"
                      size="lg"
                      prependIcon={<Play />}
                      disabled={isMutating || !guard.advance.allowed}
                      onClick={onStart}
                    >
                      {t(`${I18N}.actions.start`)}
                    </Button>
                  </GuardedAction>
                )}
                {detail.status === EStageReviewStatus.IN_REVIEW && (
                  <GuardedAction guard={guard.advance} text={advanceBlockedText}>
                    <Button
                      variant="primary"
                      size="lg"
                      prependIcon={<Send />}
                      disabled={isMutating || !guard.advance.allowed}
                      onClick={onOpenSubmit}
                    >
                      {t(`${I18N}.actions.submit_for_approval`)}
                    </Button>
                  </GuardedAction>
                )}
                {detail.status === EStageReviewStatus.IN_APPROVAL && (
                  <GuardedAction guard={guard.advance} text={advanceBlockedText}>
                    <Button
                      variant="primary"
                      size="lg"
                      prependIcon={<Check />}
                      disabled={isMutating || !guard.advance.allowed}
                      onClick={onApprove}
                    >
                      {t(`${I18N}.actions.approve`)}
                    </Button>
                  </GuardedAction>
                )}
              </>
            )}
          </div>
        </div>

        <StageReviewStepper status={detail.status} result={detail.result} hints={stepHints} />
      </div>

      {/* 身：正文与属性栏各自滚动 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="stage-review-drawer-body flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-7 pt-5 pb-8">
          <StageReviewContent
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            detail={detail}
            editable={editable}
            onUpdate={onUpdate}
          />

          <StageReviewAttachments
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            attachments={attachments}
            editable={editable}
            isMutating={isMutating}
            onUpload={onUpload}
            onDownload={onDownload}
            onDelete={onDeleteAttachment}
            getFileURL={getAttachmentUrl}
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
    </>
  );
};
