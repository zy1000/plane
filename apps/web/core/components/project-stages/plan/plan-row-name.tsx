import type { ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { EIconSize } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ChevronDownIcon, CycleIcon, StateGroupIcon } from "@plane/propel/icons";
import type { TProjectStage } from "@plane/types";
import { cn } from "@plane/utils";
import { useUser } from "@/hooks/store/user";
import { ProjectStageDelayedTag } from "../project-stage-delayed-tag";
import { delayedDays } from "../project-stage-rows";
import { formatRange, fromDay } from "./plan-scale";
import type { TPlanOwnerChange } from "./plan-owner-cell";
import { PlanOwnerCell } from "./plan-owner-cell";
import type { TPlanDrag } from "./plan-row-bars";
import { PLAN_CYCLE_COLORS } from "./plan-row-bars";
import type { TPlanRow } from "./plan-tree";

const I18N = "project_stage.plan";

/** 左栏四列：名称 / 负责人 / 计划 / 周期（宽度和表头一致） */
export const PLAN_LEFT_COLUMNS = { owner: 52, plan: 100, duration: 60 };

const Pill = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-layer-3 px-2 text-11 whitespace-nowrap text-secondary">
    {children}
  </span>
);

const DashedSquare = () => <span className="size-4 shrink-0 rounded-[4px] border-[1.5px] border-dashed border-strong" />;

