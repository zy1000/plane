import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { AlertTriangle, ArrowUpRight, Check, Clock3, Eye, RotateCcw, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TReviewTailoringApproval, TReviewTailoringApprovalAction } from "@plane/types";
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
import { getTailoringStats } from "./tailoring-matrix-model";

const I18N = "review_tailoring.approval";

type TApprovalState = "approved" | "rejected" | "waiting";

const STATE_PILL: Record<TApprovalState, string> = {
  approved: "bg-success-subtle text-success-primary",
  rejected: "bg-danger-primary/10 text-danger-primary",
  waiting: "bg-layer-3 text-tertiary",
};

const STATE_BAR: Record<TApprovalState, string> = {
  approved: "bg-success-primary",
  rejected: "bg-danger-primary",
  waiting: "bg-layer-3",
};

const stateOf = (approval: TReviewTailoringApproval): TApprovalState => approval.action ?? "waiting";

const SectionLabel = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="mb-2 flex items-center gap-2 text-12 font-semibold text-tertiary">
    {children}
    {right && <span className="ml-auto font-medium tabular-nums">{right}</span>}
  </div>
);

const ImpactTile = ({
  label,
  value,
  hint,
  hintClassName,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  hintClassName?: string;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-3">
    <span className="text-12 text-tertiary">{label}</span>
    <span className="text-20 leading-tight font-semibold text-primary tabular-nums">{value}</span>
    <span className={cn("truncate text-12 text-tertiary", hintClassName)}>{hint}</span>
  </div>
);

const DecisionCard = ({
  tone,
  isActive,
  icon,
  title,
  hint,
  onClick,
}: {
  tone: "approve" | "reject";
  isActive: boolean;
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={isActive}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-colors",
      isActive
        ? tone === "approve"
          ? "border-(--background-color-success-primary) bg-success-subtle"
          : "border-(--background-color-danger-primary) bg-danger-primary/10"
        : "border-strong hover:bg-layer-transparent-hover"
    )}
  >
    <span
      className={cn(
        "grid size-7.5 shrink-0 place-items-center rounded-full [&>svg]:size-4",
        isActive
          ? tone === "approve"
            ? "bg-success-primary text-on-color"
            : "bg-danger-primary text-on-color"
          : "bg-layer-3 text-tertiary"
      )}
    >
      {icon}
    </span>
    <span className="min-w-0">
      <span
        className={cn(
          "block text-14 font-semibold",
          isActive ? (tone === "approve" ? "text-success-primary" : "text-danger-primary") : "text-secondary"
        )}
      >
        {title}
      </span>
      <span className="block truncate text-12 text-tertiary">{hint}</span>
    </span>
  </button>
);

const Banner = ({ tone, icon, children }: { tone: "success" | "danger" | "neutral"; icon: ReactNode; children: ReactNode }) => (
  <div
    className={cn(
      "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-13 [&>svg]:size-4 [&>svg]:shrink-0",
      tone === "success" && "border-success-subtle bg-success-subtle text-success-primary",
      tone === "danger" && "border-transparent bg-danger-primary/10 text-danger-primary",
      tone === "neutral" && "border-subtle bg-layer-1 text-secondary"
    )}
  >
    {icon}
    <span>{children}</span>
  </div>
);

/**
 * 签批的内容区：签什么 → 通过后会发生什么 → 谁签了 → 我的结论。
 *
 * 详情页的签批弹窗和列表页的签批收件箱共用这一份，外壳各自给。按身份分派底部：
 * 本轮还没表态的签批人先选通过 / 驳回、再点变色的确认按钮（与工作项审批同样两步）；
 * 提交人可以撤回；表过态的看到自己的结论；其他人只能看。
 */
