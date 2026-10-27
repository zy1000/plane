import { DropdownIcon, PlusIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";

/**
 * 详情里可折叠区块的标题行（附件、关联缺陷）：8px 三角、13 号加粗标题 + 12 号灰色计数，展开时右侧「+」。
 * 字号与右栏卡片标题、活动标题同一档。
 *
 * 折叠按钮和「+」是两个并排的按钮，不套在一起（工作项那版是按钮套按钮）。
 * 外层要给区块 `-mx-2.5`，让三角对齐正文左边。
 */
export const RiskCollapsibleHeader = ({
  title,
  count,
  isOpen,
  onToggle,
  actionLabel,
  onAction,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  /** 「+」的提示文字；不传 onAction 就不出「+」（访客只读） */
  actionLabel: string;
  onAction?: () => void;
}) => (
  <div className="flex h-10 items-center gap-2.5 px-2.5">
    <button type="button" aria-expanded={isOpen} onClick={onToggle} className="flex min-w-0 items-center gap-2.5">
      <DropdownIcon
        className={cn("size-2 text-tertiary transition-transform duration-300 hover:text-secondary", !isOpen && "-rotate-90")}
      />
      <span className="text-13 font-semibold text-secondary">{title}</span>
      <span className="text-12 text-tertiary tabular-nums">{count}</span>
    </button>
    {onAction && isOpen && (
      <Tooltip tooltipContent={actionLabel} position="top">
        <button
          type="button"
          aria-label={actionLabel}
          onClick={onAction}
          className="ml-auto grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
        >
          <PlusIcon className="size-4" />
        </button>
      </Tooltip>
    )}
  </div>
);
