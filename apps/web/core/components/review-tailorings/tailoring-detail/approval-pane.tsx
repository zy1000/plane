import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TReviewTailoringApproval,
  TReviewTailoringApprovalAction,
  TReviewTailoringChange,
  TReviewTailoringItem,
} from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, renderFormattedDateTime } from "@plane/utils";
import type { TReviewTailoringDetailStore } from "@/hooks/store/use-review-tailoring-detail";
import { getTailoringError } from "@/hooks/store/use-review-tailorings";
import { useUser } from "@/hooks/store/user";
import { useReviewTailoringPermissions } from "../permissions";
import { PLAIN_ACTION, PLAIN_TABLE, PLAIN_TD, PLAIN_TH, formatMinute } from "../plain-table";
import { TabBarSelect } from "./detail-tab-bar";
import { MODAL_TEXTAREA, TailoringModalFooter, TailoringModalHeader } from "./modal-frame";
import { ResultText } from "./result-select";
import { getTailoringStats, isCompletedCut } from "./tailoring-matrix-model";

const I18N = "review_tailoring.approval";

type TResultFilter = "all" | "cut" | "kept";
type TTranslate = ReturnType<typeof useTranslation>["t"];

const byMatrixOrder = (a: TReviewTailoringItem, b: TReviewTailoringItem) =>
  a.stage_sort_order - b.stage_sort_order || a.template_sort_order - b.template_sort_order;

const minute = (value: string | null) => (value ? formatMinute(renderFormattedDateTime(value)) : "—");

const Fact = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div className={cn("flex min-w-0 gap-2.5", className)}>
    <span className="shrink-0 text-tertiary">{label}</span>
    <span className="min-w-0 truncate text-primary">{children}</span>
  </div>
);

const SectionTitle = ({ title, tools }: { title: string; tools?: ReactNode }) => (
  <div className="flex h-12 items-center px-6 text-14 font-semibold text-primary">
    {title}
    {tools && <span className="ml-auto font-normal">{tools}</span>}
  </div>
);

/** 这一格签批生效后会怎样：新增 / 保持 / 删除 / 不生成，修订里挪过阶段的写清去向 */
const effectOf = (item: TReviewTailoringItem, move: TReviewTailoringChange | undefined, t: TTranslate) => {
  if (move) {
    const path = t(`${I18N}.effect_move`, { from: move.old_stage_label ?? "", to: move.stage_label });
    return move.will_skip
      ? { text: `${path}（${t(`${I18N}.change_will_skip`)}）`, tone: "text-warning-primary" }
      : { text: path, tone: "text-primary" };
  }
  if (item.selected)
    return item.stage_review_id
      ? { text: t(`${I18N}.effect_keep`), tone: "text-tertiary" }
      : { text: t(`${I18N}.effect_create`), tone: "text-primary" };
  if (!item.stage_review_id) return { text: t(`${I18N}.effect_none`), tone: "text-tertiary" };
  return {
    text: t(isCompletedCut(item) ? `${I18N}.effect_delete_completed` : `${I18N}.effect_delete`),
    tone: "text-danger-primary",
  };
};

/**
 * 签批内容：上面几项交代是谁在什么时候提交的、按什么规则通过，中间一张「评审明细」表
 * （每一格的结果、裁剪原因、生效后会怎样），下面是签批人表，最后是签批意见与按钮。
 *
 * 详情页的签批弹窗和列表页的待签批弹窗共用这一份。底部按身份分派：本轮还没表态的签批人写意见、
 * 点通过或驳回直接提交；表过态的看到自己的结论；提交人可以撤回 —— 但提交人自己也在签批人里
 * 且还没签时不给撤回（想撤回就自己驳回）；其他人只能看。
 */