export const ReviewTailoringApprovalPane = observer(function ReviewTailoringApprovalPane({
  workspaceSlug,
  projectId,
  store,
  footerHint,
  onOpenTailoring,
  onClose,
  onDone,
}: {
  workspaceSlug: string;
  projectId: string;
  store: TReviewTailoringDetailStore;
  /** 底部左侧的一句提示，只在能签批时显示（收件箱用来说「签完自动切到下一张」） */
  footerHint?: string;
  onOpenTailoring?: () => void;
  onClose?: () => void;
  onDone?: (result: TReviewTailoringApprovalAction | "withdrawn") => void;
}) {
  const { t, currentLocale } = useTranslation();
  const { data: currentUser } = useUser();
  const { canManage } = useReviewTailoringPermissions(workspaceSlug, projectId);
  const { detail, items, isLoading, isMutating } = store;
  const [decision, setDecision] = useState<TReviewTailoringApprovalAction | null>(null);
  const [comment, setComment] = useState("");
  const stats = useMemo(() => getTailoringStats(items), [items]);
  const changes = detail?.pending_changes ?? [];
  const moves = changes.filter((change) => change.type === "move");
  const skipping = moves.filter((change) => change.will_skip).length;

  useEffect(() => {
    setDecision(null);
    setComment("");
  }, [detail?.id]);

  if (isLoading || !detail) {
    return (
      <Loader className="space-y-3 p-6">
        <Loader.Item height="44px" />
        <Loader.Item height="96px" />
        <Loader.Item height="160px" />
      </Loader>
    );
  }

  const isPending = detail.status === EReviewTailoringStatus.PENDING;
  const myApproval = detail.approvals.find((approval) => approval.approver === currentUser?.id);
  const canAct = isPending && Boolean(myApproval && !myApproval.action);
  const isSubmitter = Boolean(currentUser && detail.submitted_by_detail?.id === currentUser.id);
  const canWithdraw = isPending && isSubmitter && canManage;
  const approvedCount = detail.approvals.filter((approval) => approval.action === "approved").length;
  const submitter = detail.submitted_by_detail;
  const rule =
    detail.approval_type === "all"
      ? t(`${I18N}.rule_all`)
      : detail.approval_type === "n_of_m"
        ? t(`${I18N}.rule_n_of_m`, { count: detail.required_count ?? 1 })
        : t(`${I18N}.rule_any`);

  const translateError = (requestError: unknown) => {
    const { message, code } = getTailoringError(requestError);
    return code ? t(`review_tailoring.errors.${code}`, { defaultValue: message }) : message;
  };

  const confirm = async () => {
    if (!decision) return;
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

  const actedAt = (iso: string | null) => (iso ? formatUpdatedAt(iso, currentLocale, t) : "");

  const renderMine = () => {
    if (canAct) {
      return (
        <section>
          <SectionLabel>{t(`${I18N}.my_decision`)}</SectionLabel>
          <div role="radiogroup" className="grid grid-cols-2 gap-2.5">
            <DecisionCard
              tone="approve"
              isActive={decision === "approved"}
              icon={<Check strokeWidth={2.6} />}
              title={t(`${I18N}.approve`)}
              hint={t(`${I18N}.approve_hint`)}
              onClick={() => setDecision("approved")}
            />
            <DecisionCard
              tone="reject"
              isActive={decision === "rejected"}
              icon={<X strokeWidth={2.6} />}
              title={t(`${I18N}.reject`)}
              hint={t(`${I18N}.reject_hint`)}
              onClick={() => setDecision("rejected")}
            />
          </div>
          <textarea
            id="review-tailoring-approval-comment"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t(`${I18N}.comment_placeholder`)}
            className="mt-2.5 w-full resize-none rounded-lg border border-strong bg-surface-1 px-3 py-2 text-14 leading-relaxed text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
          />
        </section>
      );
    }
    if (myApproval?.action) {
      return myApproval.action === "approved" ? (
        <Banner tone="success" icon={<Check strokeWidth={2.6} />}>
          {t(`${I18N}.acted_approved`, { date: actedAt(myApproval.acted_at) })}
        </Banner>
      ) : (
        <Banner tone="danger" icon={<X strokeWidth={2.6} />}>
          {t(`${I18N}.acted_rejected`, { date: actedAt(myApproval.acted_at) })}
        </Banner>
      );
    }
    if (!isPending) return <Banner tone="neutral" icon={<Clock3 />}>{t(`${I18N}.ended`)}</Banner>;
    if (!myApproval && !isSubmitter) return <Banner tone="neutral" icon={<Eye />}>{t(`${I18N}.not_approver`)}</Banner>;
    return null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-3 px-6 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <h3 className="truncate text-18 font-semibold text-primary">{detail.title}</h3>
            <ReviewTailoringStatusBadge status={detail.status} showDot className="shrink-0" />
          </div>
          {submitter && (
            <div className="mt-1 flex items-center gap-1.5 text-13 text-tertiary">
              <Avatar size="sm" name={submitter.display_name} src={getFileURL(submitter.avatar_url ?? "")} />
              <span className="truncate">
                {t(`${I18N}.submitted_meta`, {
                  name: submitter.display_name,
                  date: actedAt(detail.submitted_at),
                  round: detail.round,
                })}
              </span>
            </div>
          )}
        </div>
        {onOpenTailoring && (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 pt-1 text-13 font-medium text-accent-primary hover:underline"
            onClick={onOpenTailoring}
          >
            {t(`${I18N}.open_tailoring`)}
            <ArrowUpRight className="size-3.5" />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            aria-label={t("cancel")}
            className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5">
        <section>
          <SectionLabel>{t(`${I18N}.impact_title`)}</SectionLabel>
          <div
            className={cn(
              "grid divide-x divide-subtle overflow-hidden rounded-xl border border-subtle",
              moves.length > 0 ? "grid-cols-4" : "grid-cols-3"
            )}
          >
            <ImpactTile
              label={t(`${I18N}.impact_kept`)}
              value={stats.selected}
              hint={t(`${I18N}.impact_kept_hint`, { products: detail.product_count, rows: detail.rows.length })}
            />
            <ImpactTile
              label={t(`${I18N}.impact_cut`)}
              value={stats.cut}
              hint={
                stats.missing > 0
                  ? t(`${I18N}.impact_cut_missing`, { count: stats.missing })
                  : t(`${I18N}.impact_cut_done`)
              }
              hintClassName={stats.missing > 0 ? "text-warning-primary" : undefined}
            />
            {moves.length > 0 && (
              <ImpactTile
                label={t(`${I18N}.impact_moved`)}
                value={<span className="text-accent-primary">{moves.length}</span>}
                hint={
                  skipping > 0
                    ? t(`${I18N}.impact_moved_skip`, { count: skipping })
                    : t(`${I18N}.impact_moved_hint`)
                }
                hintClassName={skipping > 0 ? "text-warning-primary" : undefined}
              />
            )}
            <ImpactTile
              label={t(`${I18N}.impact_after`)}
              value={
                <>
                  <span className="text-success-primary">+{stats.toCreate}</span>{" "}
                  {/* 真要删评审才标红，−0 用红色像在报警 */}
                  <span className={cn("text-16", stats.toDelete > 0 ? "text-danger-primary" : "text-placeholder")}>
                    −{stats.toDelete}
                  </span>
                </>
              }
              hint={t(`${I18N}.impact_after_hint`, { created: stats.toCreate, deleted: stats.toDelete })}
            />
          </div>
          {stats.toDeleteCompleted > 0 && (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger-primary/10 px-3 py-2 text-12 text-danger-primary">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {t(`${I18N}.completed_delete_warning`, { count: stats.toDeleteCompleted })}
            </p>
          )}
        </section>

        {changes.length > 0 && (
          <section>
            <SectionLabel>{t(`${I18N}.changes_title`)}</SectionLabel>
            <ApprovalChanges changes={changes} products={detail.products} />
          </section>
        )}

        <section>
          <SectionLabel right={t(`${I18N}.progress`, { approved: approvedCount, total: detail.approvals.length })}>
            {t(`${I18N}.progress_title`)}
            <span className="rounded-md bg-layer-3 px-1.5 py-0.5 text-11 font-medium text-secondary">{rule}</span>
          </SectionLabel>
          <div className="mb-2.5 flex gap-1">
            {detail.approvals.map((approval) => (
              <span key={approval.id} className={cn("h-1.5 flex-1 rounded-full", STATE_BAR[stateOf(approval)])} />
            ))}
          </div>
          <div className="divide-y divide-subtle rounded-xl border border-subtle">
            {detail.approvals.map((approval) => {
              const state = stateOf(approval);
              const isMe = approval.approver === currentUser?.id;
              const approver = approval.approver_detail;
              return (
                <div key={approval.id} className="flex items-start gap-3 px-3.5 py-2.5">
                  <Avatar size="md" name={approver?.display_name ?? ""} src={getFileURL(approver?.avatar_url ?? "")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-14 text-primary">
                      <span className="truncate">{approver?.display_name}</span>
                      {isMe && (
                        <span className="shrink-0 rounded-full bg-accent-subtle px-1.5 text-11 leading-5 text-accent-primary">
                          {t(`${I18N}.you_short`)}
                        </span>
                      )}
                    </div>
                    <div className="text-12 text-tertiary">
                      {approval.acted_at
                        ? actedAt(approval.acted_at)
                        : isMe && isPending
                          ? t(`${I18N}.waiting_you`)
                          : t(`${I18N}.status_waiting`)}
                    </div>
                    {approval.comment && (
                      <p className="mt-1.5 rounded-lg bg-layer-1 px-2.5 py-1.5 text-13 whitespace-pre-line text-secondary">
                        {approval.comment}
                      </p>
                    )}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-12 font-medium", STATE_PILL[state])}>
                    {t(`${I18N}.status_${state}`)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {renderMine()}
      </div>

      {(canAct || canWithdraw) && (
        <div className="flex items-center gap-2.5 border-t border-subtle px-6 py-3.5">
          {canWithdraw && (
            <Button variant="secondary" size="lg" prependIcon={<RotateCcw />} disabled={isMutating} onClick={() => void withdraw()}>
              {t(`${I18N}.withdraw`)}
            </Button>
          )}
          {canAct && footerHint && <span className="text-12 text-tertiary">{footerHint}</span>}
          <span className="flex-1" />
          {canAct && (
            <button
              type="button"
              disabled={!decision || isMutating}
              onClick={() => void confirm()}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg px-4 text-14 font-medium whitespace-nowrap transition-opacity disabled:cursor-not-allowed",
                decision === "approved" && "bg-success-primary text-on-color hover:opacity-90",
                decision === "rejected" && "bg-danger-primary text-on-color hover:opacity-90",
                !decision && "bg-layer-3 text-placeholder"
              )}
            >
              {decision === "rejected" ? <X className="size-4" /> : <Check className="size-4" />}
              {t(
                decision === "approved"
                  ? `${I18N}.confirm_approve`
                  : decision === "rejected"
                    ? `${I18N}.confirm_reject`
                    : `${I18N}.choose_first`
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
