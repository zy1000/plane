import { memo, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageSquare, Paperclip } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TStageReview, TUpdateStageReviewPayload } from "@plane/types";
import { EStageReviewResult, EStageReviewStatus } from "@plane/types";
import { Checkbox } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { useColumnWidths } from "@/components/common/resizable-table-head";
import { stageReviewsPath } from "@/components/reviews/routes";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import type { TStageReviewFlashedCells } from "./bulk/use-stage-review-bulk-edit";
import type { TStageReviewColumn } from "./display/display-settings";
import { StageReviewDatesCell } from "./dates-cell";
import { RoleMemberSelect } from "./detail/role-member-select";
import type { TStageReviewRow } from "./stage-review-rows";
import { StageReviewStatusIcon } from "./status-icon";

const I18N = "stage_review";

/** 宽度含格子左右各 12px 内边距（格子之间画竖线，不再用 gap 隔开） */
const COLUMN_WIDTH: Record<TStageReviewColumn, string> = {
  product: "minmax(132px, 192px)",
  project: "minmax(162px, 212px)",
  stage: "minmax(100px, 132px)",
  status: "108px",
  result: "96px",
  leader: "160px",
  auditor: "160px",
  dates: "132px",
  attachment_count: "68px",
  comment_count: "68px",
  kind: "116px",
  tailoring: "minmax(132px, 192px)",
  updated_at: "112px",
};

const NO_DEFAULT_WIDTHS: Record<string, number> = {};

/** 行高与表头高（h-11 / h-9，含底线）。行是定高的，虚拟列表直接按它算，不用逐行量 */
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 36;

/** 同工作项表格：每格左边一道竖线，与行底线一起画出格子 */
const CELL_CLASS = "flex h-full min-w-0 items-center border-l border-subtle px-3";

/** 结论只上色不加底：一列药丸挤在一起太吵，颜色已经够区分 */
const RESULT_TEXT: Record<EStageReviewResult, string> = {
  [EStageReviewResult.PASSED]: "text-13 font-medium text-success-primary",
  [EStageReviewResult.CONDITIONAL]: "text-13 font-medium text-warning-primary",
  [EStageReviewResult.REJECTED]: "text-13 font-medium text-danger-primary",
  [EStageReviewResult.WAIVED]: "text-13 font-medium text-tertiary",
};

/** 没有值的格子留空，不画「—」 */
const Empty = () => null;

/** 行左侧留白里的勾选框：平时藏着，悬停该行或已经有勾选时才出来，不占列宽 */
const RowCheckbox = ({
  checked,
  indeterminate,
  disabled,
  visible,
  hoverGroup,
  title,
  onToggle,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  visible: boolean;
  hoverGroup: "header" | "row";
  title: string;
  onToggle: () => void;
}) => (
  <span
    className="absolute inset-y-0 left-1.5 z-[1] grid w-3.5 place-items-center"
    title={title}
  >
    <Checkbox
      className="size-3.5 !outline-none"
      iconClassName="size-3"
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      aria-label={title}
      onChange={onToggle}
      containerClassName={cn(
        "pointer-events-none opacity-0 transition-opacity",
        hoverGroup === "header"
          ? "group-hover/header:pointer-events-auto group-hover/header:opacity-100"
          : "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
        (visible || checked) && "pointer-events-auto opacity-100"
      )}
    />
  </span>
);

export type TStageReviewTableSelection = {
  selectedSet: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  /** 已评审是终态，不能勾 */
  isSelectable: (review: TStageReview) => boolean;
  onToggle: (reviewId: string) => void;
  onToggleAll: () => void;
};

/** 标题列拖宽时的下限；其它列统一 {@link MIN_COLUMN_WIDTH} */
const MIN_TITLE_WIDTH = 160;
const MIN_COLUMN_WIDTH = 64;
const TITLE_KEY = "title";

/**
 * 表头格右缘 8px 的拖宽热区，悬停出一道蓝线，交互同工作项表格。宽度量的是所在表头格，
 * 拖动期间整页禁选，免得把表头文字刷成选中态。
 */
const ResizeHandle = ({ minWidth, onResize }: { minWidth: number; onResize: (width: number) => void }) => {
  const handleMouseDown = (event: ReactMouseEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) =>
      onResize(Math.round(Math.max(minWidth, startWidth + moveEvent.clientX - startX)));
    const handleMouseUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <span
      role="presentation"
      onMouseDown={handleMouseDown}
      className="group/resize absolute top-0 -right-1 z-[1] h-full w-2 cursor-col-resize"
    >
      <span className="absolute top-0 left-1/2 h-full w-px bg-transparent transition-colors group-hover/resize:bg-accent-primary" />
    </span>
  );
};

