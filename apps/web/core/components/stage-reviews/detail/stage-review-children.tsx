import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewChild, TStageReviewDetail } from "@plane/types";
import { EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { formatShortDate } from "@/components/review-tailorings/list/tailoring-row";
import { StageReviewResultBadge, StageReviewStatusBadge } from "../badges";
import { StageReviewPeople } from "../people";
import { STAGE_REVIEW_STATUS_FILL } from "../status-icon";
import { Block } from "./stage-review-content";

const I18N = "stage_review";
const COLLAPSED_STORAGE_KEY = "stage_review_children_collapsed";
/** 默认最多列几项：区块高度和一张成品表差不多，详情不被十几行评审活动拉长 */
const DEFAULT_VISIBLE = 5;

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_112px_96px_78px_84px_14px] items-center gap-x-3 px-3.5";

/** 默认那几项先列谁：正在进行的（评审中 / 审核中）→ 未评审 → 已评审 */
const ATTENTION_RANK: Record<EStageReviewStatus, number> = {
  [EStageReviewStatus.IN_REVIEW]: 0,
  [EStageReviewStatus.IN_APPROVAL]: 0,
  [EStageReviewStatus.NOT_STARTED]: 1,
  [EStageReviewStatus.COMPLETED]: 2,
};

/** 进度条与「另有」从左到右的顺序：离完成近的在前 */
const STATUS_DISPLAY_ORDER = [...STAGE_REVIEW_STATUS_ORDER].reverse();

const countByStatus = (rows: TStageReviewChild[]) => {
  const counts = new Map<EStageReviewStatus, number>();
  rows.forEach((row) => counts.set(row.status, (counts.get(row.status) ?? 0) + 1));
  return counts;
};

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * 父评审详情里的「评审活动」：挂在这条评审下的评审活动，一行一项，只看不改。
 *
 * 默认最多列 5 项（正在进行的排前面），其余收在「展开全部」里；展开后按原顺序全部列出。
 * 点一行打开那一项：抽屉里是换抽屉内容（`onOpenReview`），独立页是跳那一项的独立页。
 */
