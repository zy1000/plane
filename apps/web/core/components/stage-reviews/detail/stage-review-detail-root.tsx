import { useCallback, useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, MoveDiagonal, MoveRight, Paperclip, Play, Plus, Send, Undo2 } from "lucide-react";
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
  TStageReviewRowPayload,
  TStageReviewRowTable,
  TSubmitStageReviewPayload,
  TUpdateStageReviewPayload,
} from "@plane/types";
import { EStageReviewKind, EStageReviewResult, EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { Breadcrumbs, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { stageReviewDetailPath, stageReviewsPath } from "@/components/reviews/routes";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import useKeypress from "@/hooks/use-keypress";
import { getStageReviewError } from "@/hooks/store/use-stage-reviews";
import type { TStageReviewSaveState } from "@/hooks/store/use-stage-review-detail";
import { useStageReviewDetail } from "@/hooks/store/use-stage-review-detail";
import { ApproveStageReviewModal } from "../approve-review-modal";
import {
  STAGE_REVIEW_DETAIL_HEADER_ACTIONS_ID,
  STAGE_REVIEW_DETAIL_HEADER_TITLE_ID,
  useStageReviewHeaderSlot,
} from "../header-slots";
import { RollbackStageReviewModal } from "../rollback-review-modal";
import { SubmitStageReviewModal } from "../submit-review-modal";
import type { TStageReviewActionGuard } from "./stage-review-action-guard";
import { getStageReviewActionGuard } from "./stage-review-action-guard";
import type { TStageReviewAttachmentDrop } from "./stage-review-attachments";
import { StageReviewAttachments, useStageReviewAttachmentDrop } from "./stage-review-attachments";
import { StageReviewChildren } from "./stage-review-children";
import type { TStageReviewSupplement } from "./stage-review-content";
import { StageReviewContent, isBlankRichText } from "./stage-review-content";
import type { TStageReviewPeekMode } from "./stage-review-peek-mode";
import { StageReviewPeekModeSelect } from "./stage-review-peek-mode";
import { StageReviewSaveStatus } from "./stage-review-save-status";
import { StageReviewRowTables, useStageReviewRowAdd } from "./stage-review-row-tables";
import { StageReviewSidebar } from "./stage-review-sidebar";
import { StageReviewStepper, useStepDates } from "./stage-review-stepper";
import { StageReviewTimeline } from "./stage-review-timeline";

const I18N = "stage_review";

/** 标题：编辑态与只读态同一个盒子，切换时不跳；悬停出浅底，聚焦才出蓝边 —— 与右栏就地编辑格同一口径 */
const TITLE_CLASS =
  "-mx-2 h-9 min-w-0 rounded-md border border-transparent px-2 text-20 leading-snug font-semibold text-primary";

/** 头一行的图标按钮（关闭 / 在新页面中打开），28px 方块 */
const HEAD_ICON_CLASS =
  "grid size-7 place-items-center rounded-md text-tertiary transition hover:bg-layer-2 hover:text-secondary";

/** 独立详情页的地址；抽屉里「在新页面中打开」与产品页「在项目中打开」都指到这里 */
export const getStageReviewDetailPath = (workspaceSlug: string, projectId: string, reviewId: string) =>
  stageReviewDetailPath(workspaceSlug, projectId, reviewId);

/** 退回之后落到哪一步。已评审是终态，没有上一步可退（与后端 rollback 一致） */
const previousStatusOf = (detail: TStageReviewDetail) =>
  detail.status === EStageReviewStatus.COMPLETED
    ? undefined
    : STAGE_REVIEW_STATUS_ORDER[STAGE_REVIEW_STATUS_ORDER.indexOf(detail.status) - 1];

/**
 * 评审活动的标题多半是「父评审名-活动名」。标题前已经有「父评审 /」，标题再带一遍是重复，
 * 所以抽屉里只显示、只编辑后半截；存的时候把前缀原样拼回去，列表与裁剪表里的全名不变。
 */
const titlePrefixOf = (detail: TStageReviewDetail) => {
  const prefix = detail.parent_title ? `${detail.parent_title}-` : "";
  return prefix && detail.title.startsWith(prefix) && detail.title.length > prefix.length ? prefix : "";
};

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

/** 「补充」条上一个按钮：虚线描边，读作「这里还能加东西」，与已有内容的区块区分开 */
const SUPPLEMENT_BUTTON_CLASS =
  "inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-strong bg-surface-1 pr-2.5 pl-2 text-13 text-secondary transition hover:border-accent-strong hover:text-accent-primary disabled:opacity-50";

/**
 * 正文顶部的「补充」条：还空着的描述 / 工作指引 / 成品 / 组件版本 / 附件收成一排按钮，
 * 点了才展开成区块。还没有附件时，这条也是附件的拖放落点。全都有内容了就不出。
 */
const SupplementBar = ({
  items,
  drop,
  disabled,
}: {
  items: { key: TStageReviewSupplement; label: string; onClick: () => void }[];
  /** 还没有附件时才传：整条接住拖进来的文件 */
  drop?: TStageReviewAttachmentDrop;
  disabled: boolean;
}) => {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div
      {...drop?.getRootProps()}
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-lg border border-subtle bg-layer-1 px-3 py-2.5 transition",
        drop?.isDragActive && "border-dashed border-accent-strong bg-accent-subtle"
      )}
    >
      {drop && <input {...drop.getInputProps()} />}
      <span className="mr-1 text-12 text-placeholder">{t(`${I18N}.detail.supplement`)}</span>
      {items.map((item) => (
        <button key={item.key} type="button" disabled={disabled} onClick={item.onClick} className={SUPPLEMENT_BUTTON_CLASS}>
          <Plus className="size-3.5 text-placeholder" />
          {item.label}
        </button>
      ))}
      {drop && (
        <span className="ml-auto flex items-center gap-1 text-12 text-placeholder">
          <Paperclip className="size-3.25" />
          {t(`${I18N}.detail.supplement_drop`)}
        </span>
      )}
    </div>
  );
};

