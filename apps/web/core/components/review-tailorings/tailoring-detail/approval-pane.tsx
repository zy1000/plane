import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { ArrowUpRight, Check, CheckCircle2, CircleDashed, CircleDot, Clock3, Eye, RotateCcw, Scissors, Trash2, X, XCircle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TReviewTailoringApproval, TReviewTailoringApprovalAction, TReviewTailoringItem } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { Avatar, Loader } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { TReviewTailoringDetailStore } from "@/hooks/store/use-review-tailoring-detail";
import { getTailoringError } from "@/hooks/store/use-review-tailorings";
import { useUser } from "@/hooks/store/user";
import { formatUpdatedAt } from "../list/tailoring-row";
import { useReviewTailoringPermissions } from "../permissions";
import { ReviewTailoringStatusBadge } from "../status-badge";
import { ApprovalChanges } from "./approval-changes";
import { TabBarSegments } from "./detail-tab-bar";
import { getTailoringStats, isCompletedCut } from "./tailoring-matrix-model";

const I18N = "review_tailoring.approval";

// 摘要句里的数字加粗：翻译时先用控制字符包住数值，渲染时再切开
const MARK_OPEN = "\u0001";
const MARK_CLOSE = "\u0002";
const mark = (value: number) => `${MARK_OPEN}${value}${MARK_CLOSE}`;

const Emphasized = ({ text, tones }: { text: string; tones: string[] }) => {
  let index = 0;
  return (
    <>
      {text.split(new RegExp(`${MARK_OPEN}(.*?)${MARK_CLOSE}`)).map((part, i) =>
        i % 2 === 1 ? (
          <b key={i} className={cn("font-semibold tabular-nums", tones[index++] ?? "text-primary")}>
            {part}
          </b>
        ) : (
          part
        )
      )}
    </>
  );
};

const SectionTitle = ({ title, count }: { title: string; count: number }) => (
  <div className="mt-6 mb-2.5 flex items-center gap-1.5 text-13 font-semibold text-secondary">
    {title}
    <span className="font-medium text-tertiary tabular-nums">{count}</span>
  </div>
);

/** 裁剪 / 删除明细的一行：评审名 · 阶段 ·（多产品时）产品 · 说明 */
const DetailRow = ({
  icon,
  title,
  stage,
  product,
  note,
  noteClassName,
}: {
  icon: ReactNode;
  title: string;
  stage: string;
  product?: string;
  note: string;
  noteClassName?: string;
}) => (
  <div
    className={cn(
      "grid h-11 items-center gap-3 border-b border-subtle text-13",
      product !== undefined
        ? "grid-cols-[minmax(0,200px)_96px_112px_minmax(0,1fr)]"
        : "grid-cols-[minmax(0,210px)_96px_minmax(0,1fr)]"
    )}
  >
    <span className="flex min-w-0 items-center gap-2 text-14 text-primary [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="truncate" title={title}>
        {title}
      </span>
    </span>
    <span className="truncate text-tertiary">{stage}</span>
    {product !== undefined && <span className="truncate text-tertiary">{product}</span>}
    <span className={cn("truncate text-secondary", noteClassName)} title={note}>
      {note}
    </span>
  </div>
);

const PropRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex h-9 items-center text-13">
    <span className="w-21 shrink-0 text-tertiary">{label}</span>
    <span className="flex min-w-0 items-center gap-1.5 text-primary">{children}</span>
  </div>
);

type TItemTab = "cut" | "kept";

const byMatrixOrder = (a: TReviewTailoringItem, b: TReviewTailoringItem) =>
  a.stage_sort_order - b.stage_sort_order || a.template_sort_order - b.template_sort_order;

/**
 * 签批内容区，照工作项详情的样子：中间是「签什么」（摘要句 + 裁剪明细 + 要删的评审），
 * 右边属性栏是提交人、规则和签批人，底部一条签批条。
 *
 * 详情页的签批弹窗和列表页的签批收件箱共用这一份，收件箱在左边再加一列清单。
 * 底部按身份分派：本轮还没表态的签批人写意见、点通过或驳回直接提交；表过态的看到自己的结论；
 * 提交人可以撤回 —— 但提交人自己也在签批人里且还没签时不给撤回（想撤回就自己驳回）；其他人只能看。
 */
