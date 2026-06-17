import { type FC, type ReactNode } from "react";
import { observer } from "mobx-react";
import { ClipboardList, FileSearch, Package, Repeat, Timer, Users } from "lucide-react";
import { InfoIcon } from "@plane/propel/icons";

type Props = {
  totalHours: number;
  memberCount: number;
  cycleCount?: number;
  releaseCount?: number;
  testPlanCount?: number;
  caseReviewCount?: number;
  onMembersClick?: () => void;
  onHoursClick?: () => void;
  onCyclesClick?: () => void;
  onReleasesClick?: () => void;
  onTestPlansClick?: () => void;
  onCaseReviewsClick?: () => void;
};

type TFact = {
  key: string;
  label: string;
  icon: typeof Timer;
  iconClassName: string;
  value: ReactNode;
  onClick?: () => void;
  actionIcon?: FC<{ className?: string }>;
  onActionClick?: () => void;
};

export const OverviewFactsRail: FC<Props> = observer(
  ({
    totalHours,
    memberCount,
    cycleCount = 0,
    releaseCount = 0,
    testPlanCount = 0,
    caseReviewCount = 0,
    onMembersClick,
    onHoursClick,
    onCyclesClick,
    onReleasesClick,
    onTestPlansClick,
    onCaseReviewsClick,
  }) => {
  const facts: TFact[] = [
    {
      key: "hours",
      label: "累计工时",
      icon: Timer,
      iconClassName: "text-amber-500",
      value: (
        <span className="text-sm tabular-nums text-primary">
          {totalHours}
          <span className="ml-0.5 text-xs text-placeholder">h</span>
        </span>
      ),
      actionIcon: InfoIcon,
      onActionClick: onHoursClick,
    },
    {
      key: "members",
      label: "成员",
      icon: Users,
      iconClassName: "text-[#3f76ff]",
      value: <span className="text-sm tabular-nums text-primary">{memberCount} 人</span>,
      actionIcon: InfoIcon,
      onActionClick: onMembersClick,
    },
    {
      key: "cycles",
      label: "迭代",
      icon: Repeat,
      iconClassName: "text-[#3f76ff]",
      value: <span className="text-sm tabular-nums text-primary">{cycleCount} 个</span>,
      actionIcon: InfoIcon,
      onActionClick: onCyclesClick,
    },
    {
      key: "releases",
      label: "发布",
      icon: Package,
      iconClassName: "text-emerald-500",
      value: <span className="text-sm tabular-nums text-primary">{releaseCount} 个</span>,
      actionIcon: InfoIcon,
      onActionClick: onReleasesClick,
    },
    {
      key: "test-plans",
      label: "测试计划",
      icon: ClipboardList,
      iconClassName: "text-amber-500",
      value: <span className="text-sm tabular-nums text-primary">{testPlanCount} 个</span>,
      actionIcon: InfoIcon,
      onActionClick: onTestPlansClick,
    },
    {
      key: "reviews",
      label: "评审",
      icon: FileSearch,
      iconClassName: "text-violet-500",
      value: <span className="text-sm tabular-nums text-primary">{caseReviewCount} 个</span>,
      actionIcon: InfoIcon,
      onActionClick: onCaseReviewsClick,
    },
  ];

  const renderFact = (fact: TFact) => {
    const Icon = fact.icon;
    const ActionIcon = fact.actionIcon;
    const isClickable = Boolean(fact.onClick);

    return (
      <div
        key={fact.key}
        className={`relative flex h-full min-w-0 flex-1 basis-0 items-center gap-2.5 rounded-md px-3 py-3 transition-colors${isClickable ? " cursor-pointer hover:bg-layer-1-hover" : ""}`}
        onClick={fact.onClick}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fact.onClick?.();
                }
              }
            : undefined
        }
      >
        {ActionIcon && fact.onActionClick && (
          <button
            type="button"
            className="absolute right-1.5 top-1.5 cursor-pointer rounded p-0.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
            aria-label={`查看${fact.label}详情`}
            title={`查看${fact.label}详情`}
            onClick={(e) => {
              e.stopPropagation();
              fact.onActionClick?.();
            }}
          >
            <ActionIcon className="h-3 w-3" />
          </button>
        )}
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center">
          <Icon className={`h-4 w-4 ${fact.iconClassName}`} />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[11px] leading-tight text-placeholder">{fact.label}</span>
          <div className="flex min-h-5 items-center truncate">{fact.value}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full min-h-0 flex-col rounded-lg border border-subtle bg-layer-1 p-2.5">
      <div className="flex h-full w-full flex-1 items-stretch gap-1">{facts.map(renderFact)}</div>
    </div>
  );
});
