import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoveDiagonal, RefreshCw, Trash2, X } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRiskDetail, TUpdateRiskPayload } from "@plane/types";
import { Breadcrumbs, CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { useRiskDetail } from "@/hooks/store/use-risk-detail";
import { useAppRouter } from "@/hooks/use-app-router";
import useKeypress from "@/hooks/use-keypress";
import { RiskStatusBadge } from "../badges";
import { RISK_I18N } from "../constants";
import { DeleteRiskModal } from "../delete-risk-modal";
import { translateRiskError } from "../errors";
import { RISK_DETAIL_HEADER_ACTIONS_ID, RISK_DETAIL_HEADER_TITLE_ID } from "../header-slots";
import { RiskCodeLabel } from "../risk-code-label";
import { RiskActivity } from "./risk-activity";
import { RiskAttachments } from "./risk-attachments";
import { RiskContent } from "./risk-content";
import { RiskIssues } from "./risk-issues";
import type { TRiskPeekMode } from "./risk-peek-mode";
import { RiskPeekModeSelect } from "./risk-peek-mode";
import { MISSING_CLASS, RiskEditActions } from "./risk-detail-fields";
import { RiskSidebar } from "./risk-sidebar";
import { useRiskEditSession } from "./use-risk-edit-session";

/** 独立详情页的地址；抽屉里「在新页面中打开」、缺陷详情里点风险都指到这里 */
export const riskDetailPath = (workspaceSlug: string, projectId: string, riskId: string) =>
  `/${workspaceSlug}/projects/${projectId}/risks/${riskId}`;

/** 风险列表页：删除后独立页回这里 */
export const risksListPath = (workspaceSlug: string, projectId: string) => `/${workspaceSlug}/projects/${projectId}/risks`;

/** 标题：查看与编辑同一个盒子，切换时文字不跳；编辑时才出边框 */
const TITLE_CLASS =
  "-mx-2.5 h-10 w-[calc(100%+1.25rem)] min-w-0 rounded-md border border-transparent px-2.5 text-20 leading-snug font-semibold text-primary";

/** 头一行的图标按钮（关闭 / 在新页面中打开 / ⋯），28px 方块 */
const HEAD_ICON_CLASS =
  "grid size-7 place-items-center rounded-md text-tertiary transition hover:bg-layer-2 hover:text-secondary";

/** 挂点是 layout 渲染出来的 DOM 节点，要等挂载后才找得到；不在那个路由下（抽屉里）就是 null */
const useRiskHeaderSlot = (id: string) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById(id)), [id]);
  return host;
};

/** 顶栏左侧的「编号 · 状态」：抽屉在头一行，独立页 portal 到面包屑末尾。编号没生成 / 推送失败时显状态 */
const CodeAndStatus = ({ detail }: { detail: TRiskDetail }) => (
  <span className="flex min-w-0 items-center gap-2.5">
    <RiskCodeLabel risk={detail} className="shrink-0 text-13" />
    <RiskStatusBadge status={detail.status} />
  </span>
);

/** 「⋯」菜单：目前只有删除，仅可写成员可见 */
const MoreMenu = ({ onDelete }: { onDelete: () => void }) => {
  const { t } = useTranslation();
  return (
    <CustomMenu ellipsis closeOnSelect placement="bottom-end" buttonClassName={HEAD_ICON_CLASS} ariaLabel={t(`${RISK_I18N}.detail.more`)}>
      <CustomMenu.MenuItem onClick={onDelete}>
        <div className="flex items-center gap-2 text-danger-primary">
          <Trash2 className="size-3.5" />
          <span>{t(`${RISK_I18N}.detail.delete`)}</span>
        </div>
      </CustomMenu.MenuItem>
    </CustomMenu>
  );
};

export type TRiskDetailRootProps = {
  /** 抽屉：有头一行（编号 / 状态 / 保存状态 / 模式切换 / 关闭）；独立页：这些 portal 到路由顶栏的挂点上 */
  variant: "page" | "drawer";
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  riskId: string | null;
  /** 项目成员可写、访客只读；false 时所有字段只读、不出上传 / 关联 / 评论输入框 */
  canEdit: boolean;
  /** 评论只有作者本人能删 */
  currentUserId?: string;
  peekMode?: TRiskPeekMode;
  onPeekModeChange?: (mode: TRiskPeekMode) => void;
  onClose?: () => void;
  /** 每次保存成功后回灌给列表；独立页没有列表可同步 */
  onUpdated?: (risk: TRiskDetail) => void;
  /** 删除成功后通知调用方（列表把那一行拿掉并关抽屉）；独立页自己跳回列表 */
  onDeleted?: (riskId: string) => void;
};