/**
 * 抽屉里的一套：头一行有关闭、模式切换、「在新页面中打开」，面包屑放在头一行里。
 * 独立页那一套：没有头一行，标题与保存状态 portal 到路由顶栏的挂点上。
 */
export type TStageReviewDetailVariant =
  | {
      variant: "drawer";
      peekMode: TStageReviewPeekMode;
      onPeekModeChange: (mode: TStageReviewPeekMode) => void;
      onClose: () => void;
    }
  | { variant: "page" };

export type TStageReviewDetailRootProps = TStageReviewDetailVariant & {
  workspaceSlug: string;
  workspaceId: string;
  /** 永远是**这条评审自己的项目**：产品页里一屏评审横跨多个项目，所有读写都要打到评审所在项目的端点上 */
  projectId: string;
  reviewId: string | null;
  canManage: boolean;
  /** 推进 / 退回只认负责人、审核者本人，按钮要拿它判断能不能点 */
  currentUserId: string | undefined;
  /** 产品页用：面包屑第一段换成项目名，右侧多一个「在项目中打开」 */
  showProjectCrumb?: boolean;
  /** 写入成功后同步给列表；独立页没有列表可同步 */
  onUpdated?: (review: TStageReview) => void;
  /** 在父评审与评审活动之间走动：抽屉里换抽屉内容；不传（独立页）就跳那一条的独立页 */
  onOpenReview?: (reviewId: string) => void;
};

/**
 * 评审详情本体。**评审与评审活动共用这一套** —— 两者字段几乎一样，只有层级不同。抽屉
 * （`StageReviewDrawer`）与独立详情页（`/reviews/stage-reviews/:reviewId`）都是它，只差外壳。
 *
 * 布局分两段：头（名片式标题区 + 动作按钮 / 四段进度）、身（正文 + 右侧属性栏）。
 * 正文放「要读的」（描述、工作指引、附件、活动），右栏放「要查的」（产品、阶段、负责人、日期、
 * 结论、O 阶段那两组）。**动作按钮住在标题行右侧**；状态只由下面的四段进度表达，不再另出药丸。
 * 正文里空着的几项不占区块，收进顶部的「补充」条。
 *
 * 写入分两种回执：开始 / 提交 / 审核 / 退回 是动作，成功弹 toast；改字段、传删附件、发评论是
 * 随手改，只在顶栏显示保存状态，失败才弹 toast —— 右下角的 toast 不该每改一个字段就冒一次。
 */