export const StageReviewChildren = ({
  detail,
  getPath,
  onOpenReview,
}: {
  detail: TStageReviewDetail;
  getPath: (reviewId: string) => string;
  onOpenReview?: (reviewId: string) => void;
}) => {
  const { t, currentLocale } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);
  const [showAll, setShowAll] = useState(false);
  const children = detail.children;

  // 换一条父评审回到默认那几项
  useEffect(() => setShowAll(false), [detail.id]);

  const counts = useMemo(() => countByStatus(children), [children]);
  const visible = useMemo(() => {
    if (showAll || children.length <= DEFAULT_VISIBLE) return children;
    // sort 是稳定的：同一档里保持原顺序
    return [...children].sort((a, b) => ATTENTION_RANK[a.status] - ATTENTION_RANK[b.status]).slice(0, DEFAULT_VISIBLE);
  }, [children, showAll]);

  if (children.length === 0) return null;

  const today = renderFormattedPayloadDate(new Date()) ?? "";
  const done = counts.get(EStageReviewStatus.COMPLETED) ?? 0;
  const hiddenCounts = countByStatus(children.filter((child) => !visible.includes(child)));
  // 评审活动名多半以「父评审名-」开头，列在父评审下面是重复的，省掉
  const prefix = `${detail.title}-`;
  const displayTitle = (title: string) =>
    title.startsWith(prefix) && title.length > prefix.length ? title.slice(prefix.length) : title;

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // 存不了就只在这次打开里生效
    }
  };

  const handleOpen = (event: MouseEvent, reviewId: string) => {
    if (!onOpenReview || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onOpenReview(reviewId);
  };

  const toggleLabel = t(`${I18N}.detail.${isCollapsed ? "children_expand" : "children_collapse"}`);

  return (
    <Block
      title={t(`${I18N}.detail.children_title`)}
      count={children.length}
      action={
        <>
          <span className="flex h-1.5 w-32 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {STATUS_DISPLAY_ORDER.map((status) => {
              const count = counts.get(status) ?? 0;
              return count > 0 ? (
                <span key={status} style={{ flexGrow: count }} className={cn("basis-0 rounded-full", STAGE_REVIEW_STATUS_FILL[status])} />
              ) : null;
            })}
          </span>
          <span className="ml-1.5 text-12 text-tertiary tabular-nums">
            {t(`${I18N}.detail.children_progress`, { done, total: children.length })}
          </span>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!isCollapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="grid size-7 place-items-center rounded-md text-tertiary transition hover:bg-layer-2 hover:text-secondary"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", isCollapsed && "-rotate-90")} />
          </button>
        </>
      }
    >
      {!isCollapsed && (
        <div className="overflow-x-auto rounded-lg border border-subtle">
          <div className="min-w-[640px]">
            <div className={cn(ROW_GRID, "h-8 bg-layer-1 text-12 font-medium text-tertiary")}>
              <span>{t(`${I18N}.detail.children_name`)}</span>
              <span>{t(`${I18N}.fields.leader`)}</span>
              <span>{t(`${I18N}.fields.end_date`)}</span>
              <span>{t(`${I18N}.display.property.result`)}</span>
              <span>{t(`${I18N}.display.property.status`)}</span>
              <span />
            </div>
            {visible.map((child) => {
              const isDone = child.status === EStageReviewStatus.COMPLETED;
              const isLate = Boolean(child.end_date) && child.end_date! < today && !isDone;
              return (
                <Link
                  key={child.id}
                  to={getPath(child.id)}
                  onClick={(event) => handleOpen(event, child.id)}
                  className={cn(ROW_GRID, "group min-h-10 border-t border-subtle text-14 transition hover:bg-layer-1")}
                >
                  <span
                    title={child.title}
                    className={cn("truncate", isDone ? "text-secondary" : "font-medium text-primary")}
                  >
                    {displayTitle(child.title)}
                  </span>
                  <StageReviewPeople
                    users={child.leader_details}
                    unassigned={t(`${I18N}.detail.unassigned`)}
                    showEmptyIcon={false}
                  />
                  {child.end_date ? (
                    <span
                      className={cn(
                        "truncate text-13 tabular-nums",
                        isLate ? "font-medium text-danger-primary" : "text-secondary"
                      )}
                    >
                      {formatShortDate(child.end_date, currentLocale)}
                    </span>
                  ) : (
                    <span className="text-13 text-placeholder">—</span>
                  )}
                  <span className="flex min-w-0">
                    <StageReviewResultBadge result={child.result} />
                  </span>
                  <span className="flex min-w-0">
                    <StageReviewStatusBadge status={child.status} />
                  </span>
                  <ArrowRight className="size-3.5 text-secondary opacity-0 transition group-hover:opacity-100" />
                </Link>
              );
            })}
            {children.length > DEFAULT_VISIBLE && (
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                aria-expanded={showAll}
                className="flex h-9 w-full items-center gap-2 border-t border-subtle px-3.5 text-13 transition hover:bg-layer-1"
              >
                <ChevronDown className={cn("size-3.5 text-placeholder transition-transform", showAll && "rotate-180")} />
                <span className="font-medium text-primary">
                  {showAll
                    ? t(`${I18N}.detail.children_show_less`, { count: DEFAULT_VISIBLE })
                    : t(`${I18N}.detail.children_expand_all`, { count: children.length })}
                </span>
                {!showAll && (
                  <span className="ml-auto text-12 text-placeholder tabular-nums">
                    {t(`${I18N}.detail.children_rest`)}{" "}
                    {STATUS_DISPLAY_ORDER.filter((status) => hiddenCounts.get(status))
                      .map((status) => `${t(`${I18N}.status.${status}`)} ${hiddenCounts.get(status)}`)
                      .join(" · ")}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </Block>
  );
};
