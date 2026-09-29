import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoring } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { cn, renderFormattedDate, renderFormattedDateTime } from "@plane/utils";
import { PLAIN_ACTION, PLAIN_ACTION_DANGER, PLAIN_TD, formatMinute } from "../plain-table";
import { ReviewTailoringStatusText } from "../status-text";

/** 短日期：中文界面「9月8日」（跨年才带年份），其它语言沿用 renderFormattedDate */
export const formatShortDate = (iso: string, locale: string) => {
  if (!locale.toLowerCase().startsWith("zh")) return renderFormattedDate(iso) ?? "";
  const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
  return renderFormattedDate(iso, sameYear ? "M月d日" : "yyyy年M月d日") ?? "";
};

const NUMBER_TD = cn(PLAIN_TD, "text-right tabular-nums");
const EMPTY = <span className="text-placeholder">—</span>;

/**
 * 列表的一行：一行一张表，每个属性一列。点整行进详情，行尾「操作」列是文字按钮。
 */
export const TailoringRow = observer(function TailoringRow({
  item,
  canEdit,
  canDelete,
  onOpen,
  onEdit,
  onDelete,
  onSign,
}: {
  item: TReviewTailoring;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** 本轮在等我签时才给：行尾出「签批」 */
  onSign?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <tr className="group cursor-pointer hover:bg-layer-1" onClick={onOpen}>
      <td className={cn(PLAIN_TD, "max-w-0 pl-6")}>
        <span className="block truncate font-medium text-accent-primary group-hover:underline" title={item.title}>
          {item.title}
        </span>
      </td>
      <td className={cn(PLAIN_TD, "whitespace-nowrap")}>{t(`review_tailoring.kind.${item.tailoring_kind}`)}</td>
      <td className={cn(PLAIN_TD, "max-w-0")}>
        {item.stage_label ? (
          <span className="block truncate" title={item.stage_label}>
            {item.stage_label}
          </span>
        ) : (
          EMPTY
        )}
      </td>
      <td className={PLAIN_TD}>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <ReviewTailoringStatusText status={item.status} />
          {item.status === EReviewTailoringStatus.PENDING && (
            <span className="text-tertiary tabular-nums">
              {item.approval_approved}/{item.approval_total}
            </span>
          )}
        </span>
      </td>
      <td className={NUMBER_TD}>{item.review_count}</td>
      <td className={NUMBER_TD}>{item.product_count}</td>
      <td className={NUMBER_TD}>{item.item_count > 0 ? `${item.selected_count} / ${item.item_count}` : EMPTY}</td>
      <td className={cn(PLAIN_TD, "max-w-0")}>
        <span className="block truncate">{item.created_by_detail?.display_name ?? "—"}</span>
      </td>
      <td className={cn(PLAIN_TD, "whitespace-nowrap text-secondary tabular-nums")}>
        {formatMinute(renderFormattedDateTime(item.updated_at))}
      </td>
      <td className={PLAIN_TD} onClick={(event) => event.stopPropagation()}>
        <span className="flex items-center gap-3.5">
          {onSign && (
            <button type="button" className={cn(PLAIN_ACTION, "font-semibold")} onClick={onSign}>
              {t("review_tailoring.approval.sign")}
            </button>
          )}
          {canEdit && (
            <button type="button" className={PLAIN_ACTION} onClick={onEdit}>
              {t("edit")}
            </button>
          )}
          {canDelete && (
            <button type="button" className={PLAIN_ACTION_DANGER} onClick={onDelete}>
              {t("delete")}
            </button>
          )}
        </span>
      </td>
    </tr>
  );
});
