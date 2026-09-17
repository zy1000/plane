import type { ReactNode } from "react";
import { MessageSquare, Paperclip } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { IUserLite, TStageReview } from "@plane/types";
import { EStageReviewResult, EStageReviewStatus } from "@plane/types";
import { Avatar, Checkbox } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import type { TStageReviewFlashedCells } from "./bulk/use-stage-review-bulk-edit";
import type { TStageReviewColumn } from "./display/display-settings";
import type { TStageReviewRow } from "./stage-review-rows";
import { StageReviewStatusIcon } from "./status-icon";

const I18N = "stage_review";

const COLUMN_WIDTH: Record<TStageReviewColumn, string> = {
  product: "minmax(120px, 180px)",
  project: "minmax(150px, 200px)",
  stage: "minmax(88px, 120px)",
  status: "96px",
  result: "84px",
  leader: "124px",
  auditor: "124px",
  dates: "120px",
  attachment_count: "56px",
  comment_count: "56px",
  kind: "104px",
  tailoring: "minmax(120px, 180px)",
  updated_at: "80px",
};

/** 结论只上色不加底：一列药丸挤在一起太吵，颜色已经够区分 */
const RESULT_TEXT: Record<EStageReviewResult, string> = {
  [EStageReviewResult.PASSED]: "text-13 font-medium text-success-primary",
  [EStageReviewResult.CONDITIONAL]: "text-13 font-medium text-warning-primary",
  [EStageReviewResult.REJECTED]: "text-13 font-medium text-danger-primary",
  [EStageReviewResult.WAIVED]: "text-13 font-medium text-tertiary",
};

const Empty = () => <span className="text-13 text-placeholder">—</span>;

const shortDate = (value: string) => value.slice(5, 10);

const Person = ({ user, unassigned }: { user: IUserLite | null; unassigned: string }) =>
  user ? (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate text-13 text-secondary">{user.display_name}</span>
    </span>
  ) : (
    <span className="flex min-w-0 items-center gap-2">
      <span className="size-5 shrink-0 rounded-full border border-dashed border-strong" />
      <span className="truncate text-13 text-placeholder">{unassigned}</span>
    </span>
  );

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
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    role="presentation"
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

const Count = ({ icon, value }: { icon: ReactNode; value: number }) =>
  value > 0 ? (
    <span className="flex items-center gap-1 text-12 tabular-nums text-tertiary">
      {icon}
      {value}
    </span>
  ) : (
    <Empty />
  );

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
}) => {
  const { t } = useTranslation();
  const gridTemplateColumns = ["minmax(240px, 1fr)", ...columns.map((column) => COLUMN_WIDTH[column])].join(" ");
  const unassigned = t(`${I18N}.list.unassigned`);
  const openInProject = t(`${I18N}.detail.open_in_project`);
  const hasSelection = Boolean(selection && selection.selectedSet.size > 0);

  const renderCell = (column: TStageReviewColumn, review: TStageReview) => {
    switch (column) {
      case "project":
        // 点项目名去那个项目的阶段评审页并自动打开这一条；不触发行点击
        return review.project_detail ? (
          <Link
            to={`/${workspaceSlug}/projects/${review.project_id}/stage-reviews?review=${review.id}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
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
        return <Person user={review.leader_detail} unassigned={unassigned} />;
      case "auditor":
        return <Person user={review.auditor_detail} unassigned={unassigned} />;
      case "dates": {
        if (!review.start_date && !review.end_date) return <Empty />;
        const isLate =
          Boolean(review.end_date) && review.end_date! < today && review.status !== EStageReviewStatus.COMPLETED;
        return (
          <span className={isLate ? "text-13 tabular-nums text-danger-primary" : "text-13 tabular-nums text-secondary"}>
            {[review.start_date, review.end_date].map((value) => (value ? shortDate(value) : "—")).join(" → ")}
          </span>
        );
      }
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
          <span className="text-13 tabular-nums text-tertiary">{shortDate(review.updated_at)}</span>
        ) : (
          <Empty />
        );
    }
  };

  return (
    <div className="min-w-fit">
      <div
        className="group/header sticky top-0 z-[2] grid h-9 items-center gap-x-3 border-b border-subtle bg-layer-1 px-6 text-12 text-tertiary"
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
        <span>{t(`${I18N}.table.title`)}</span>
        {columns.map((column) => (
          <span key={column} className="truncate">
            {column === "stage" ? t(`${I18N}.display.group.stage`) : t(`${I18N}.display.property.${column}`)}
          </span>
        ))}
      </div>

      {rows.map(({ review, depth, carried, title, parentTitle }) => {
        const selectable = selection?.isSelectable(review) ?? false;
        const flashed = flashedCells?.ids.has(review.id) ? flashedCells.columns : null;
        return (
          <div
            key={review.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(review.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onOpen(review.id);
            }}
            className={cn(
              "group/row relative grid h-11 cursor-pointer items-center gap-x-3 border-b border-subtle px-6 transition-colors",
              review.id === activeReviewId || selection?.selectedSet.has(review.id) ? "bg-accent-subtle" : "hover:bg-layer-1",
              carried && "opacity-60"
            )}
            style={{ gridTemplateColumns }}
          >
            {selection && (
              <RowCheckbox
                checked={selection.selectedSet.has(review.id)}
                disabled={!selectable}
                visible={hasSelection && selectable}
                hoverGroup="row"
                title={selectable ? t(`${I18N}.bulk.select_row`) : t(`${I18N}.bulk.locked_hint`)}
                onToggle={() => selection.onToggle(review.id)}
              />
            )}
            <span className={cn("relative flex h-full min-w-0 items-center gap-1.5", depth === 1 && "pl-7")}>
              {depth === 1 && (
                <span
                  className="absolute top-0 left-2.5 h-1/2 w-3 rounded-bl-md border-b border-l border-subtle"
                  aria-hidden
                />
              )}
              {parentTitle && (
                <span className="max-w-[40%] shrink-0 truncate text-13 text-placeholder">{parentTitle} ›</span>
              )}
              <span
                className={depth === 0 && !parentTitle ? "truncate text-13 font-medium text-primary" : "truncate text-13 text-primary"}
                title={review.title}
              >
                {title}
              </span>
            </span>
            {columns.map((column) => (
              <span
                key={column}
                className={cn(
                  "-mx-1.5 flex h-8 min-w-0 items-center rounded px-1.5 transition-colors duration-700",
                  flashed?.has(column) && "bg-success-subtle"
                )}
              >
                {renderCell(column, review)}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};
