import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { observer } from "mobx-react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { StateGroupIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectStage, TUpdateProjectStagePayload } from "@plane/types";
import { getProjectStageWorkloadTotal } from "@/hooks/store/use-project-stages";
import { useCycleFilter } from "@/hooks/store/use-cycle-filter";
import { useProjectStage } from "@/hooks/store/use-project-stage";
import { useStageTypes } from "@/hooks/store/use-stage-types";
import { useAppRouter } from "@/hooks/use-app-router";
import { ProjectStageService } from "@/services/project-stage.service";
import { useProjectStagePermissions } from "../permissions";
import { Person } from "../project-stage-cells";
import { ProjectStageDelayedTag } from "../project-stage-delayed-tag";
import type { TProjectStageFormMode } from "../project-stage-form-modal";
import { ProjectStageFormModal } from "../project-stage-form-modal";
import {
  PROJECT_STAGE_ISSUE_STATE_GROUPS,
  collectProjectStageSubtreeIds,
  delayedDays,
  getProjectStageProgress,
  sumProjectStageStateCounts,
} from "../project-stage-rows";
import { PROJECT_STAGE_STATUS_STYLE } from "../project-stage-status-cell";

const I18N = "project_stage";

const stageService = new ProjectStageService();

const Section = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-2.5 border-t border-subtle pt-4">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-13 font-semibold text-primary">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

const ProgressBar = ({ percent, className = "h-2" }: { percent: number; className?: string }) => (
  <span className={`block min-w-0 flex-1 overflow-hidden rounded-full bg-layer-3 ${className}`}>
    <span className="block h-full rounded-full bg-success-primary" style={{ width: `${percent}%` }} />
  </span>
);

const StatusPill = ({ stage, small = false }: { stage: TProjectStage; small?: boolean }) => {
  const { t } = useTranslation();
  const style = PROJECT_STAGE_STATUS_STYLE[stage.status] ?? PROJECT_STAGE_STATUS_STYLE.not_started;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${
        small ? "h-5 px-2 text-11" : "h-6 px-2.5 text-12"
      } ${style.pill}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {t(`${I18N}.status.${stage.status}`)}
    </span>
  );
};

const Value = ({ children }: { children: ReactNode }) => (
  <dd className="flex min-w-0 items-center gap-1.5 font-medium text-primary">{children}</dd>
);

const Blank = () => <span className="font-normal text-placeholder">—</span>;

/**
 * 阶段详情页右侧的信息栏：阶段属性（只读，点「编辑」开阶段编辑弹窗）、完成进度、子阶段、状态分布。
 *
 * 数据全部读项目阶段池 store：父阶段的进度与分布按子树合计（列表里也含子阶段的工作项）。
 * 完成进度 = 已完成 ÷（总数 − 已取消），口径同迭代。
 */