export const ReviewTailoringApprovalPane = observer(function ReviewTailoringApprovalPane({
  workspaceSlug,
  projectId,
  store,
  onOpenTailoring,
  onClose,
  onDone,
}: {
  workspaceSlug: string;
  projectId: string;
  store: TReviewTailoringDetailStore;
  onOpenTailoring?: () => void;
  onClose?: () => void;
  onDone?: (result: TReviewTailoringApprovalAction | "withdrawn") => void;
}) {
  const { t, currentLocale } = useTranslation();
  const { data: currentUser } = useUser();
  const { canManage } = useReviewTailoringPermissions(workspaceSlug, projectId);
  const { detail, items, isLoading, isMutating } = store;
  const [comment, setComment] = useState("");
  const [itemTab, setItemTab] = useState<TItemTab>("cut");
  const stats = useMemo(() => getTailoringStats(items), [items]);
  const cutItems = useMemo(() => items.filter((item) => !item.selected).sort(byMatrixOrder), [items]);
  const keptItems = useMemo(() => items.filter((item) => item.selected).sort(byMatrixOrder), [items]);
  const deletedItems = useMemo(() => cutItems.filter((item) => item.stage_review_id), [cutItems]);

  useEffect(() => {
    setComment("");
  }, [detail?.id]);

  // 默认先看裁剪的（签批人最该看的是「不做什么、为什么」）；一项没裁就直接看保留的，不留空白
  const hasCut = cutItems.length > 0;
  useEffect(() => {
    setItemTab(hasCut ? "cut" : "kept");
  }, [detail?.id, hasCut]);

  if (isLoading || !detail) {
    return (
      <Loader className="flex-1 space-y-3 p-8">
        <Loader.Item height="28px" width="50%" />
        <Loader.Item height="20px" width="70%" />
        <Loader.Item height="220px" />
      </Loader>
    );
  }

  const isPending = detail.status === EReviewTailoringStatus.PENDING;
  const myApproval = detail.approvals.find((approval) => approval.approver === currentUser?.id);
  const canAct = isPending && Boolean(myApproval && !myApproval.action);
  const isSubmitter = Boolean(currentUser && detail.submitted_by_detail?.id === currentUser.id);
  const canWithdraw = isPending && isSubmitter && canManage && !canAct;
  const approvedCount = detail.approvals.filter((approval) => approval.action === "approved").length;
  const submitter = detail.submitted_by_detail;
  const productNames = detail.products.length > 1 ? new Map(detail.products.map((p) => [p.id, p.name])) : null;
  const rule =
    detail.approval_type === "all"
      ? t(`${I18N}.rule_all`)
      : detail.approval_type === "n_of_m"
        ? t(`${I18N}.rule_n_of_m`, { count: detail.required_count ?? 1 })
        : t(`${I18N}.rule_any`);
  const remaining =
    detail.approval_type === "all"
      ? detail.approvals.length - approvedCount
      : detail.approval_type === "n_of_m"
        ? Math.max((detail.required_count ?? 1) - approvedCount, 0)
        : 0;
  const kindLabel = [t(`review_tailoring.kind.${detail.tailoring_kind}`), detail.stage_label].filter(Boolean).join(" · ");

  const translateError = (requestError: unknown) => {
    const { message, code } = getTailoringError(requestError);
    return code ? t(`review_tailoring.errors.${code}`, { defaultValue: message }) : message;
  };

  const act = async (decision: TReviewTailoringApprovalAction) => {
    try {
      const next = await store.act({ action: decision, comment: comment.trim() || undefined });
      // 通过但还没达到规则时表不会生效，不能说「已生效」
      const toastKey =
        decision === "rejected"
          ? "rejected"
          : next?.status === EReviewTailoringStatus.APPROVED
            ? "approved"
            : "approval_recorded";
      const skipped = next?.apply_result?.skipped.length ?? 0;
      // 部分成功：已评审的活动没挪，当场告诉签批人（详情页横幅也会列出来）
      setToast(
        skipped > 0
          ? {
              type: TOAST_TYPE.WARNING,
              title: t("review_tailoring.toast.approved_with_skipped", { count: skipped }),
            }
          : { type: TOAST_TYPE.SUCCESS, title: t(`review_tailoring.toast.${toastKey}`) }
      );
      onDone?.(decision);
    } catch (requestError) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("review_tailoring.toast.failed"), message: translateError(requestError) });
    }
  };

  const withdraw = async () => {
    try {
      await store.withdraw();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("review_tailoring.toast.withdrawn") });
      onDone?.("withdrawn");
    } catch (requestError) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("review_tailoring.toast.failed"), message: translateError(requestError) });
    }
  };

  const timeOf = (iso: string | null) => (iso ? formatUpdatedAt(iso, currentLocale, t) : "");

  const effectText =
    stats.toCreate > 0 && stats.toDelete > 0
      ? t(`${I18N}.summary_effect_both`, { created: mark(stats.toCreate), deleted: mark(stats.toDelete) })
      : stats.toCreate > 0
        ? t(`${I18N}.summary_effect_create`, { created: mark(stats.toCreate) })
        : stats.toDelete > 0
          ? t(`${I18N}.summary_effect_delete`, { deleted: mark(stats.toDelete) })
          : "";
  const effectTones = [
    ...(stats.toCreate > 0 ? ["text-success-primary"] : []),
    ...(stats.toDelete > 0 ? ["text-danger-primary"] : []),
  ];

  const renderApprover = (approval: TReviewTailoringApproval) => {
    const isMe = approval.approver === currentUser?.id;
    const approver = approval.approver_detail;
    const waitingMe = isMe && isPending && !approval.action;
    const sub =
      approval.action === "approved"
        ? `${t(`${I18N}.status_approved`)} · ${timeOf(approval.acted_at)}`
        : approval.action === "rejected"
          ? `${t(`${I18N}.status_rejected`)} · ${timeOf(approval.acted_at)}`
          : waitingMe
            ? t(`${I18N}.waiting_you`)
            : t(`${I18N}.not_signed`);
    return (
      <div key={approval.id}>
        <div className="flex items-center gap-2.5 py-2">
          <Avatar size="md" name={approver?.display_name ?? ""} src={getFileURL(approver?.avatar_url ?? "")} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-14 text-primary">
              <span className="truncate">{approver?.display_name}</span>
              {isMe && (
                <span className="shrink-0 rounded-full bg-accent-subtle px-1.5 text-11 leading-5 text-accent-primary">
                  {t(`${I18N}.you_short`)}
                </span>
              )}
              {approval.approver === submitter?.id && (
                <span className="shrink-0 rounded-full bg-layer-3 px-1.5 text-11 leading-5 text-secondary">
                  {t(`${I18N}.prop_submitter`)}
                </span>
              )}
            </div>
            <div className={cn("truncate text-12", waitingMe ? "text-accent-primary" : "text-tertiary")}>{sub}</div>
          </div>
          <span className="shrink-0 [&>svg]:size-4.5">
            {approval.action === "approved" ? (
              <CheckCircle2 className="text-success-primary" />
            ) : approval.action === "rejected" ? (
              <XCircle className="text-danger-primary" />
            ) : waitingMe ? (
              <CircleDot className="text-accent-primary" />
            ) : (
              <CircleDashed className="text-placeholder" />
            )}
          </span>
        </div>
        {approval.comment && (
          <p className="mb-1.5 ml-9.5 rounded-lg bg-layer-1 px-2.5 py-2 text-13 leading-relaxed whitespace-pre-line text-secondary">
            {approval.comment}
          </p>
        )}
      </div>
    );
  };

  const renderFooter = () => {
    if (canAct) {
      return (
        <div className="flex items-center gap-2.5 border-t border-subtle px-9 py-3.5">
          <input
            type="text"
            aria-label={t(`${I18N}.comment_placeholder`)}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t(`${I18N}.comment_placeholder`)}
            className="h-8 min-w-0 flex-1 rounded-md border border-strong bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
          />
          <Button variant="error-outline" size="xl" disabled={isMutating} onClick={() => void act("rejected")}>
            {t(`${I18N}.reject`)}
          </Button>
          <Button variant="primary" size="xl" prependIcon={<Check />} disabled={isMutating} onClick={() => void act("approved")}>
            {t(`${I18N}.approve`)}
          </Button>
        </div>
      );
    }

    let status: ReactNode = null;
    if (myApproval?.action) {
      const approved = myApproval.action === "approved";
      status = (
        <>
          <span
            className={cn(
              "flex items-center gap-1.5 font-semibold [&>svg]:size-4",
              approved ? "text-success-primary" : "text-danger-primary"
            )}
          >
            {approved ? <Check strokeWidth={2.6} /> : <X strokeWidth={2.6} />}
            {t(approved ? `${I18N}.acted_approved` : `${I18N}.acted_rejected`)}
          </span>
          <span className="text-secondary">
            {timeOf(myApproval.acted_at)}
            {isPending && remaining > 0 && ` · ${t(`${I18N}.remaining`, { count: remaining })}`}
          </span>
        </>
      );
    } else if (canWithdraw) {
      status = <span className="text-12 text-tertiary">{t(`${I18N}.withdraw_hint`)}</span>;
    } else if (!isPending) {
      status = (
        <span className="flex items-center gap-1.5 text-tertiary [&>svg]:size-4">
          <Clock3 />
          {t(`${I18N}.ended`)}
        </span>
      );
    } else if (!myApproval) {
      status = (
        <span className="flex items-center gap-1.5 text-tertiary [&>svg]:size-4">
          <Eye />
          {t(`${I18N}.not_approver`)}
        </span>
      );
    }

    return (
      <div className="flex min-h-15 items-center gap-2.5 border-t border-subtle px-9 py-3 text-13">
        {canWithdraw && (
          <Button variant="secondary" size="xl" prependIcon={<RotateCcw />} disabled={isMutating} onClick={() => void withdraw()}>
            {t(`${I18N}.withdraw`)}
          </Button>
        )}
        {status}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-9 pt-7 pb-6">
          <div className="flex items-center gap-2 text-13 text-tertiary">
            <ReviewTailoringStatusBadge status={detail.status} showDot />
            <span>{t(`${I18N}.round_label`, { round: detail.round })}</span>
            {onOpenTailoring && (
              <button
                type="button"
                className="ml-auto flex items-center gap-1 font-medium text-accent-primary hover:underline"
                onClick={onOpenTailoring}
              >
                {t(`${I18N}.open_tailoring`)}
                <ArrowUpRight className="size-3.5" />
              </button>
            )}
          </div>
          <h3 className="mt-2 text-20 font-semibold text-primary">{detail.title}</h3>
          <p className="mt-2 text-14 leading-relaxed text-secondary">
            <Emphasized
              text={t(`${I18N}.summary_counts`, { kept: mark(stats.selected), cut: mark(stats.cut) })}
              tones={[]}
            />
            {effectText && (
              <>
                {currentLocale.startsWith("zh") ? "" : " "}
                <Emphasized text={effectText} tones={effectTones} />
              </>
            )}
          </p>

          {items.length > 0 && (
            <>
              <div className="mt-6 mb-2.5 flex items-center gap-2.5">
                <span className="text-13 font-semibold text-secondary">{t(`${I18N}.items_title`)}</span>
                <TabBarSegments
                  value={itemTab}
                  options={[
                    { key: "cut" as const, label: t(`${I18N}.tab_cut`), count: cutItems.length },
                    { key: "kept" as const, label: t(`${I18N}.tab_kept`), count: keptItems.length },
                  ]}
                  onChange={setItemTab}
                />
              </div>
              <div className="border-t border-subtle">
                {itemTab === "cut" && cutItems.length === 0 && (
                  <p className="py-6 text-center text-13 text-tertiary">{t(`${I18N}.cut_empty`)}</p>
                )}
                {itemTab === "cut" &&
                  cutItems.map((item) => (
                    <DetailRow
                      key={item.id}
                      icon={<Scissors className="text-placeholder" />}
                      title={item.title}
                      stage={item.stage_label}
                      product={productNames ? (productNames.get(item.product_id) ?? "") : undefined}
                      note={item.reason.trim() || t(`${I18N}.no_reason`)}
                      noteClassName={item.reason.trim() ? undefined : "text-warning-primary"}
                    />
                  ))}
                {itemTab === "kept" &&
                  keptItems.map((item) => (
                    <DetailRow
                      key={item.id}
                      icon={<Check className="text-success-primary" />}
                      title={item.title}
                      stage={item.stage_label}
                      product={productNames ? (productNames.get(item.product_id) ?? "") : undefined}
                      note={t(item.stage_review_id ? `${I18N}.kept_existing` : `${I18N}.kept_create`)}
                      noteClassName={item.stage_review_id ? "text-tertiary" : "text-success-primary"}
                    />
                  ))}
              </div>
            </>
          )}

          {deletedItems.length > 0 && (
            <>
              <SectionTitle title={t(`${I18N}.delete_title`)} count={deletedItems.length} />
              <div className="border-t border-subtle">
                {deletedItems.map((item) => {
                  const completed = isCompletedCut(item);
                  return (
                    <DetailRow
                      key={item.id}
                      icon={<Trash2 className="text-danger-primary" />}
                      title={item.title}
                      stage={item.stage_label}
                      product={productNames ? (productNames.get(item.product_id) ?? "") : undefined}
                      note={t(completed ? `${I18N}.delete_completed` : `${I18N}.delete_open`)}
                      noteClassName={completed ? "text-danger-primary" : undefined}
                    />
                  );
                })}
              </div>
            </>
          )}

          {detail.pending_changes.length > 0 && (
            <>
              <SectionTitle title={t(`${I18N}.changes_title`)} count={detail.pending_changes.length} />
              <ApprovalChanges changes={detail.pending_changes} products={detail.products} />
            </>
          )}
        </div>
        {renderFooter()}
      </div>

      <aside className="flex w-74 shrink-0 flex-col overflow-y-auto border-l border-subtle px-5 pt-3.5 pb-5">
        {onClose && (
          <button
            type="button"
            aria-label={t("cancel")}
            className="-mr-1.5 grid size-8 shrink-0 place-items-center self-end rounded-md text-tertiary hover:bg-layer-transparent-hover"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        )}
        {submitter && (
          <PropRow label={t(`${I18N}.prop_submitter`)}>
            <Avatar size="sm" name={submitter.display_name} src={getFileURL(submitter.avatar_url ?? "")} />
            <span className="truncate">{submitter.display_name}</span>
            {isSubmitter && (
              <span className="shrink-0 rounded-full bg-accent-subtle px-1.5 text-11 leading-5 text-accent-primary">
                {t(`${I18N}.you_short`)}
              </span>
            )}
          </PropRow>
        )}
        <PropRow label={t(`${I18N}.prop_submitted_at`)}>{timeOf(detail.submitted_at)}</PropRow>
        <PropRow label={t(`${I18N}.prop_kind`)}>
          <span className="truncate">{kindLabel}</span>
        </PropRow>
        <PropRow label={t(`${I18N}.prop_rule`)}>{rule}</PropRow>
        <div className="my-3.5 shrink-0 border-t border-subtle" />
        <div className="mb-1 flex items-center text-13 font-semibold text-secondary">
          {t(`${I18N}.approvers`)}
          {detail.approvals.length > 1 && (
            <span className="ml-auto font-medium text-tertiary tabular-nums">
              {approvedCount} / {detail.approvals.length}
            </span>
          )}
        </div>
        {detail.approvals.map(renderApprover)}
      </aside>
    </div>
  );
});
