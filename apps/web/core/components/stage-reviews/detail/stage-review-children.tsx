import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewChild, TStageReviewCutChild, TStageReviewDetail } from "@plane/types";
import { EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { cn } from "@plane/utils";
import { ResultText } from "@/components/review-tailorings/tailoring-detail/result-select";
import { StageReviewResultText, StageReviewStatusBadge } from "../badges";
import { OStageValue, STAGE_REVIEW_O_STAGE_KINDS } from "../o-stage-fields";
import { StageReviewPeople } from "../people";
import { STAGE_REVIEW_STATUS_FILL } from "../status-icon";
import { Block } from "./stage-review-content";

const I18N = "stage_review";
const COLLAPSED_STORAGE_KEY = "stage_review_children_collapsed";
/** 默认最多列几项：区块高度和一张成品表差不多，详情不被十几行评审活动拉长 */
const DEFAULT_VISIBLE = 5;

/** ID / 名称 / 裁剪 / 裁剪原因 / 评审结论 / 责任人 / 结论和状态 */
const ROW_GRID =
  "grid grid-cols-[72px_minmax(0,1.35fr)_44px_minmax(0,1fr)_minmax(0,1fr)_96px_136px] items-center gap-x-3 px-3.5";
/** O阶段评审在评审结论后面多两列：生产方式、出货评估（「出货前刷新结论」最长，给 108） */
const O_STAGE_ROW_GRID =
  "grid grid-cols-[60px_minmax(0,1.4fr)_32px_minmax(0,1fr)_minmax(0,1fr)_68px_108px_76px_124px] items-center gap-x-2 px-3";
const ROW_CLASS = "min-h-[52px] border-t border-subtle py-2 text-13";
/** 名称、裁剪原因、评审结论最多两行，写不下的悬停看全文 */
const CLAMP_CLASS = "line-clamp-2 break-words";

/** 表里的一行：保留下来的是评审活动本身；裁剪掉的没有评审，只有裁剪表里的那一格 */
type TRow = { type: "review"; data: TStageReviewChild } | { type: "cut"; data: TStageReviewCutChild };

/** 默认那几项先列谁：正在进行的（评审中 / 审核中）→ 未评审 → 已评审 → 裁剪掉的 */
const ATTENTION_RANK: Record<EStageReviewStatus, number> = {
  [EStageReviewStatus.IN_REVIEW]: 0,
  [EStageReviewStatus.IN_APPROVAL]: 0,
  [EStageReviewStatus.NOT_STARTED]: 1,
  [EStageReviewStatus.COMPLETED]: 2,
};
const CUT_RANK = 3;
const rankOf = (row: TRow) => (row.type === "cut" ? CUT_RANK : ATTENTION_RANK[row.data.status]);

/** 进度条与「另有」从左到右的顺序：离完成近的在前 */
const STATUS_DISPLAY_ORDER = [...STAGE_REVIEW_STATUS_ORDER].reverse();

const countByStatus = (children: TStageReviewChild[]) => {
  const counts = new Map<EStageReviewStatus, number>();
  children.forEach((child) => counts.set(child.status, (counts.get(child.status) ?? 0) + 1));
  return counts;
};

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const EmptyCell = () => <span className="text-13 text-placeholder">—</span>;

/**
 * 父评审详情里的「评审活动」：挂在这条评审下的评审活动，加上来源裁剪表里被裁剪掉的那几项，
 * 按模板顺序（即编号顺序）排在一起，只看不改。
 *
 * 默认最多列 5 项（正在进行的排前面，裁剪掉的排最后），其余收在「展开全部」里；展开后按编号顺序全部列出。
 * 点保留下来的一行打开那一项：抽屉里是换抽屉内容（`onOpenReview`），独立页是跳那一项的独立页。
 * 裁剪掉的没有评审，不能点。
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
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);
  const [showAll, setShowAll] = useState(false);
  const { children, cut_children: cutChildren } = detail;

  // 换一条父评审回到默认那几项
  useEffect(() => setShowAll(false), [detail.id]);

  // 两边的 sort_order 都是模板顺序；sort 是稳定的，同值时评审活动在前
  const rows = useMemo<TRow[]>(
    () =>
      [
        ...children.map((data) => ({ type: "review" as const, data })),
        ...cutChildren.map((data) => ({ type: "cut" as const, data })),
      ].sort((a, b) => a.data.sort_order - b.data.sort_order),
    [children, cutChildren]
  );
  const counts = useMemo(() => countByStatus(children), [children]);
  const visible = useMemo(() => {
    if (showAll || rows.length <= DEFAULT_VISIBLE) return rows;
    return [...rows].sort((a, b) => rankOf(a) - rankOf(b)).slice(0, DEFAULT_VISIBLE);
  }, [rows, showAll]);

  if (rows.length === 0) return null;

  const done = counts.get(EStageReviewStatus.COMPLETED) ?? 0;
  const hiddenRows = rows.filter((row) => !visible.includes(row));
  const hiddenCounts = countByStatus(hiddenRows.flatMap((row) => (row.type === "review" ? [row.data] : [])));
  const hiddenCut = hiddenRows.filter((row) => row.type === "cut").length;
  const cutLabel = t("review_tailoring.matrix.cut");
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
  const isOStage = STAGE_REVIEW_O_STAGE_KINDS.includes(detail.kind);
  const rowGrid = isOStage ? O_STAGE_ROW_GRID : ROW_GRID;
  const hiddenSummary = [
    ...STATUS_DISPLAY_ORDER.filter((status) => hiddenCounts.get(status)).map(
      (status) => `${t(`${I18N}.status.${status}`)} ${hiddenCounts.get(status)}`
    ),
    ...(hiddenCut > 0 ? [`${cutLabel} ${hiddenCut}`] : []),
  ].join(" · ");

  return (
    <Block
      title={t(`${I18N}.detail.children_title`)}
      count={rows.length}
      action={
        <>
          {children.length > 0 && (
            <>
              <span className="flex h-1.5 w-32 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {STATUS_DISPLAY_ORDER.map((status) => {
                  const count = counts.get(status) ?? 0;
                  return count > 0 ? (
                    <span
                      key={status}
                      style={{ flexGrow: count }}
                      className={cn("basis-0 rounded-full", STAGE_REVIEW_STATUS_FILL[status])}
                    />
                  ) : null;
                })}
              </span>
              <span className="ml-1.5 text-12 text-tertiary tabular-nums">
                {t(`${I18N}.detail.children_progress`, { done, total: children.length })}
              </span>
            </>
          )}
          {cutChildren.length > 0 && (
            <>
              {children.length > 0 && <span className="mx-1 h-3 w-px bg-layer-3" aria-hidden />}
              <span className="text-12 text-tertiary tabular-nums">
                {cutLabel} {cutChildren.length}
              </span>
            </>
          )}
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
          <div className={isOStage ? "min-w-[860px]" : "min-w-[760px]"}>
            <div className={cn(rowGrid, "h-9 bg-layer-1 text-12 font-medium whitespace-nowrap text-tertiary")}>
              <span>{t(`${I18N}.detail.children_id`)}</span>
              <span>{t(`${I18N}.detail.children_name`)}</span>
              <span>{t(`${I18N}.detail.children_tailoring`)}</span>
              <span>{t(`${I18N}.detail.children_reason`)}</span>
              <span>{t(`${I18N}.detail.children_conclusion`)}</span>
              {isOStage && <span>{t(`${I18N}.fields.production_mode`)}</span>}
              {isOStage && <span>{t(`${I18N}.fields.shipment_assessment`)}</span>}
              <span>{t(`${I18N}.detail.children_owner`)}</span>
              <span>{t(`${I18N}.detail.children_result_status`)}</span>
            </div>
            {visible.map((row) => {
              if (row.type === "cut") {
                const cut = row.data;
                return (
                  <div key={cut.id} className={cn(rowGrid, ROW_CLASS)}>
                    <span className="truncate text-12 text-placeholder tabular-nums">{cut.standard_code}</span>
                    <span title={cut.title} className={cn(CLAMP_CLASS, "text-14 text-tertiary")}>
                      {displayTitle(cut.title)}
                    </span>
                    <ResultText value={false} />
                    <span title={cut.reason} className={cn(CLAMP_CLASS, "text-secondary")}>
                      {cut.reason}
                    </span>
                    {/* 没有评审：评审结论、生产出货、责任人、结论和状态都留空 */}
                    <span />
                    {isOStage && <span />}
                    {isOStage && <span />}
                    <span />
                    <span />
                  </div>
                );
              }

              const child = row.data;
              const isDone = child.status === EStageReviewStatus.COMPLETED;
              return (
                <Link
                  key={child.id}
                  to={getPath(child.id)}
                  onClick={(event) => handleOpen(event, child.id)}
                  className={cn(rowGrid, ROW_CLASS, "transition hover:bg-layer-1")}
                >
                  {child.standard_code ? (
                    <span className="truncate text-12 text-tertiary tabular-nums">{child.standard_code}</span>
                  ) : (
                    <EmptyCell />
                  )}
                  <span
                    title={child.title}
                    className={cn(CLAMP_CLASS, "text-14", isDone ? "text-secondary" : "font-medium text-primary")}
                  >
                    {displayTitle(child.title)}
                  </span>
                  <ResultText value className="text-tertiary" />
                  <span />
                  {child.conditional_reason ? (
                    <span title={child.conditional_reason} className={cn(CLAMP_CLASS, "text-secondary")}>
                      {child.conditional_reason}
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                  {isOStage &&
                    (child.production_mode ? (
                      <OStageValue field="production_mode" value={child.production_mode} className="text-13" />
                    ) : (
                      <EmptyCell />
                    ))}
                  {isOStage &&
                    (child.shipment_assessment ? (
                      <OStageValue field="shipment_assessment" value={child.shipment_assessment} className="text-13" />
                    ) : (
                      <EmptyCell />
                    ))}
                  <StageReviewPeople
                    users={child.leader_details}
                    unassigned={t(`${I18N}.detail.unassigned`)}
                    showEmptyIcon={false}
                  />
                  <span className="flex min-w-0 items-center gap-1.5">
                    <StageReviewStatusBadge status={child.status} />
                    <StageReviewResultText result={child.result} className="text-13" />
                  </span>
                </Link>
              );
            })}
            {rows.length > DEFAULT_VISIBLE && (
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
                    : t(`${I18N}.detail.children_expand_all`, { count: rows.length })}
                </span>
                {!showAll && (
                  <span className="ml-auto text-12 text-placeholder tabular-nums">
                    {t(`${I18N}.detail.children_rest`)} {hiddenSummary}
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
