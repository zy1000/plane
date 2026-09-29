import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringActivity, TReviewTailoringProduct } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { cn, renderFormattedDateTime } from "@plane/utils";
import { PLAIN_ACTION, PLAIN_TABLE, PLAIN_TD, PLAIN_TH, formatMinute } from "../plain-table";
import type { TTimelineEntry, TTimelineFilter } from "./tailoring-timeline-model";
import { buildTailoringTimeline, filterTimeline } from "./tailoring-timeline-model";

const I18N = "review_tailoring.activity";

type TTranslate = ReturnType<typeof useTranslation>["t"];
type TCellAction = "keep" | "cut" | "reason" | "move";

const isTrue = (value: string | null) => value === "True" || value === "true";
const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

const cellAction = (activity: TReviewTailoringActivity): TCellAction =>
  activity.field === "cell_stage"
    ? "move"
    : activity.field === "cell_reason"
      ? "reason"
      : isTrue(activity.new_value)
        ? "keep"
        : "cut";

/** 格子改动的一句话：哪一格、改成了什么、原因是什么 */
const describeCell = (activity: TReviewTailoringActivity, t: TTranslate) => {
  const action = cellAction(activity);
  const title = String(activity.extra?.title ?? "");
  // 同一个评审在 o-1、o-2 下各有一格，光看名字分不清改的是哪一格。老数据没这一项就不写
  const stage = asText(activity.extra?.stage_label);
  const name = stage && action !== "move" ? `${stage} · ${title}` : title;
  if (action === "move") return `${name}：${activity.old_value ?? ""} → ${activity.new_value ?? ""}`;
  if (action === "reason") {
    const reason = asText(activity.new_value);
    return `${name}：${reason ? t(`${I18N}.detail_reason`, { reason }) : t(`${I18N}.reason_cleared`)}`;
  }
  const reason = asText(activity.extra?.reason);
  const result = t(`${I18N}.detail_cell_${action}`);
  return `${name}：${result}${reason ? `（${t(`${I18N}.detail_reason`, { reason })}）` : ""}`;
};

/**
 * 状态推进：「操作」写做了什么，「详情」写状态怎么变、生效带来了什么、签批意见。
 *
 * 状态的前后取时间线推算出来的那一对（`phaseBefore` / `phaseAfter`），不读记录里的 old_value ——
 * 早先的记录里，修订后再提交的那条旧状态一律记成了草稿。
 */
const describeMilestone = (entry: TTimelineEntry, t: TTranslate) => {
  const activity = entry.activities[0];
  const extra = (activity.extra ?? {}) as Record<string, unknown>;
  const details: string[] = [];
  let action = t(`${I18N}.op_fallback`);

  if (activity.field === "tailoring") {
    action = t(`${I18N}.op_created`);
    details.push(
      t(`${I18N}.detail_status`, { status: t(`review_tailoring.status.${EReviewTailoringStatus.DRAFT}`) })
    );
  } else if (activity.field === "approval") {
    // 多人签批里的一票：状态没变
    action = t(`${I18N}.op_approved_partial`);
    if (activity.new_value) details.push(activity.new_value);
  } else {
    const verbs = ["submitted", "approved", "rejected", "withdrawn", "revising", "revision_cancelled"];
    if (verbs.includes(activity.verb)) action = t(`${I18N}.op_${activity.verb}`, { round: extra.round ?? 1 });
    if (entry.phaseBefore !== entry.phaseAfter)
      details.push(
        `${t(`review_tailoring.status.${entry.phaseBefore}`)} → ${t(`review_tailoring.status.${entry.phaseAfter}`)}`
      );
    if (activity.verb === "approved") {
      let applied = t(`${I18N}.detail_applied`, {
        created: extra.created_count ?? 0,
        deleted: extra.deleted_count ?? 0,
      });
      if (Number(extra.moved_count ?? 0) > 0) applied += t(`${I18N}.detail_applied_moved`, { count: extra.moved_count });
      details.push(applied);
      if (Array.isArray(extra.skipped) && extra.skipped.length > 0) {
        const items = extra.skipped
          .map((entry) => {
            const move = (entry ?? {}) as Record<string, unknown>;
            return `${String(move.title ?? "")}（${String(move.stage_label ?? "")}）`;
          })
          .join("、");
        details.push(t(`${I18N}.applied_skipped`, { count: extra.skipped.length, items }));
      }
    }
  }
  const comment = asText(activity.comment);
  if (comment) details.push(t(`${I18N}.detail_comment`, { comment }));
  return { action, detail: details.join("；") };
};

/** 加减轴、改标题描述、同步矩阵 */
const describeEdit = (activity: TReviewTailoringActivity, products: TReviewTailoringProduct[], t: TTranslate) => {
  const extra = (activity.extra ?? {}) as Record<string, unknown>;
  switch (activity.field) {
    case "title":
      return {
        action: t(`${I18N}.op_title`),
        detail: `${activity.old_value ?? ""} → ${activity.new_value ?? ""}`,
      };
    case "description":
      return { action: t(`${I18N}.op_description`), detail: "" };
    // 加列与移除列共用 field="products"：加列记 new_value，移除列记 old_value
    case "products": {
      const names = Array.isArray(extra.product_ids)
        ? extra.product_ids
            .map((id) => products.find((product) => product.id === id)?.name)
            .filter((name): name is string => Boolean(name))
        : [];
      return {
        action: t(activity.new_value ? `${I18N}.op_products_added` : `${I18N}.op_products_removed`),
        detail: names.join("、"),
      };
    }
    case "reviews": {
      const names = Array.isArray(extra.titles)
        ? extra.titles.filter((title): title is string => typeof title === "string")
        : asText(extra.title)
          ? [String(extra.title)]
          : [];
      return {
        action: t(activity.new_value ? `${I18N}.op_reviews_added` : `${I18N}.op_reviews_removed`),
        detail: names.join("、"),
      };
    }
    case "items":
      return {
        action: t(`${I18N}.op_items_synced`),
        detail: t(`${I18N}.detail_items_synced`, { added: extra.added ?? 0, removed: extra.removed ?? 0 }),
      };
    case "comment":
      return { action: t(`${I18N}.op_comment`), detail: "" };
    default:
      return { action: t(`${I18N}.op_fallback`), detail: "" };
  }
};