const Count = ({ icon, value }: { icon: ReactNode; value: number }) =>
  value > 0 ? (
    <span className="flex items-center gap-1 text-12 tabular-nums text-tertiary">
      {icon}
      {value}
    </span>
  ) : (
    <Empty />
  );

type TTranslate = ReturnType<typeof useTranslation>["t"];

/**
 * 一行里除标题以外的格子共用的东西。在表格里 useMemo 一次，滚动时行才不会跟着重渲。
 * 不放 `t`：useTranslation 每次渲染都给新的 t，放进来 memo 就失效了；行自己取 t，
 * 换语言时靠 `locale` 变化让所有行重渲。
 */
type TRowContext = {
  locale: string;
  workspaceSlug: string;
  columns: TStageReviewColumn[];
  gridTemplateColumns: string;
  stageLabelOf: (stageId: string) => string | undefined;
  today: string;
  openInProject: string;
  onOpen: (reviewId: string) => void;
  selection?: TStageReviewTableSelection;
  hasSelection: boolean;
  onUpdateReview?: (review: TStageReview, payload: TUpdateStageReviewPayload) => void;
};

/** `live` 为 false 时，人员与日期格子只画静态样子不挂下拉（见 StageReviewTableRow） */
const renderCell = (
  column: TStageReviewColumn,
  review: TStageReview,
  ctx: TRowContext,
  live: boolean,
  t: TTranslate
) => {
  const { workspaceSlug, stageLabelOf, today, openInProject, onUpdateReview } = ctx;
  // 同工作项表格：人与日期点格子就地改；没有维护权限、或已评审（终态）时只读
  const isEditable = (target: TStageReview) =>
    Boolean(onUpdateReview) && target.status !== EStageReviewStatus.COMPLETED;

  switch (column) {
    case "project":
      // 点项目名去那个项目的阶段评审页并自动打开这一条
      return review.project_detail ? (
        <Link
          to={`${stageReviewsPath(workspaceSlug, review.project_id)}?review=${review.id}`}
          title={`${review.project_detail.name} · ${openInProject}`}
          className="flex min-w-0 items-center gap-1.5 text-13 text-secondary hover:text-accent-primary hover:underline"
        >
          <span className="grid size-4 shrink-0 place-items-center">
            <Logo logo={review.project_detail.logo_props} size={14} />
          </span>
          <span className="truncate">{review.project_detail.name}</span>
        </Link>
      ) : (
        <Empty />
      );
    case "stage": {
      const label = stageLabelOf(review.stage_id);
      return label ? <span className="truncate text-13 text-secondary">{label}</span> : <Empty />;
    }
    case "product":
      return review.product_detail ? (
        <span className="truncate text-13 text-secondary" title={review.product_detail.name}>
          {review.product_detail.name}
        </span>
      ) : (
        <Empty />
      );
    case "status":
      return (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <StageReviewStatusIcon status={review.status} className="size-3.5" />
          <span className="text-13 text-secondary">{t(`${I18N}.status.${review.status}`)}</span>
        </span>
      );
    case "result":
      return review.result ? <span className={RESULT_TEXT[review.result]}>{t(`${I18N}.result.${review.result}`)}</span> : <Empty />;
    case "leader":
    case "auditor": {
      const isLeader = column === "leader";
      return (
        <RoleMemberSelect
          variant="cell"
          workspaceSlug={workspaceSlug}
          projectId={review.project_id}
          reviewId={review.id}
          role={column}
          value={isLeader ? review.leader_ids : review.auditor_ids}
          valueDetail={isLeader ? review.leader_details : review.auditor_details}
          placeholder={t(`${I18N}.display.property.${column}`)}
          disabled={!isEditable(review)}
          idle={!live}
          onChange={(userIds) =>
            onUpdateReview?.(review, isLeader ? { leader_ids: userIds } : { auditor_ids: userIds })
          }
        />
      );
    }
    case "dates":
      return (
        <StageReviewDatesCell
          start={review.start_date}
          end={review.end_date}
          isLate={
            Boolean(review.end_date) && review.end_date! < today && review.status !== EStageReviewStatus.COMPLETED
          }
          placeholder={t(`${I18N}.display.property.dates`)}
          disabled={!isEditable(review)}
          idle={!live}
          onChange={(dates) => onUpdateReview?.(review, dates)}
        />
      );
    case "attachment_count":
      return <Count icon={<Paperclip className="size-3.5" />} value={review.attachment_count} />;
    case "comment_count":
      return <Count icon={<MessageSquare className="size-3.5" />} value={review.comment_count} />;
    case "kind":
      return <StageReviewKindBadge kind={review.kind} />;
    case "tailoring":
      // 同一产品的同一评审在多张裁剪表里都保留时会各生成一条，标题一模一样，靠这列区分
      return review.tailoring_title ? (
        <span className="truncate text-13 text-secondary" title={review.tailoring_title}>
          {review.tailoring_title}
        </span>
      ) : (
        <Empty />
      );
    case "updated_at":
      return review.updated_at ? (
        <span className="text-13 tabular-nums text-tertiary">{renderFormattedDate(review.updated_at, "yyyy-MM-dd")}</span>
      ) : (
        <Empty />
      );
  }
};

