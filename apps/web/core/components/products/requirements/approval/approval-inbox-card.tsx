/**
 * 待我审批里的一张变更单卡片：头部（产品 / CR 号 / 变更原因 / 审批进度）、条目、页脚（提交人 + 操作）。
 * 驳回在卡片底部就地展开理由框，理由与提交由弹窗统一管理。
 */
import { ArrowRight, Check } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementApprovalInboxItem } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, renderFormattedDateTime } from "@plane/utils";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { approvalRuleLabel, CHANGE_TYPE_PILL } from "../change/styles";

type TProps = {
  item: TRequirementApprovalInboxItem;
  tab: "pending" | "processed";
  isMutating: boolean;
  isRejecting: boolean;
  comment: string;
  onCommentChange: (value: string) => void;
  onToggleReject: () => void;
  onApprove: () => void;
  onReject: () => void;
  onOpen: () => void;
};

/** 「10-16 16:34」：同一个收件箱里的单子跨度不大，年份和秒都是噪音 */
const formatSubmittedAt = (value: string) => renderFormattedDateTime(value).slice(5, 16);

export function ApprovalInboxCard({
  item,
  tab,
  isMutating,
  isRejecting,
  comment,
  onCommentChange,
  onToggleReject,
  onApprove,
  onReject,
  onOpen,
}: TProps) {
  const { t } = useTranslation();
  const submitter = item.created_by_detail;
  const moreCount = item.requirement_count - item.requirement_previews.length;

  return (
    <article className="overflow-hidden rounded-xl border border-subtle bg-surface-1">
      <div className="flex min-w-0 items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <span className="inline-flex h-5.5 max-w-40 shrink-0 items-center rounded-[5px] bg-layer-3 px-1.75 text-12 font-medium text-secondary">
          <span className="truncate" title={item.product_name}>
            {item.product_name}
          </span>
        </span>
        <span className="shrink-0 font-mono text-13 font-medium text-accent-primary">CR-{item.sequence_id}</span>
        <span
          className={`min-w-0 flex-1 truncate text-14 font-semibold ${item.reason ? "text-primary" : "text-placeholder"}`}
          title={item.reason || undefined}
        >
          {item.reason || t("workspace_products.requirements.change.untitled")}
        </span>
        {item.approval_type !== "none" && (
          <span className="shrink-0 text-12 text-tertiary">
            {t("workspace_products.requirements.inbox.progress", {
              approved: item.approved_count,
              total: item.total_count,
            })}
            {" · "}
            {approvalRuleLabel(t, item.approval_type, item.required_count)}
          </span>
        )}
      </div>

      <ul>
        {item.requirement_previews.map((preview) => (
          <li key={preview.id} className="flex h-8.5 min-w-0 items-center gap-2.5 px-4 text-14 text-primary">
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center rounded-[5px] px-1.5 text-12 font-medium",
                CHANGE_TYPE_PILL[preview.change_type]
              )}
            >
              {t(`workspace_products.requirements.change.filters.${preview.change_type}`)}
            </span>
            <span className="min-w-0 truncate" title={preview.title}>
              {preview.title}
            </span>
          </li>
        ))}
        {moreCount > 0 && (
          <li className="flex h-7 items-center px-4 text-12 text-tertiary">
            {t("workspace_products.requirements.inbox.more", { count: moreCount })}
          </li>
        )}
      </ul>

      <div className="mt-1.5 flex min-w-0 items-center gap-2 border-t border-subtle bg-layer-1 py-2.5 pr-3 pl-4">
        <Avatar
          name={submitter?.display_name ?? ""}
          src={getFileURL(submitter?.avatar_url ?? "")}
          fallbackBackgroundColor={submitter ? getUserAvatarFallbackBackgroundColor(submitter) : undefined}
          size={22}
          showTooltip={false}
        />
        <span className="min-w-0 flex-1 truncate text-13 text-secondary">
          {t("workspace_products.requirements.inbox.submitted_by", {
            name: submitter?.display_name ?? "",
            date: formatSubmittedAt(item.created_at),
          })}
        </span>
        <Button variant="ghost" size="lg" onClick={onOpen} appendIcon={<ArrowRight />}>
          {t("workspace_products.requirements.inbox.open_detail")}
        </Button>
        {tab === "processed" ? (
          item.my_action && (
            <span className="shrink-0 pl-1 text-13 text-tertiary">
              {t(`workspace_products.requirements.inbox.my_action.${item.my_action}`)}
            </span>
          )
        ) : (
          item.can_approve && (
            <>
              <Button variant="error-outline" size="lg" disabled={isMutating} onClick={onToggleReject}>
                {t("workspace_products.requirements.change.bar.reject")}
              </Button>
              <Button variant="primary" size="lg" disabled={isMutating} onClick={onApprove} prependIcon={<Check />}>
                {t("workspace_products.requirements.change.bar.approve")}
              </Button>
            </>
          )
        )}
      </div>

      {isRejecting && (
        <div className="border-t border-subtle bg-layer-1 px-4 pb-3">
          <textarea
            value={comment}
            onChange={(event) => onCommentChange(event.target.value)}
            rows={2}
            maxLength={2000}
            autoFocus
            className="mt-3 block w-full resize-none rounded-lg border border-subtle-1 bg-surface-1 px-3 py-2 text-14 leading-[22px] text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
            placeholder={t("workspace_products.requirements.inbox.reject_placeholder")}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={onToggleReject}>
              {t("cancel")}
            </Button>
            <Button
              variant="error-fill"
              size="lg"
              loading={isMutating}
              disabled={!comment.trim()}
              onClick={onReject}
            >
              {t("workspace_products.requirements.inbox.confirm_reject")}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