export const StageReviewDetailRoot = (props: TStageReviewDetailRootProps) => {
  const { workspaceSlug, workspaceId, projectId, reviewId, canManage, currentUserId, showProjectCrumb = false, onUpdated } =
    props;
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
    error,
    saveState,
    retryLastSave,
    updateReview,
    createRow,
    updateRow,
    deleteRow,
    advance,
    rollback,
    uploadAttachment,
    deleteAttachment,
    downloadAttachment,
    getAttachmentUrl,
    createComment,
    deleteComment,
  } = useStageReviewDetail(workspaceSlug, projectId, reviewId);

  // 换一条评审、或标题存完回灌时跟上。评审活动的「父评审名-」前缀不进输入框（见 titlePrefixOf）
  useEffect(() => {
    setTitleDraft(detail ? detail.title.slice(titlePrefixOf(detail).length) : "");
  }, [detail?.id, detail?.title]);

  const isDrawer = props.variant === "drawer";
  const onClose = isDrawer ? props.onClose : undefined;
  useKeypress("Escape", () => {
    if (onClose && reviewId && !isSubmitOpen && !isApproveOpen) onClose();
  });

  /** 领域错误码有中文文案，其余回落到服务端原文 */
  const toastError = (err: unknown) => {
    const { message, code } = getStageReviewError(err);
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
      if (next) onUpdated?.(next);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.${successKey}`) });
      return next;
    } catch (err) {
      toastError(err);
      return undefined;
    }
  };

  /** 随手改：成功只看顶栏保存状态（hook 维护），失败才弹 toast */
  const runSave = async <T,>(save: () => Promise<T>) => {
    try {
      return await save();
    } catch (err) {
      toastError(err);
      return undefined;
    }
  };

  const handleUpdate = (payload: TUpdateStageReviewPayload) =>
    void runSave(async () => {
      const next = await updateReview(payload);
      if (next) onUpdated?.(next);
    });

  /** 表格行的增删改：同样是随手改。行不在列表里，不用回灌列表 */
  const handleCreateRow = (table: TStageReviewRowTable) => runSave(() => createRow(table));
  const handleUpdateRow = <T extends TStageReviewRowTable>(table: T, rowId: string, payload: TStageReviewRowPayload[T]) =>
    void runSave(() => updateRow(table, rowId, payload));
  const handleDeleteRow = (table: TStageReviewRowTable, rowId: string) => void runSave(() => deleteRow(table, rowId));

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

  if (!isDrawer && error && !detail) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-14 font-medium text-primary">{t(`${I18N}.error_title`)}</p>
          <p className="mt-1 text-12 text-tertiary">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading || !detail) {
    return (
      <Loader className="space-y-3 p-6">
        <Loader.Item height="28px" />
        <Loader.Item height="44px" />
        <Loader.Item height="320px" />
      </Loader>
    );
  }

  return (
    <>
      <DetailBody
        {...props}
        detail={detail}
        attachments={attachments}
        comments={comments}
        activities={activities}
        isMutating={isMutating}
        saveState={saveState}
        titleDraft={titleDraft}
        setTitleDraft={setTitleDraft}
        onRetrySave={() => void runSave(retryLastSave)}
        onUpdate={handleUpdate}
        onCreateRow={handleCreateRow}
        onUpdateRow={handleUpdateRow}
        onDeleteRow={handleDeleteRow}
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
  );
};

type DetailBodyProps = TStageReviewDetailRootProps & {
  detail: TStageReviewDetail;
  attachments: TStageReviewAttachment[];
  comments: TStageReviewComment[];
  activities: TStageReviewActivity[];
  isMutating: boolean;
  saveState: TStageReviewSaveState;
  titleDraft: string;
  setTitleDraft: (next: string) => void;
  onRetrySave: () => void;
  onUpdate: (payload: TUpdateStageReviewPayload) => void;
  onCreateRow: (table: TStageReviewRowTable) => Promise<TStageReviewDetail | undefined>;
  onUpdateRow: <T extends TStageReviewRowTable>(table: T, rowId: string, payload: TStageReviewRowPayload[T]) => void;
  onDeleteRow: (table: TStageReviewRowTable, rowId: string) => void;
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

/** 有数据之后的整个内容；拆出来是为了让 hooks（进度提示）拿到非空的 detail */
const DetailBody = (props: DetailBodyProps) => {
  const {
    workspaceSlug,
    workspaceId,
    projectId,
    detail,
    attachments,
    comments,
    activities,
    canManage,
    currentUserId,
    showProjectCrumb = false,
    onOpenReview,
    isMutating,
    saveState,
    titleDraft,
    setTitleDraft,
    onRetrySave,
    onUpdate,
    onCreateRow,
    onUpdateRow,
    onDeleteRow,
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
  } = props;
  const { t } = useTranslation();
  const stepDates = useStepDates(detail, activities);
  const guard = getStageReviewActionGuard(detail, currentUserId);
  const advanceBlockedText = blockedText(t, "advance", guard.advance);
  // 独立页：标题与保存状态挂到路由顶栏；抽屉里这两个挂点不存在，拿到的是 null
  const titleHost = useStageReviewHeaderSlot(STAGE_REVIEW_DETAIL_HEADER_TITLE_ID);
  const actionsHost = useStageReviewHeaderSlot(STAGE_REVIEW_DETAIL_HEADER_ACTIONS_ID);

  const isCompleted = detail.status === EStageReviewStatus.COMPLETED;
  const previousStatus = previousStatusOf(detail);
  // 已评审即定稿：字段与附件都改不了也退不回，要重做去裁剪表取消勾选后重新生成
  const editable = canManage && !isCompleted;
  const hasActions = canManage && !isCompleted;
  const titlePrefix = titlePrefixOf(detail);
  const shownTitle = detail.title.slice(titlePrefix.length);
  const isOStageReview = detail.kind === EStageReviewKind.O_STAGE_REVIEW;

  // 从「补充」条点开、还没写东西的几项；换一条评审就清掉
  const [requested, setRequested] = useState<ReadonlySet<TStageReviewSupplement>>(new Set());
  useEffect(() => setRequested(new Set()), [detail.id]);
  const request = (key: TStageReviewSupplement) => setRequested((prev) => new Set(prev).add(key));
  const dismiss = useCallback(
    (key: TStageReviewSupplement) =>
      setRequested((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      }),
    []
  );
  const { focusRowId, addRow } = useStageReviewRowAdd(detail, onCreateRow);
  const attachmentDrop = useStageReviewAttachmentDrop({ editable, isMutating, onUpload });
  const hasAttachments = attachments.length > 0 || Boolean(attachmentDrop.upload);

  const supplements = editable
    ? [
        {
          key: "description" as const,
          label: t(`${I18N}.fields.description`),
          isEmpty: isBlankRichText(detail.description_html) && !requested.has("description"),
          onClick: () => request("description"),
        },
        {
          key: "work_instruction" as const,
          label: t(`${I18N}.fields.work_instruction`),
          isEmpty: !detail.work_instruction.trim() && !requested.has("work_instruction"),
          onClick: () => request("work_instruction"),
        },
        {
          key: "finished_goods" as const,
          label: t(`${I18N}.detail.finished_goods`),
          isEmpty: isOStageReview && detail.finished_goods.length === 0,
          onClick: () => addRow("finished_goods"),
        },
        {
          key: "component_versions" as const,
          label: t(`${I18N}.detail.component_versions`),
          isEmpty: isOStageReview && detail.component_versions.length === 0,
          onClick: () => addRow("component_versions"),
        },
        {
          key: "attachments" as const,
          label: t(`${I18N}.detail.attachments_title`),
          isEmpty: !hasAttachments,
          onClick: attachmentDrop.open,
        },
      ].filter((item) => item.isEmpty)
    : [];
  const getReviewPath = (reviewId: string) => getStageReviewDetailPath(workspaceSlug, detail.project_id, reviewId);
  const detailPath = getReviewPath(detail.id);
  /** 抽屉里就地换内容；带修饰键的点击留给浏览器开新标签 */
  const handleOpenParent = (event: MouseEvent) => {
    if (!onOpenReview || !detail.parent_id || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onOpenReview(detail.parent_id);
  };

  return (
    <>
      {props.variant === "drawer" ? (
        /* 头一行：关闭 / 模式切换 / 在新页面中打开 在最左，与工作项 peek 一致。右侧是保存状态 */
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-subtle px-2.5 text-13 text-tertiary">
          <button type="button" onClick={props.onClose} aria-label={t(`${I18N}.actions.close`)} className={HEAD_ICON_CLASS}>
            <MoveRight className="size-4" />
          </button>
          <Tooltip tooltipContent={t(`${I18N}.detail.open_full_page`)}>
            <Link to={detailPath} onClick={props.onClose} aria-label={t(`${I18N}.detail.open_full_page`)} className={HEAD_ICON_CLASS}>
              <MoveDiagonal className="size-4" />
            </Link>
          </Tooltip>
          <StageReviewPeekModeSelect mode={props.peekMode} onChange={props.onPeekModeChange} />
          <span className="ml-auto flex shrink-0 items-center gap-1 pl-3">
            <StageReviewSaveStatus state={saveState} onRetry={onRetrySave} />
            {showProjectCrumb && (
              <Link
                to={`${stageReviewsPath(workspaceSlug, detail.project_id)}?review=${detail.id}`}
                className="inline-flex h-6.5 items-center gap-1.5 rounded-md px-2 text-13 text-tertiary transition hover:bg-layer-2 hover:text-secondary"
              >
                <ExternalLink className="size-3.5" />
                {t(`${I18N}.detail.open_in_project`)}
              </Link>
            )}
          </span>
        </div>
      ) : (
        <>
          {titleHost &&
            createPortal(
              <>
                <Breadcrumbs.Separator />
                <Breadcrumbs.ItemWrapper type="text" isLast label={detail.title}>
                  <Breadcrumbs.Label className="max-w-[320px]">{detail.title}</Breadcrumbs.Label>
                </Breadcrumbs.ItemWrapper>
              </>,
              titleHost
            )}
          {actionsHost && createPortal(<StageReviewSaveStatus state={saveState} onRetry={onRetrySave} />, actionsHost)}
        </>
      )}

      {/* 标题行：（所属评审 /）标题 + 类型 ｜ 四步进度 ｜ 退回 · 主动作。抽屉窄时进度与按钮整体换到下一行 */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-subtle px-7 py-4">
        <div className="flex min-w-[240px] flex-1 items-center gap-2.5">
          {detail.parent_id && detail.parent_title && (
            /* 评审活动：所属评审可以点，回到父评审 */
            <>
              <Tooltip tooltipContent={t(`${I18N}.detail.back_to_parent`)}>
                <Link
                  to={getReviewPath(detail.parent_id)}
                  onClick={handleOpenParent}
                  className="max-w-[45%] min-w-0 truncate text-14 text-tertiary transition hover:text-accent-primary"
                >
                  {detail.parent_title}
                </Link>
              </Tooltip>
              <span className="shrink-0 text-14 text-placeholder">/</span>
            </>
          )}
          {editable ? (
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                const next = titleDraft.trim();
                // 标题不允许清空：清了列表里就只剩一行空白
                if (!next) setTitleDraft(shownTitle);
                else if (next !== shownTitle) onUpdate({ title: titlePrefix + next });
              }}
              className={cn(
                TITLE_CLASS,
                // 宽度跟着字走，类型标签才能紧贴标题
                "max-w-full field-sizing-content hover:bg-layer-2 focus:border-accent-strong focus:bg-surface-1 focus:outline-none"
              )}
            />
          ) : (
            <h2 className={cn(TITLE_CLASS, "flex items-center truncate")}>{shownTitle}</h2>
          )}
          <StageReviewKindBadge kind={detail.kind} className="shrink-0 rounded-md px-2 text-12" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <StageReviewStepper detail={detail} dates={stepDates} />
          {hasActions && (
            <div className="flex h-9 shrink-0 items-center gap-2">
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
            </div>
          )}
        </div>
      </div>

      {/* 身：正文与属性栏各自滚动 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="stage-review-drawer-body flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-7 pt-5 pb-8">
          <SupplementBar items={supplements} drop={hasAttachments ? undefined : attachmentDrop} disabled={isMutating} />

          <StageReviewContent
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            detail={detail}
            editable={editable}
            onUpdate={onUpdate}
            requested={requested}
            onDismiss={dismiss}
          />

          {/* 成品与组件版本只挂在「O阶段评审」上 */}
          {isOStageReview && (
            <StageReviewRowTables
              detail={detail}
              editable={editable}
              focusRowId={focusRowId}
              onAddRow={addRow}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
            />
          )}

          <StageReviewAttachments
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            attachments={attachments}
            editable={editable}
            isMutating={isMutating}
            drop={attachmentDrop}
            onDownload={onDownload}
            onDelete={onDeleteAttachment}
            getFileURL={getAttachmentUrl}
          />

          <StageReviewChildren detail={detail} getPath={getReviewPath} onOpenReview={onOpenReview} />

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