/**
 * 一行。memo 住：虚拟列表每滚一下表格都会重渲，已经在屏幕上的行 props 没变就不动，只有新滚进来的
 * 行要挂载。人员 / 日期格子的下拉很重（快速滚动时每帧要挂好几行），所以先画静态样子，鼠标移到行上
 * 或键盘焦点进到行里才换成真下拉 —— 点击总在移入之后，用起来没有差别。
 */
const StageReviewTableRow = memo(function StageReviewTableRow({
  row,
  offset,
  isActive,
  isSelected,
  flashed,
  ctx,
}: {
  row: TStageReviewRow;
  /** 行顶到表头底的距离（虚拟列表算的） */
  offset: number;
  isActive: boolean;
  isSelected: boolean;
  /** 批量改完要闪的列；这一行没改到就是 null */
  flashed: Set<TStageReviewColumn> | null;
  ctx: TRowContext;
}) {
  const { review, depth, carried, title, parentTitle } = row;
  const { t } = useTranslation();
  const { columns, gridTemplateColumns, selection, hasSelection, onOpen } = ctx;
  const selectable = selection?.isSelectable(review) ?? false;
  const [isLive, setIsLive] = useState(false);
  const goLive = () => {
    if (!isLive) setIsLive(true);
  };
  return (
    <div
      onMouseEnter={goLive}
      onFocusCapture={goLive}
      className={cn(
        "group/row absolute top-0 left-0 grid h-11 w-full items-center border-b border-subtle transition-colors",
        isActive || isSelected ? "bg-accent-subtle" : "hover:bg-layer-1",
        carried && "opacity-60"
      )}
      style={{ gridTemplateColumns, transform: `translateY(${offset}px)` }}
    >
      {selection && (
        <RowCheckbox
          checked={isSelected}
          disabled={!selectable}
          visible={hasSelection && selectable}
          hoverGroup="row"
          title={selectable ? t(`${I18N}.bulk.select_row`) : t(`${I18N}.bulk.locked_hint`)}
          onToggle={() => selection.onToggle(review.id)}
        />
      )}
      <span
        className={cn("relative flex h-full min-w-0 items-center gap-1.5 pr-3", depth === 1 ? "pl-[52px]" : "pl-6")}
      >
        {depth === 1 && (
          <span
            className="absolute top-0 left-[34px] h-1/2 w-3 rounded-bl-md border-b border-l border-subtle"
            aria-hidden
          />
        )}
        {parentTitle && (
          <span className="max-w-[40%] shrink-0 truncate text-13 text-placeholder">{parentTitle} ›</span>
        )}
        {/* 只有点标题才开抽屉，行上其它地方点了不动 */}
        <button
          type="button"
          onClick={() => onOpen(review.id)}
          // 字号与文字色写成整串：过 cn() 会被当成同一组互相吞掉
          className={
            depth === 0 && !parentTitle
              ? "min-w-0 cursor-pointer truncate text-left text-13 font-medium text-primary hover:text-accent-primary hover:underline"
              : "min-w-0 cursor-pointer truncate text-left text-13 text-primary hover:text-accent-primary hover:underline"
          }
          title={review.title}
        >
          {title}
        </button>
      </span>
      {columns.map((column) => (
        <span
          key={column}
          className={cn(CELL_CLASS, "transition-colors duration-700", flashed?.has(column) && "bg-success-subtle")}
        >
          {renderCell(column, review, ctx, isLive, t)}
        </span>
      ))}
    </div>
  );
});

/**
 * 左侧选中那一组的评审表：列由调用方算好（「显示属性」里开了哪些 + 作用域换列）。分组在左侧
 * 分组栏里，这张表本身不分组；评审活动缩进挂在所属评审下，或铺平时带「所属评审 ›」。
 */