/**
 * 风险详情本体。抽屉（`RiskDrawer`）与独立详情页（`/projects/:projectId/risks/:riskId`）都是它，只差外壳。
 *
 * 布局：头（抽屉才有的一行 + 标题行）、身（左栏正文 + 右栏 320px 属性卡片）。
 * 正文放「要读的」（描述、评估、应对，再接附件、关联缺陷、活动），右栏放「要查的」（状态、人、日期）。
 *
 * 字段改动走「编辑 → 取消 / 保存」会话（同工作项详情）：查看时全部只读，保存一次提交改过的字段，失败弹 toast 并留在编辑态。
 * 附件、关联缺陷、评论不进会话，照旧即时生效；删除走确认弹窗 + toast。
 */
export const RiskDetailRoot = ({
  variant,
  workspaceSlug,
  workspaceId,
  projectId,
  riskId,
  canEdit,
  currentUserId,
  peekMode = "side-peek",
  onPeekModeChange,
  onClose,
  onUpdated,
  onDeleted,
}: TRiskDetailRootProps) => {
  const { t } = useTranslation();
  const router = useAppRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const {
    detail,
    attachments,
    issues,
    comments,
    activities,
    isLoading,
    isMutating,
    error,
    updateRisk,
    resyncRisk,
    deleteRisk,
    linkIssues,
    unlinkIssue,
    uploadAttachment,
    deleteAttachment,
    downloadAttachment,
    getAttachmentUrl,
    createComment,
    deleteComment,
  } = useRiskDetail(workspaceSlug, projectId, riskId);
  const isDrawer = variant === "drawer";
  // 独立页：编号与保存状态挂到路由顶栏；抽屉里这两个挂点不存在，拿到的是 null
  const titleHost = useRiskHeaderSlot(RISK_DETAIL_HEADER_TITLE_ID);
  const actionsHost = useRiskHeaderSlot(RISK_DETAIL_HEADER_ACTIONS_ID);

  // 关联 / 解除缺陷只改了这里的 issue_count，列表那一行的计数也要跟上（字段保存走 handleUpdate 回传）
  const issueCountRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!detail) {
      issueCountRef.current = undefined;
      return;
    }
    if (issueCountRef.current !== undefined && issueCountRef.current !== detail.issue_count) onUpdated?.(detail);
    issueCountRef.current = detail.issue_count;
  }, [detail, onUpdated]);

  useKeypress("Escape", () => {
    if (isDrawer && onClose && riskId && !isDeleteOpen) onClose();
  });

  /** 领域错误码有中文文案（risk.errors.<code>），其余回落到服务端原文 */
  const toastError = (err: unknown) =>
    setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: translateRiskError(t, err) });

  /** 写入失败统一弹 toast，返回 undefined */
  const runSave = async <T,>(save: () => Promise<T>) => {
    try {
      return await save();
    } catch (err) {
      toastError(err);
      return undefined;
    }
  };

  /** 返回保存后的详情（失败是 undefined，已弹 toast）：编辑会话据此决定退不退出编辑 */
  const handleUpdate = (payload: TUpdateRiskPayload) =>
    runSave(async () => {
      const next = await updateRisk(payload);
      if (next) onUpdated?.(next);
      return next;
    });

  const session = useRiskEditSession(detail, handleUpdate);

  const handleSaveEdit = async () => {
    if ((await session.save()) === "invalid") {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${RISK_I18N}.detail.required_missing`) });
    }
  };

  /** 推简道云失败后重新排队；成功只是「已排队」，结果等后台任务回填 */
  const handleResync = () =>
    void runSave(async () => {
      const next = await resyncRisk();
      if (next) setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${RISK_I18N}.sync.resync_started`) });
      return next;
    });

  const handleDelete = async () => {
    if (!riskId) return;
    try {
      await deleteRisk();
      setIsDeleteOpen(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${RISK_I18N}.detail.delete_success`) });
      onDeleted?.(riskId);
      if (!isDrawer) router.push(risksListPath(workspaceSlug, projectId));
    } catch (err) {
      toastError(err);
    }
  };

  // 抽屉关着（riskId 为空）时什么都不画，外壳的 Transition 已经把面板收起
  if (!riskId) return null;

  if (error && !detail) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-14 font-medium text-primary">{t(`${RISK_I18N}.detail.not_found`)}</p>
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

  const detailPath = riskDetailPath(workspaceSlug, projectId, detail.id);
  const editActions = canEdit && <RiskEditActions session={session} onSave={() => void handleSaveEdit()} />;
  const moreMenu = canEdit && <MoreMenu onDelete={() => setIsDeleteOpen(true)} />;
  // 推送失败才出「重新同步」；原因在编号的悬停提示里
  const resyncButton = canEdit && detail.sync_status === "failed" && (
    <button
      type="button"
      onClick={handleResync}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-danger-strong px-2 text-12 font-medium text-danger-primary transition hover:bg-danger-subtle"
    >
      <RefreshCw className="size-3.5" aria-hidden="true" />
      {t(`${RISK_I18N}.sync.resync`)}
    </button>
  );

  return (
    <>
      {isDrawer ? (
        /* 头一行：编号 · 状态 在左；编辑（取消 / 保存）· 模式切换 / 在新页面中打开 / ⋯ / 关闭 在右 */
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-subtle px-4 text-13 text-tertiary">
          <CodeAndStatus detail={detail} />
          {resyncButton && <span className="ml-2">{resyncButton}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1 pl-3">
            {editActions && <span className="mr-2 flex">{editActions}</span>}
            {onPeekModeChange && <RiskPeekModeSelect mode={peekMode} onChange={onPeekModeChange} />}
            <Tooltip tooltipContent={t(`${RISK_I18N}.detail.open_in_page`)}>
              <Link to={detailPath} onClick={onClose} aria-label={t(`${RISK_I18N}.detail.open_in_page`)} className={HEAD_ICON_CLASS}>
                <MoveDiagonal className="size-4" />
              </Link>
            </Tooltip>
            {moreMenu}
            <button type="button" onClick={onClose} aria-label={t(`${RISK_I18N}.detail.close`)} className={HEAD_ICON_CLASS}>
              <X className="size-4" />
            </button>
          </span>
        </div>
      ) : (
        <>
          {titleHost &&
            createPortal(
              <>
                <Breadcrumbs.Separator />
                <Breadcrumbs.ItemWrapper type="text" isLast label={[detail.code, detail.name].filter(Boolean).join(" ")}>
                  <CodeAndStatus detail={detail} />
                </Breadcrumbs.ItemWrapper>
              </>,
              titleHost
            )}
          {actionsHost &&
            createPortal(
              <>
                {resyncButton}
                {editActions}
                {moreMenu}
              </>,
              actionsHost
            )}
        </>
      )}

      {/* 标题行：20px 加粗；点「编辑」后才变输入框，清空了保存时标红拦下 */}
      <div className="flex shrink-0 items-center border-b border-subtle px-7 py-4">
        {session.isEditing && session.value ? (
          <input
            value={session.value.name}
            onChange={(event) => session.patch({ name: event.target.value })}
            aria-label={t(`${RISK_I18N}.form.name_placeholder`)}
            className={cn(
              TITLE_CLASS,
              "border-subtle-1 bg-layer-2 hover:border-strong focus:border-accent-strong focus:outline-none",
              session.isMissing("name") && MISSING_CLASS
            )}
          />
        ) : (
          <h2 className={cn(TITLE_CLASS, "flex items-center truncate")}>{detail.name}</h2>
        )}
      </div>

      {/* 身：正文与属性栏各自滚动。stage-review-drawer-body 借的是 globals.css 里把编辑器正文压到 14px 的那条规则 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="stage-review-drawer-body flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-7 pt-5 pb-8">
          <RiskContent session={session} />

          {/* 附件 / 关联缺陷 / 活动：各段之间一条分隔线，标题同一档（13 号加粗） */}
          <div className="flex flex-col">
            <div className="border-t border-subtle pt-2 pb-4">
              <RiskAttachments
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                attachments={attachments}
                editable={canEdit}
                onUpload={(file, onProgress) => runSave(() => uploadAttachment(file, onProgress))}
                onDownload={(assetId) => void downloadAttachment(assetId)}
                onDelete={(assetId) => runSave(() => deleteAttachment(assetId))}
                getFileURL={getAttachmentUrl}
              />
            </div>

            <div className="border-t border-subtle pt-2 pb-4">
              <RiskIssues
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issues={issues}
                editable={canEdit}
                // 关联失败要把错误抛回去：选缺陷的弹窗靠它判断要不要关、保不保留勾选
                onLink={async (issueIds) => {
                  try {
                    await linkIssues(issueIds);
                  } catch (err) {
                    toastError(err);
                    throw err;
                  }
                }}
                onUnlink={(issueId) => void runSave(() => unlinkIssue(issueId))}
              />
            </div>

            <div className="border-t border-subtle pt-4">
              <RiskActivity
                riskId={detail.id}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                projectId={projectId}
                issues={issues}
                comments={comments}
                activities={activities}
                editable={canEdit}
                isMutating={isMutating}
                currentUserId={currentUserId}
                onCreateComment={(commentHtml) => runSave(() => createComment(commentHtml))}
                onDeleteComment={(commentId) => void runSave(() => deleteComment(commentId))}
              />
            </div>
          </div>
        </div>

        <RiskSidebar projectId={projectId} detail={detail} session={session} />
      </div>

      <DeleteRiskModal
        isOpen={isDeleteOpen}
        risk={detail}
        isSubmitting={isMutating}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </>
  );
};