export const PlanRowName = observer(function PlanRowName({
  row,
  stagesById,
  range,
  today,
  canEdit,
  projectId,
  projectIdentifier,
  cycleHref,
  issueHref,
  onToggle,
  onShowAll,
  onEditStage,
  onChangeOwner,
}: {
  row: TPlanRow;
  stagesById: Map<string, TProjectStage>;
  /** 阶段 / 迭代 / 工作项行当前该显示的起止（拖动中、提交中用新值）；没排期是 null */
  range: { start: number; end: number } | null;
  today: string;
  canEdit: TPlanDrag["canEdit"];
  projectId: string;
  projectIdentifier: string;
  cycleHref: (cycleId: string) => string;
  issueHref: (sequenceId: number, issueId: string) => string;
  onToggle: (rowId: string) => void;
  onShowAll: (nodeId: string) => void;
  onEditStage: (stage: TProjectStage) => void;
  onChangeOwner: (change: TPlanOwnerChange) => void;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();

  const leafLike = row.kind === "issue" || row.kind === "more";
  const indent = 16 + row.depth * 20 + (leafLike ? 25 : 0);
  const stageLevel = row.kind === "stage" || row.kind === "group";

  let plan: { start: string; end: string } | null = null;
  let duration: number | null = null;
  let unscheduled = false;
  // 没排期的阶段也可能填了周期
  if (row.kind === "stage" && !range) duration = row.stage.duration_days;
  if (row.kind === "stage" || row.kind === "cycle" || row.kind === "issue") {
    if (range) {
      plan = { start: fromDay(range.start), end: fromDay(range.end) };
      duration = range.end - range.start + 1;
    } else {
      unscheduled = true;
    }
  }

  const counts = (cycleCount: number, issueCount: number) =>
    [
      cycleCount > 0 ? t(`${I18N}.cycle_count`, { count: cycleCount }) : null,
      issueCount > 0 ? t(`${I18N}.issue_count`, { count: issueCount }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const name = (() => {
    switch (row.kind) {
      case "stage": {
        const label = <span className="truncate">{row.stage.name}</span>;
        return canEdit.stage ? (
          <button
            type="button"
            onClick={() => onEditStage(row.stage)}
            className="min-w-0 truncate text-left text-14 font-semibold text-primary hover:underline"
          >
            {label}
          </button>
        ) : (
          <span className="min-w-0 truncate text-14 font-semibold text-primary">{label}</span>
        );
      }
      case "group":
        return <span className="min-w-0 truncate text-14 font-semibold text-secondary">{t(`${I18N}.no_stage`)}</span>;
      case "cycle":
        return (
          <Link href={cycleHref(row.cycle.id)} className="min-w-0 truncate text-13 font-medium text-primary hover:underline">
            {row.cycle.name}
          </Link>
        );
      case "nocycle":
        return <span className="min-w-0 truncate text-13 font-medium text-secondary">{t(`${I18N}.no_cycle`)}</span>;
      case "issue":
        return (
          <Link
            href={issueHref(row.issue.sequence_id, row.issue.id)}
            className="flex min-w-0 items-center gap-[7px] text-13 text-primary hover:underline"
          >
            <span className="shrink-0 text-12 text-tertiary tabular-nums">
              {projectIdentifier}-{row.issue.sequence_id}
            </span>
            <span className="truncate">{row.issue.name}</span>
          </Link>
        );
      case "more":
        return (
          <button
            type="button"
            onClick={() => onShowAll(row.nodeId)}
            className="text-13 font-medium text-accent-primary hover:underline"
          >
            {t(`${I18N}.show_all`, { count: row.total })}
          </button>
        );
    }
  })();

  return (
    <div
      className={cn(
        "sticky left-0 z-[4] flex shrink-0 items-center border-r border-subtle",
        stageLevel ? "bg-layer-1" : "bg-surface-1"
      )}
      style={{ width: 500 }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-[7px] pr-2" style={{ paddingLeft: indent }}>
        {row.hasToggle ? (
          <button
            type="button"
            aria-label={row.expanded ? t(`${I18N}.collapse`) : t(`${I18N}.expand`)}
            onClick={() => onToggle(row.id)}
            className="grid size-[18px] shrink-0 place-items-center rounded text-tertiary hover:bg-layer-3"
          >
            <ChevronDownIcon className={cn("size-4 transition-transform", !row.expanded && "-rotate-90")} />
          </button>
        ) : (
          !leafLike && <span className="w-[18px] shrink-0" />
        )}
        {row.kind === "cycle" && <CycleIcon className="size-4 shrink-0" color={PLAN_CYCLE_COLORS.icon} />}
        {(row.kind === "nocycle" || row.kind === "group") && <DashedSquare />}
        {row.kind === "issue" && <StateGroupIcon stateGroup={row.issue.state_group} size={EIconSize.LG} />}
        {name}
        {row.kind === "issue" && row.ownStageId && (
          <span
            title={t(`${I18N}.own_stage_tooltip`)}
            className="inline-flex h-5 shrink-0 items-center rounded-[5px] border border-subtle px-1.5 text-11 whitespace-nowrap text-secondary"
          >
            {t(`${I18N}.own_stage`, { name: stagesById.get(row.ownStageId)?.name ?? "" })}
          </span>
        )}
        {(row.kind === "stage" || row.kind === "group") && row.showCounts && (
          <Pill>{counts(row.cycleCount, row.issueCount)}</Pill>
        )}
        {(row.kind === "cycle" || row.kind === "nocycle") && !row.expanded && row.issueCount > 0 && (
          <Pill>{t(`${I18N}.issue_count`, { count: row.issueCount })}</Pill>
        )}
        {row.kind === "stage" && row.stage.is_delayed && row.stage.end_date && (
          <ProjectStageDelayedTag days={delayedDays(row.stage.end_date, today)} />
        )}
      </div>
      <div className="flex shrink-0 justify-center" style={{ width: PLAN_LEFT_COLUMNS.owner }}>
        {row.kind === "stage" && (
          <PlanOwnerCell
            projectId={projectId}
            size="md"
            multiple={false}
            editable={canEdit.stage}
            value={row.stage.owner_id}
            // 再点一次当前负责人就是取消指定（同阶段表格）
            onChange={(next) =>
              onChangeOwner({ kind: "stage", stageId: row.stage.id, ownerId: next === row.stage.owner_id ? null : next })
            }
          />
        )}
        {row.kind === "cycle" && (
          <PlanOwnerCell
            projectId={projectId}
            size="md"
            multiple={false}
            // 后端规则：只有当前负责人能把迭代交给别人（同迭代列表页），别人点了也只会报错
            editable={canEdit.cycle && currentUser?.id === row.cycle.owned_by_id}
            value={row.cycle.owned_by_id}
            onChange={(next) => {
              if (next && next !== row.cycle.owned_by_id) onChangeOwner({ kind: "cycle", cycleId: row.cycle.id, ownerId: next });
            }}
          />
        )}
        {row.kind === "issue" && (
          <PlanOwnerCell
            projectId={projectId}
            size={20}
            multiple
            editable={canEdit.issue}
            value={row.issue.assignee_ids}
            onChange={(next) => onChangeOwner({ kind: "issue", issueId: row.issue.id, assigneeIds: next })}
          />
        )}
      </div>
      <div
        className={cn("shrink-0 pl-2 text-12 whitespace-nowrap tabular-nums", plan ? "text-secondary" : "text-tertiary")}
        style={{ width: PLAN_LEFT_COLUMNS.plan }}
      >
        {plan ? formatRange(plan.start, plan.end) : unscheduled ? t(`${I18N}.unscheduled`) : ""}
      </div>
      <div
        className="shrink-0 pr-5 text-right text-12 whitespace-nowrap text-secondary tabular-nums"
        style={{ width: PLAN_LEFT_COLUMNS.duration }}
      >
        {duration ? t(`${I18N}.days`, { count: duration }) : row.kind === "stage" || row.kind === "cycle" || row.kind === "issue" ? "—" : ""}
      </div>
    </div>
  );
});