const Detail = ({ children }: { children: ReactNode }) =>
  children ? (
    <span className="block py-2.5 leading-5 break-words whitespace-pre-wrap">{children}</span>
  ) : (
    <span className="text-placeholder">—</span>
  );

/** 同一次保存改了多格：先给各类计数，点开逐格列出 */
const CellsDetail = ({ activities }: { activities: TReviewTailoringActivity[] }) => {
  const { t } = useTranslation();
  // 少量格子直接摊开，一次改了很多格先收起
  const [isOpen, setIsOpen] = useState(activities.length <= 3);
  const counts = activities.reduce(
    (acc, activity) => ({ ...acc, [cellAction(activity)]: acc[cellAction(activity)] + 1 }),
    { keep: 0, cut: 0, reason: 0, move: 0 } as Record<TCellAction, number>
  );
  const summary = (["keep", "cut", "move", "reason"] as const)
    .filter((action) => counts[action] > 0)
    .map((action) => t(`${I18N}.count_${action}`, { count: counts[action] }))
    .join(" · ");

  return (
    <div className="py-2.5 leading-5">
      <span className="tabular-nums">{summary}</span>
      <button type="button" className={cn(PLAIN_ACTION, "ml-3")} onClick={() => setIsOpen((open) => !open)}>
        {t(isOpen ? `${I18N}.detail_collapse` : `${I18N}.detail_expand`)}
      </button>
      {isOpen && (
        <ul className="mt-1 flex flex-col gap-0.5 text-secondary">
          {activities.map((activity) => (
            <li key={activity.id} className="break-words">
              {describeCell(activity, t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const renderEntry = (entry: TTimelineEntry, products: TReviewTailoringProduct[], t: TTranslate) => {
  const first = entry.activities[0];
  if (entry.kind === "milestone") {
    const { action, detail } = describeMilestone(entry, t);
    return { action, detail: <Detail>{detail}</Detail> };
  }
  if (entry.kind === "cells") {
    if (entry.activities.length === 1) {
      return {
        action: t(`${I18N}.op_cell_${cellAction(first)}`),
        detail: <Detail>{describeCell(first, t)}</Detail>,
      };
    }
    return {
      action: t(`${I18N}.op_cells`, { count: entry.activities.length }),
      detail: <CellsDetail activities={entry.activities} />,
    };
  }
  const { action, detail } = describeEdit(first, products, t);
  return { action, detail: <Detail>{detail}</Detail> };
};

/**
 * 变更历史：一张表，一行一次操作，最近的在最上面。
 *
 * 同一个人一次保存下来的格子改动合成一行（`buildTailoringTimeline` 已经分好组），
 * 「类型」列区分状态推进与修改，Tab 条右侧的筛选按它收窄。
 */
export const TailoringActivityTable = ({
  activities,
  products,
  filter,
}: {
  activities: TReviewTailoringActivity[];
  products: TReviewTailoringProduct[];
  filter: TTimelineFilter;
}) => {
  const { t } = useTranslation();
  const entries = filterTimeline(buildTailoringTimeline(activities), filter).reverse();

  return (
    <table className={cn(PLAIN_TABLE, "table-fixed")}>
      <colgroup>
        <col style={{ width: 176 }} />
        <col style={{ width: 128 }} />
        <col style={{ width: 96 }} />
        <col style={{ width: 232 }} />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th className={cn(PLAIN_TH, "sticky top-0 z-[2] pl-6")}>{t(`${I18N}.col_time`)}</th>
          <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.col_actor`)}</th>
          <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.col_type`)}</th>
          <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.col_action`)}</th>
          <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.col_detail`)}</th>
        </tr>
      </thead>
      <tbody>
        {entries.length === 0 && (
          <tr>
            <td colSpan={5} className="border-b border-subtle px-6 py-10 text-center text-13 text-tertiary">
              {t(`${I18N}.empty_title`)}
            </td>
          </tr>
        )}
        {entries.map((entry) => {
          const last = entry.activities[entry.activities.length - 1];
          const { action, detail } = renderEntry(entry, products, t);
          return (
            <tr key={entry.key} className="hover:bg-layer-1">
              <td className={cn(PLAIN_TD, "pl-6 whitespace-nowrap text-secondary tabular-nums")}>
                {formatMinute(renderFormattedDateTime(last.created_at))}
              </td>
              <td className={cn(PLAIN_TD, "truncate")}>
                {entry.activities[0].actor_detail?.display_name ?? t(`${I18N}.system`)}
              </td>
              <td className={cn(PLAIN_TD, "whitespace-nowrap text-secondary")}>
                {t(entry.kind === "milestone" ? `${I18N}.filter_status` : `${I18N}.filter_edits`)}
              </td>
              <td className={cn(PLAIN_TD, "truncate")} title={action}>
                {action}
              </td>
              <td className={cn(PLAIN_TD, "h-auto min-w-0 py-0")}>{detail}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
