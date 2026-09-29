import type { ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringDetail } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { renderFormattedDateTime } from "@plane/utils";
import { descriptionHtmlToText } from "../description-text";
import { formatMinute } from "../plain-table";
import { ReviewTailoringStatusText } from "../status-text";
import type { TTailoringStats } from "./tailoring-matrix-model";

const I18N = "review_tailoring.detail";

const Item = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
    <span className="text-tertiary">{label}</span>
    <span className="text-primary">{children}</span>
  </span>
);

const minute = (value: string | null) => (value ? formatMinute(renderFormattedDateTime(value)) : "—");

/**
 * 顶栏下面的一行属性：状态、裁剪类型、阶段、创建人、时间，以及这个状态下最该看的那个数
 * （签批中 / 修订中是「生效后」会增删多少条评审，已生效是已经生成了多少条）。
 *
 * 标题在顶栏面包屑里，这里不再重复；描述排在最后、单行省略，悬停看全文，没写就不占位置。
 * 数字读的是本地格子，改一格就跟着变。
 */
export const DetailInfoRow = ({ detail, stats }: { detail: TReviewTailoringDetail; stats: TTailoringStats }) => {
  const { t } = useTranslation();
  const { status } = detail;
  const description = descriptionHtmlToText(detail.description_html);
  const showAfter = status === EReviewTailoringStatus.PENDING || status === EReviewTailoringStatus.REVISING;

  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-7 gap-y-1 border-b border-subtle px-6 py-2 text-13">
      <Item label={t(`${I18N}.info_status`)}>
        <ReviewTailoringStatusText status={status} />
      </Item>
      <Item label={t(`${I18N}.info_kind`)}>{t(`review_tailoring.kind.${detail.tailoring_kind}`)}</Item>
      {detail.stage_label && <Item label={t(`${I18N}.info_stage`)}>{detail.stage_label}</Item>}
      <Item label={t(`${I18N}.info_creator`)}>{detail.created_by_detail?.display_name ?? "—"}</Item>
      {status === EReviewTailoringStatus.APPROVED ? (
        <Item label={t(`${I18N}.info_effective_at`)}>
          <span className="tabular-nums">
            {t(`${I18N}.info_effective_value`, { time: minute(detail.approved_at), count: detail.revision })}
          </span>
        </Item>
      ) : status === EReviewTailoringStatus.PENDING ? (
        <Item label={t(`${I18N}.info_submitted_at`)}>
          <span className="tabular-nums">{minute(detail.submitted_at)}</span>
        </Item>
      ) : (
        <Item label={t(`${I18N}.info_updated_at`)}>
          <span className="tabular-nums">{minute(detail.updated_at)}</span>
        </Item>
      )}
      {showAfter && (
        <Item label={t(`${I18N}.stat_after`)}>
          <span className="tabular-nums">
            {t(`${I18N}.info_after_value`, { created: stats.toCreate, deleted: stats.toDelete })}
            {stats.toMove > 0 && t(`${I18N}.info_after_moved`, { count: stats.toMove })}
          </span>
        </Item>
      )}
      {status === EReviewTailoringStatus.APPROVED && (
        <Item label={t(`${I18N}.stat_generated`)}>
          <span className="tabular-nums">{t(`${I18N}.info_generated_value`, { count: stats.generated })}</span>
        </Item>
      )}
      {description && (
        <span className="flex min-w-0 flex-1 basis-60 items-center gap-1.5">
          <span className="shrink-0 text-tertiary">{t(`${I18N}.info_description`)}</span>
          <span className="truncate text-primary" title={description}>
            {description}
          </span>
        </span>
      )}
    </div>
  );
};