export const ReviewTailoringApprovalPane = observer(function ReviewTailoringApprovalPane({
  workspaceSlug,
  projectId,
  store,
  onOpenTailoring,
  onBack,
  onClose,
  onDone,
}: {
  workspaceSlug: string;
  projectId: string;
  store: TReviewTailoringDetailStore;
  onOpenTailoring?: () => void;
  /** 从待签批列表点进来的：标题前给一个返回 */
  onBack?: () => void;
  onClose: () => void;
  onDone?: (result: TReviewTailoringApprovalAction | "withdrawn") => void;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { canManage } = useReviewTailoringPermissions(workspaceSlug, projectId);
  const { detail, items, isLoading, isMutating } = store;
  const [comment, setComment] = useState("");
  const [filter, setFilter] = useState<TResultFilter>("all");
  const stats = useMemo(() => getTailoringStats(items), [items]);
  const sortedItems = useMemo(() => [...items].sort(byMatrixOrder), [items]);

  useEffect(() => {
    setComment("");
    setFilter("all");
  }, [detail?.id]);

  if (isLoading || !detail) {
    return (
      <div className="flex w-full flex-col">
        <TailoringModalHeader title={t(`${I18N}.sign`)} onBack={onBack} onClose={onClose} />
        <Loader className="space-y-3 p-6">
          <Loader.Item height="20px" width="70%" />
          <Loader.Item height="220px" />
        </Loader>
      </div>
    );
  }

  const isPending = detail.status === EReviewTailoringStatus.PENDING;
  const myApproval = detail.approvals.find((approval) => approval.approver === currentUser?.id);
  const canAct = isPending && Boolean(myApproval && !myApproval.action);
  const isSubmitter = Boolean(currentUser && detail.submitted_by_detail?.id === currentUser.id);
  const canWithdraw = isPending && isSubmitter && canManage && !canAct;
  const approvedCount = detail.approvals.filter((approval) => approval.action === "approved").length;
  const submitter = detail.submitted_by_detail;
  const productNames = new Map(detail.products.map((product) => [product.id, product.identifier || product.name]));
  const moveByItem = new Map(
    detail.pending_changes.filter((change) => change.type === "move").map((change) => [change.item_id, change])
  );
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
  const visibleItems =
    filter === "all" ? sortedItems : sortedItems.filter((item) => item.selected === (filter === "kept"));

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

  const renderApprover = (approval: TReviewTailoringApproval) => {
    const isMe = approval.approver === currentUser?.id;
    const marks = [
      isMe ? t(`${I18N}.you_short`) : "",
      approval.approver === submitter?.id ? t(`${I18N}.prop_submitter`) : "",
    ].filter(Boolean);
    return (
      <tr key={approval.id}>
        <td className={cn(PLAIN_TD, "pl-6")}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{approval.approver_detail?.display_name}</span>
            {marks.length > 0 && <span className="shrink-0 text-placeholder">（{marks.join("、")}）</span>}
          </span>
        </td>
        <td className={cn(PLAIN_TD, "whitespace-nowrap")}>
          {approval.action === "approved" ? (
            <span className="text-success-primary">{t(`${I18N}.status_approved`)}</span>
          ) : approval.action === "rejected" ? (
            <span className="text-danger-primary">{t(`${I18N}.status_rejected`)}</span>
          ) : (
            <span className={isMe && isPending ? "text-warning-primary" : "text-tertiary"}>
              {t(`${I18N}.status_pending`)}
            </span>
          )}
        </td>
        <td className={cn(PLAIN_TD, "h-auto py-2.5 leading-5 break-words whitespace-pre-line")}>
          {approval.comment || <span className="text-placeholder">—</span>}
        </td>
        <td className={cn(PLAIN_TD, "whitespace-nowrap text-secondary tabular-nums")}>{minute(approval.acted_at)}</td>
      </tr>
    );
  };

  /** 不能签的人，底部左侧交代一句为什么 */
  const footerHint = (() => {
    if (canAct) return undefined;
    if (myApproval?.action) {
      const acted = t(myApproval.action === "approved" ? `${I18N}.acted_approved` : `${I18N}.acted_rejected`);
      const rest = isPending && remaining > 0 ? `，${t(`${I18N}.remaining`, { count: remaining })}` : "";
      return (
        <span className={myApproval.action === "approved" ? "text-success-primary" : "text-danger-primary"}>
          {acted}
          <span className="text-tertiary">{rest}</span>
        </span>
      );
    }
    if (canWithdraw) return t(`${I18N}.withdraw_hint`);
    if (!isPending) return t(`${I18N}.ended`);
    if (!myApproval) return t(`${I18N}.not_approver`);
    return undefined;
  })();

  return (
    <div className="flex max-h-[min(88vh,780px)] min-h-0 w-full flex-col">
      <TailoringModalHeader
        title={t(`${I18N}.sign`)}
        subtitle={`${detail.title} · ${t(`${I18N}.round_label`, { round: detail.round })}`}
        extra={
          onOpenTailoring && (
            <button type="button" className={PLAIN_ACTION} onClick={onOpenTailoring}>
              {t(`${I18N}.open_tailoring`)}
            </button>
          )
        }
        onBack={onBack}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-4 gap-x-6 gap-y-2.5 px-6 pt-4 pb-1 text-13">
          <Fact label={t(`${I18N}.prop_submitter`)}>{submitter?.display_name ?? "—"}</Fact>
          <Fact label={t(`${I18N}.prop_submitted_at`)}>
            <span className="tabular-nums">{minute(detail.submitted_at)}</span>
          </Fact>
          <Fact label={t(`${I18N}.prop_kind`)}>{kindLabel}</Fact>
          <Fact label={t(`${I18N}.rule`)}>
            {rule}
            <span className="tabular-nums">
              {t(`${I18N}.rule_progress`, { approved: approvedCount, total: detail.approvals.length })}
            </span>
          </Fact>
          <Fact label={t(`${I18N}.fact_result`)} className="col-span-4">
            <span className="tabular-nums">
              {t(`${I18N}.fact_result_value`, { kept: stats.selected, cut: stats.cut })}
              {"；"}
              {t("review_tailoring.detail.stat_after")}
              {t("review_tailoring.detail.info_after_value", { created: stats.toCreate, deleted: stats.toDelete })}
              {stats.toMove > 0 && t("review_tailoring.detail.info_after_moved", { count: stats.toMove })}
            </span>
          </Fact>
        </div>

        <SectionTitle
          title={t(`${I18N}.items_title`)}
          tools={
            <TabBarSelect
              label={t("review_tailoring.matrix.result_column")}
              value={filter}
              options={[
                { key: "all" as const, label: t("review_tailoring.detail.filter_all"), count: items.length },
                { key: "cut" as const, label: t(`${I18N}.tab_cut`), count: stats.cut },
                { key: "kept" as const, label: t(`${I18N}.tab_kept`), count: stats.selected },
              ]}
              onChange={setFilter}
            />
          }
        />
        <table className={cn(PLAIN_TABLE, "table-fixed border-t border-subtle")}>
          <colgroup>
            <col style={{ width: 128 }} />
            <col />
            <col style={{ width: 128 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 176 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={cn(PLAIN_TH, "pl-6")}>{t("review_tailoring.matrix.stage_column")}</th>
              <th className={PLAIN_TH}>{t("review_tailoring.matrix.review_column")}</th>
              <th className={PLAIN_TH}>{t("review_tailoring.actions.add_axes_col_product")}</th>
              <th className={PLAIN_TH}>{t("review_tailoring.matrix.result_column")}</th>
              <th className={PLAIN_TH}>{t("review_tailoring.matrix.reason")}</th>
              <th className={PLAIN_TH}>{t("review_tailoring.detail.stat_after")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={6} className="border-b border-subtle px-6 py-8 text-center text-13 text-tertiary">
                  {t(filter === "cut" ? `${I18N}.cut_empty` : "review_tailoring.items.empty")}
                </td>
              </tr>
            )}
            {visibleItems.map((item) => {
              const reason = item.reason.trim();
              const effect = effectOf(item, moveByItem.get(item.id), t);
              return (
                <tr key={item.id}>
                  <td className={cn(PLAIN_TD, "truncate pl-6")} title={item.stage_label}>
                    {item.stage_label}
                  </td>
                  <td
                    className={cn(PLAIN_TD, "truncate", item.parent_template_id ? "pl-8" : "font-semibold")}
                    title={item.title}
                  >
                    {item.title}
                  </td>
                  <td className={cn(PLAIN_TD, "truncate")}>{productNames.get(item.product_id) ?? "—"}</td>
                  <td className={PLAIN_TD}>
                    <ResultText value={item.selected} />
                  </td>
                  <td className={cn(PLAIN_TD, "truncate")} title={reason || undefined}>
                    {item.selected ? (
                      <span className="text-placeholder">—</span>
                    ) : (
                      reason || <span className="text-warning-primary">{t(`${I18N}.no_reason`)}</span>
                    )}
                  </td>
                  <td className={cn(PLAIN_TD, "truncate", effect.tone)} title={effect.text}>
                    {effect.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <SectionTitle title={t(`${I18N}.approvers`)} />
        <table className={cn(PLAIN_TABLE, "table-fixed border-t border-subtle")}>
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 112 }} />
            <col />
            <col style={{ width: 176 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={cn(PLAIN_TH, "pl-6")}>{t(`${I18N}.approvers`)}</th>
              <th className={PLAIN_TH}>{t(`${I18N}.col_decision`)}</th>
              <th className={PLAIN_TH}>{t(`${I18N}.col_comment`)}</th>
              <th className={PLAIN_TH}>{t(`${I18N}.col_acted_at`)}</th>
            </tr>
          </thead>
          <tbody>{detail.approvals.map(renderApprover)}</tbody>
        </table>

        {canAct ? (
          <div className="flex flex-col gap-1.5 px-6 pt-4 pb-5">
            <label htmlFor="review-tailoring-approval-comment" className="text-13 font-medium text-secondary">
              {t(`${I18N}.col_comment`)}
            </label>
            <textarea
              id="review-tailoring-approval-comment"
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t(`${I18N}.comment_placeholder`)}
              className={MODAL_TEXTAREA}
            />
          </div>
        ) : (
          <div className="h-5" />
        )}
      </div>

      <TailoringModalFooter hint={footerHint}>
        {canWithdraw && (
          <Button variant="secondary" size="xl" disabled={isMutating} onClick={() => void withdraw()}>
            {t(`${I18N}.withdraw`)}
          </Button>
        )}
        {canAct ? (
          <>
            <Button variant="secondary" size="xl" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button variant="error-outline" size="xl" disabled={isMutating} onClick={() => void act("rejected")}>
              {t(`${I18N}.reject`)}
            </Button>
            <Button variant="primary" size="xl" disabled={isMutating} onClick={() => void act("approved")}>
              {t(`${I18N}.approve`)}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="xl" onClick={onClose}>
            {t("close")}
          </Button>
        )}
      </TailoringModalFooter>
    </div>
  );
});
