import { observer } from "mobx-react";
import { Grid3x3, Link2, MoreHorizontal, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { getIconButtonStyling } from "@plane/propel/icon-button";
import type { TReviewTailoring } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { Avatar, CustomMenu } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { ReviewTailoringStatusBadge } from "../status-badge";

type TTranslate = ReturnType<typeof useTranslation>["t"];

const MINUTE = 60 * 1000;

/** 行首方块的底色跟状态走，与状态药丸同一套语义色 */
const ICON_TONE: Record<EReviewTailoringStatus, string> = {
  [EReviewTailoringStatus.DRAFT]: "bg-layer-3 text-tertiary",
  [EReviewTailoringStatus.PENDING]: "bg-warning-subtle text-warning-primary",
  [EReviewTailoringStatus.APPROVED]: "bg-success-subtle text-success-primary",
  [EReviewTailoringStatus.REVISING]: "bg-accent-subtle text-accent-primary",
};

/** 短日期：中文界面「9月8日」（跨年才带年份），其它语言沿用 renderFormattedDate */
export const formatShortDate = (iso: string, locale: string) => {
  if (!locale.toLowerCase().startsWith("zh")) return renderFormattedDate(iso) ?? "";
  const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
  return renderFormattedDate(iso, sameYear ? "M月d日" : "yyyy年M月d日") ?? "";
};

/** 更新时间：刚刚 / 今天 10:20 / 昨天 / 9月8日。calculateTimeAgo 不接 locale，中文界面会吐英文 */
export const formatUpdatedAt = (iso: string, locale: string, t: TTranslate) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (now.getTime() - date.getTime() < MINUTE) return t("relative_time.just_now");
  if (date.toDateString() === now.toDateString())
    return t("review_tailoring.list.today_at", { time: renderFormattedTime(iso) });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t("relative_time.yesterday");
  return formatShortDate(iso, locale);
};

const approvalRule = (item: TReviewTailoring, t: TTranslate) => {
  if (item.approval_type === "all") return t("review_tailoring.approval.rule_all");
  if (item.approval_type === "n_of_m")
    return t("review_tailoring.approval.rule_n_of_m", { count: item.required_count ?? 0 });
  return t("review_tailoring.approval.rule_any");
};

/** 状态药丸下面那行小字：每个状态说它自己最该被看见的那件事 */
const statusDetail = (item: TReviewTailoring, locale: string, t: TTranslate) => {
  const effectiveDate = item.approved_at ? formatShortDate(item.approved_at, locale) : "";
  switch (item.status) {
    case EReviewTailoringStatus.PENDING:
      return t("review_tailoring.list.sub_pending", {
        round: item.round,
        approved: item.approval_approved,
        total: item.approval_total,
        rule: approvalRule(item, t),
      });
    case EReviewTailoringStatus.APPROVED:
      return t("review_tailoring.list.sub_approved", {
        count: item.revision,
        date: effectiveDate,
        generated: item.generated_count,
      });
    case EReviewTailoringStatus.REVISING: {
      const base = t("review_tailoring.list.sub_revising", { date: effectiveDate });
      return item.pending_change_count > 0
        ? `${base} · ${t("review_tailoring.list.sub_revising_changes", { count: item.pending_change_count })}`
        : base;
    }
    default:
      return t("review_tailoring.list.never_effective");
  }
};

const SelectedProgress = ({ selected, total }: { selected: number; total: number }) => (
  <div className="flex items-center gap-2.5">
    <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-layer-3">
      <span
        className="block h-full rounded-full bg-accent-primary"
        style={{ width: `${Math.round((selected / total) * 100)}%` }}
      />
    </span>
    <span className="text-13 whitespace-nowrap text-primary tabular-nums">
      {selected}
      <span className="ml-0.5 text-12 text-placeholder">/ {total}</span>
    </span>
  </div>
);

export const TailoringRow = observer(function TailoringRow({
  item,
  canDelete,
  onOpen,
  onCopyLink,
  onDelete,
}: {
  item: TReviewTailoring;
  canDelete: boolean;
  onOpen: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const { t, currentLocale } = useTranslation();
  const hasAxis = item.review_count > 0 || item.product_count > 0;
  const creator = item.created_by_detail;

  return (
    <tr className="group cursor-pointer hover:bg-layer-transparent-hover" onClick={onOpen}>
      <td className="border-b border-subtle py-3.5 pr-3 pl-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("grid size-8.5 shrink-0 place-items-center rounded-lg", ICON_TONE[item.status])}>
            <Grid3x3 className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-14 font-medium text-primary">{item.title}</span>
            <span className="mt-0.5 block truncate text-12 text-tertiary">
              {hasAxis
                ? t("review_tailoring.list.axis_meta", { reviews: item.review_count, products: item.product_count })
                : t("review_tailoring.list.axis_empty")}
            </span>
          </span>
        </div>
      </td>
      <td className="border-b border-subtle px-3 py-3.5">
        <ReviewTailoringStatusBadge status={item.status} showDot />
        <div className="mt-1 text-12 whitespace-nowrap text-tertiary tabular-nums">
          {statusDetail(item, currentLocale, t)}
        </div>
      </td>
      <td className="border-b border-subtle px-3 py-3.5">
        {item.item_count > 0 && <SelectedProgress selected={item.selected_count} total={item.item_count} />}
      </td>
      <td className="border-b border-subtle px-3 py-3.5">
        {creator && (
          <span className="flex items-center gap-2 text-13 whitespace-nowrap text-secondary">
            <Avatar size="md" name={creator.display_name} src={getFileURL(creator.avatar_url ?? "")} />
            <span className="truncate">{creator.display_name}</span>
          </span>
        )}
      </td>
      <td className="border-b border-subtle px-3 py-3.5 text-13 whitespace-nowrap text-tertiary">
        {formatUpdatedAt(item.updated_at, currentLocale, t)}
      </td>
      {/* 菜单弹层是 portal，但 React 事件仍沿组件树冒泡到行上，得在这里截住 */}
      <td className="border-b border-subtle py-3.5 pr-4 pl-1" onClick={(event) => event.stopPropagation()}>
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <CustomMenu
            // CustomMenu 自己包了一层 <button>，这里只画样子
            customButton={
              <span className={getIconButtonStyling("ghost", "lg")}>
                <MoreHorizontal className="size-4" />
              </span>
            }
            placement="bottom-end"
            closeOnSelect
          >
            <CustomMenu.MenuItem onClick={onCopyLink} className="flex items-center gap-2">
              <Link2 className="size-3.5" />
              {t("review_tailoring.list.copy_link")}
            </CustomMenu.MenuItem>
            {canDelete && (
              <CustomMenu.MenuItem onClick={onDelete} className="flex items-center gap-2 text-danger-primary">
                <Trash2 className="size-3.5" />
                {t("review_tailoring.actions.delete")}
              </CustomMenu.MenuItem>
            )}
          </CustomMenu>
        </div>
      </td>
    </tr>
  );
});