export const StageReviewTable = ({
  workspaceSlug,
  rows,
  columns,
  stageLabelOf,
  today,
  activeReviewId,
  onOpen,
  selection,
  flashedCells,
  onUpdateReview,
  scrollRef,
}: {
  workspaceSlug: string;
  rows: TStageReviewRow[];
  columns: TStageReviewColumn[];
  /** 「研发阶段」列的阶段名，来自阶段汇总 */
  stageLabelOf: (stageId: string) => string | undefined;
  /** `YYYY-MM-DD`，判断计划日期是否逾期 */
  today: string;
  activeReviewId: string | null;
  onOpen: (reviewId: string) => void;
  /** 不传就没有勾选（产品页 / 没有维护权限） */
  selection?: TStageReviewTableSelection;
  /** 批量改完后闪一下改到的格子 */
  flashedCells?: TStageReviewFlashedCells | null;
  /** 就地改负责人 / 审核人 / 计划日期；不传则这几格只读（产品页 / 没有维护权限） */
  onUpdateReview?: (review: TStageReview, payload: TUpdateStageReviewPayload) => void;
  /**
   * 表格外面那层滚动容器。一个项目的评审能到四五百条，每格都是完整的下拉组件，全量铺开是
   * 两万多个节点，打开、切分组、滚动都会冻住；所以只渲染视口里的行（筛选 / 分组 / 计数
   * 仍基于全量数据，不受影响）。
   */
  scrollRef: RefObject<HTMLDivElement | null>;
}) => {
  const { t, currentLocale } = useTranslation();
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // 行在吸顶表头下面开始
    scrollMargin: HEADER_HEIGHT,
    overscan: 10,
    getItemKey: (index) => rows[index]?.review.id ?? index,
  });
  // 列宽可拖：拖过的列按像素定宽，没拖过的沿用默认；和工作项表格一样只存在组件里，刷新回默认
  const { widths, setWidth } = useColumnWidths(NO_DEFAULT_WIDTHS);
  const widthOf = (key: string, fallback: string) => (widths[key] ? `${widths[key]}px` : fallback);
  const gridTemplateColumns = [
    widthOf(TITLE_KEY, "minmax(240px, 1fr)"),
    ...columns.map((column) => widthOf(column, COLUMN_WIDTH[column])),
  ].join(" ");
  const openInProject = t(`${I18N}.detail.open_in_project`);
  const hasSelection = Boolean(selection && selection.selectedSet.size > 0);
  const rowContext = useMemo<TRowContext>(
    () => ({
      locale: currentLocale,
      workspaceSlug,
      columns,
      gridTemplateColumns,
      stageLabelOf,
      today,
      openInProject,
      onOpen,
      selection,
      hasSelection,
      onUpdateReview,
    }),
    [
      currentLocale,
      workspaceSlug,
      columns,
      gridTemplateColumns,
      stageLabelOf,
      today,
      openInProject,
      onOpen,
      selection,
      hasSelection,
      onUpdateReview,
    ]
  );

  return (
    <div className="min-w-fit">
      <div
        className="group/header sticky top-0 z-[2] grid h-9 items-center border-b border-subtle bg-layer-1 text-12 text-tertiary"
        style={{ gridTemplateColumns }}
      >
        {selection && (
          <RowCheckbox
            checked={selection.allSelected}
            indeterminate={selection.someSelected}
            visible={hasSelection}
            hoverGroup="header"
            title={t(`${I18N}.bulk.select_all`)}
            onToggle={selection.onToggleAll}
          />
        )}
        <span className="relative flex h-full min-w-0 items-center pr-3 pl-6">
          <span className="truncate">{t(`${I18N}.table.title`)}</span>
          <ResizeHandle minWidth={MIN_TITLE_WIDTH} onResize={(width) => setWidth(TITLE_KEY, width)} />
        </span>
        {columns.map((column) => (
          <span key={column} className={cn(CELL_CLASS, "relative")}>
            <span className="truncate">
              {column === "stage" ? t(`${I18N}.display.group.stage`) : t(`${I18N}.display.property.${column}`)}
            </span>
            <ResizeHandle minWidth={MIN_COLUMN_WIDTH} onResize={(width) => setWidth(column, width)} />
          </span>
        ))}
      </div>

      {/* 行绝对定位不撑宽度，横向宽度由上面的表头（同一套列宽）撑开 */}
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() - HEADER_HEIGHT }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <StageReviewTableRow
              key={virtualRow.key}
              row={row}
              offset={virtualRow.start - HEADER_HEIGHT}
              isActive={row.review.id === activeReviewId}
              isSelected={Boolean(selection?.selectedSet.has(row.review.id))}
              flashed={flashedCells?.ids.has(row.review.id) ? flashedCells.columns : null}
              ctx={rowContext}
            />
          );
        })}
      </div>
    </div>
  );
};