export const ProjectStageDetailSidebar = observer(function ProjectStageDetailSidebar({
  workspaceSlug,
  projectId,
  stageId,
}: {
  workspaceSlug: string;
  projectId: string;
  stageId: string;
}) {
  const { t } = useTranslation();
  const router = useAppRouter();
  const { getProjectStageOptions, fetchStages } = useProjectStage();
  const { stageTypes } = useStageTypes(workspaceSlug);
  const { canManage } = useProjectStagePermissions(workspaceSlug, projectId);
  const { updateFilters: updateCycleFilters } = useCycleFilter();
  const [form, setForm] = useState<TProjectStageFormMode | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const options = getProjectStageOptions(projectId);
  const stages = useMemo(() => options.map((option) => option.stage), [options]);
  const stage = stages.find((item) => item.id === stageId);
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  if (!stage) return null;

  const children = stages.filter((item) => item.parent_id === stage.id);
  const subtreeIds = collectProjectStageSubtreeIds(stages, stage.id);
  const counts = sumProjectStageStateCounts(stages, stage.id);
  const progress = getProjectStageProgress(counts);
  const cycleTotal = stages
    .filter((item) => subtreeIds.includes(item.id))
    .reduce((sum, item) => sum + (item.cycle_count ?? 0), 0);
  const ratio = stage.computed_workload_ratio ?? stage.workload_ratio;

  const openCycles = () => {
    // 迭代列表按该阶段（含子阶段）筛选后再跳，同阶段页「迭代」计数
    updateCycleFilters(projectId, { stage: subtreeIds });
    router.push(`/${workspaceSlug}/projects/${projectId}/cycles/`);
  };

  const handleUpdate = async (id: string, payload: TUpdateProjectStagePayload) => {
    setIsSubmitting(true);
    try {
      await stageService.update(workspaceSlug, projectId, id, payload);
      await fetchStages(workspaceSlug, projectId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.updated`) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside
      // 窄屏（md 以下）不显示：页头的开关在窄屏隐藏的那组控件里，展开着会把工作项挤没
      className="vertical-scrollbar hidden scrollbar-sm h-full w-[21.25rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-subtle bg-surface-1 px-6 py-5 md:flex"
      aria-label={t(`${I18N}.detail.toggle_sidebar`)}
    >
      <div className="flex items-center justify-between gap-3">
        <StatusPill stage={stage} />
        {canManage && (
          <Button variant="secondary" size="lg" onClick={() => setForm({ mode: "edit", stage })}>
            {t(`${I18N}.table.edit`)}
          </Button>
        )}
      </div>

      <div className="min-w-0">
        <h2 className="text-18 leading-7 font-semibold break-words text-primary">{stage.name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-12 text-tertiary">
          <span className="font-mono tabular-nums">{stage.code}</span>
          {stage.is_milestone && (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-layer-3 px-1.5 text-11 font-medium text-secondary">
              <Flag className="size-3" />
              {t(`${I18N}.milestone`)}
            </span>
          )}
          {stage.is_delayed && stage.end_date && <ProjectStageDelayedTag days={delayedDays(stage.end_date, today)} />}
        </div>
      </div>

      <dl className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-y-3 text-13">
        <dt className="text-tertiary">{t(`${I18N}.table.owner`)}</dt>
        <Value>
          <Person user={stage.owner_detail} unassigned={t(`${I18N}.table.unassigned`)} />
        </Value>

        <dt className="self-start text-tertiary">{t(`${I18N}.detail.plan_dates`)}</dt>
        <dd className="flex min-w-0 flex-col gap-0.5 font-medium text-primary tabular-nums">
          {stage.start_date || stage.end_date ? (
            <span className="whitespace-nowrap">
              {stage.start_date ?? "—"} → {stage.end_date ?? "—"}
            </span>
          ) : (
            <Blank />
          )}
          {stage.duration_days ? (
            <span className="text-12 font-normal text-tertiary">
              {t(`${I18N}.table.days`, { count: stage.duration_days })}
            </span>
          ) : null}
        </dd>

        <dt className="text-tertiary">{t(`${I18N}.table.actual_start`)}</dt>
        <Value>{stage.actual_start ? <span className="tabular-nums">{stage.actual_start}</span> : <Blank />}</Value>

        <dt className="text-tertiary">{t(`${I18N}.table.actual_end`)}</dt>
        <Value>{stage.actual_end ? <span className="tabular-nums">{stage.actual_end}</span> : <Blank />}</Value>

        <dt className="text-tertiary">{t(`${I18N}.form.ratio`)}</dt>
        <Value>
          {ratio !== null && ratio !== undefined ? (
            <>
              <span className="tabular-nums">{Number(ratio)}%</span>
              {children.length > 0 && (
                <span className="text-12 font-normal text-tertiary">{t(`${I18N}.detail.ratio_children_sum`)}</span>
              )}
            </>
          ) : (
            <Blank />
          )}
        </Value>

        <dt className="text-tertiary">{t(`${I18N}.table.cycle_count`)}</dt>
        <Value>
          {cycleTotal > 0 ? (
            <button type="button" className="text-accent-primary hover:underline" onClick={openCycles}>
              {t(`${I18N}.detail.count_unit`, { count: cycleTotal })}
            </button>
          ) : (
            <Blank />
          )}
        </Value>
      </dl>

      <Section
        title={t(`${I18N}.detail.progress`)}
        aside={
          <span className="text-12 text-tertiary">
            <strong className="text-18 font-semibold text-primary tabular-nums">{progress.percent}</strong>%
          </span>
        }
      >
        <ProgressBar percent={progress.percent} />
        <div className="flex justify-between gap-3 text-12 text-tertiary">
          <span>{t(`${I18N}.detail.completed_of`, { completed: progress.completed, total: progress.effective })}</span>
          {progress.cancelled > 0 && (
            <span>{t(`${I18N}.detail.cancelled_excluded`, { count: progress.cancelled })}</span>
          )}
        </div>
      </Section>

      {children.length > 0 && (
        <Section
          title={t(`${I18N}.detail.children`)}
          aside={
            <span className="text-12 text-tertiary">{t(`${I18N}.detail.count_unit`, { count: children.length })}</span>
          }
        >
          <div className="flex flex-col">
            {children.map((child) => {
              const childProgress = getProjectStageProgress(sumProjectStageStateCounts(stages, child.id));
              return (
                <Link
                  key={child.id}
                  href={`/${workspaceSlug}/projects/${projectId}/stages/${child.id}`}
                  className="group/child grid h-7 grid-cols-[minmax(0,1fr)_auto_4.5rem_2.75rem] items-center gap-2.5 text-13"
                >
                  <span className="truncate font-medium text-accent-primary group-hover/child:underline" title={child.name}>
                    {child.name}
                  </span>
                  <StatusPill stage={child} small />
                  <ProgressBar percent={childProgress.percent} className="h-1.5" />
                  <span className="text-right text-12 text-secondary tabular-nums">
                    {childProgress.completed}/{childProgress.effective}
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <Section
        title={t(`${I18N}.detail.distribution`)}
        aside={<span className="text-12 text-tertiary">{t(`${I18N}.detail.issue_total`, { count: progress.total })}</span>}
      >
        {progress.total > 0 && (
          <div className="flex h-2 gap-0.5" role="img" aria-label={t(`${I18N}.detail.distribution`)}>
            {PROJECT_STAGE_ISSUE_STATE_GROUPS.filter((group) => counts[group] > 0).map((group) => (
              <span
                key={group}
                className="block h-full min-w-1 rounded-xs"
                style={{ flexGrow: counts[group], flexBasis: 0, backgroundColor: STATE_GROUPS[group].color }}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-12">
          {PROJECT_STAGE_ISSUE_STATE_GROUPS.map((group) => (
            <span key={group} className="flex min-w-0 items-center gap-1.5 text-secondary">
              <StateGroupIcon stateGroup={group} />
              <span className="truncate">{STATE_GROUPS[group].label}</span>
              <b className="ml-auto font-semibold text-primary tabular-nums">{counts[group]}</b>
            </span>
          ))}
        </div>
      </Section>

      <ProjectStageFormModal
        isOpen={form !== null}
        form={form}
        projectId={projectId}
        stages={stages}
        stageTypes={stageTypes}
        workloadTotal={getProjectStageWorkloadTotal(stages)}
        isSubmitting={isSubmitting}
        onClose={() => setForm(null)}
        onCreate={async () => undefined}
        onUpdate={handleUpdate}
      />
    </aside>
  );
});
