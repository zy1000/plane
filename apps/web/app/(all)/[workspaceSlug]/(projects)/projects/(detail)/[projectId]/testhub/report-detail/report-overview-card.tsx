import { cn } from "@plane/utils";
import type { TReportAnalysis } from "@/services/qa/report.service";
import { EXECUTION_RESULT_META } from "./execution-result";
import { ReportCard, ReportCardHeader } from "./report-card";

type Props = {
  analysis: TReportAnalysis | null;
  /** 右上角「数据截至」 */
  asOf?: string;
};

const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R;

const Ring = ({ pct, className }: { pct: number; className: string }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 84 84" className={cn("size-[84px] shrink-0", className)} aria-hidden>
      <circle cx="42" cy="42" r={RING_R} fill="none" stroke="var(--bg-layer-3)" strokeWidth="7" />
      <circle
        cx="42"
        cy="42"
        r={RING_R}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(RING_C * clamped) / 100} ${RING_C}`}
        transform="rotate(-90 42 42)"
      />
    </svg>
  );
};

const RingStat = ({
  label,
  pct,
  sub,
  ringClass,
}: {
  label: string;
  pct: number;
  sub: string;
  ringClass: string;
}) => (
  <div className="flex items-center gap-4">
    <Ring pct={pct} className={ringClass} />
    <div className="flex flex-col gap-0.5">
      <span className="text-13 font-medium text-secondary">{label}</span>
      <span className="text-[30px] font-semibold leading-[1.1] tracking-tight text-primary tabular-nums">
        {pct.toFixed(2)}
        <small className="ml-px text-base font-medium text-secondary">%</small>
      </span>
      <span className="text-12 text-tertiary tabular-nums">{sub}</span>
    </div>
  </div>
);

const CountStat = ({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: number;
  sub: string;
  danger?: boolean;
}) => (
  <div className="flex flex-col gap-0.5 border-l-2 border-subtle pl-4">
    <span className="text-12 text-tertiary">{label}</span>
    <span
      className={`text-2xl font-semibold leading-tight tracking-tight tabular-nums ${danger ? "text-danger-primary" : "text-primary"}`}
    >
      {value}
    </span>
    <span className="text-12 text-tertiary">{sub}</span>
  </div>
);

/** 执行概览：通过率 / 完成率两枚环 + 三个计数 + 五态堆叠条与图例 */
export const ReportOverviewCard = ({ analysis, asOf }: Props) => {
  const passRate = analysis?.pass_rate ?? {};
  const caseCount = analysis?.case_count ?? 0;
  const successCount = analysis?.success_count ?? 0;
  const notStarted = Number(passRate["未执行"] || 0);
  const executed = Math.max(0, caseCount - notStarted);
  const planCount = analysis?.plan_count ?? 0;
  const notStartedPlans = analysis?.not_started_plan_count ?? 0;
  const distinctCases = analysis?.distinct_case_count ?? caseCount;
  const defectCount = analysis?.defect_count ?? 0;
  const highDefects = analysis?.high_priority_defect_count ?? 0;
  const total = EXECUTION_RESULT_META.reduce((sum, m) => sum + Number(passRate[m.key] || 0), 0);

  return (
    <ReportCard>
      <ReportCardHeader title="执行概览" right={asOf ? `数据截至 ${asOf}` : undefined} />
      <div className="@container flex flex-col gap-5 px-5 pb-5 pt-1.5">
        {/* 按卡片自己的宽度决定横排还是堆叠：右侧挂着计划卡时 1280 屏只剩 600 出头，横排会叠字 */}
        <div className="grid grid-cols-1 items-center gap-x-10 gap-y-5 pt-3 @[480px]:grid-cols-2 @[760px]:grid-cols-[auto_auto_1px_minmax(0,1fr)]">
          <RingStat
            label="通过率"
            pct={Number(analysis?.overall_pass_rate ?? 0)}
            sub={`成功 ${successCount} / ${caseCount}`}
            ringClass="text-success-primary"
          />
          <RingStat
            label="执行完成率"
            pct={Number(analysis?.completion_rate ?? 0)}
            sub={`已执行 ${executed} / ${caseCount}`}
            ringClass="text-accent-primary"
          />
          <div className="hidden h-[72px] w-px bg-subtle @[760px]:block" />
          <div className="grid grid-cols-3 gap-3 @[480px]:col-span-2 @[760px]:col-span-1">
            <CountStat
              label="测试计划"
              value={planCount}
              sub={notStartedPlans > 0 ? `含 ${notStartedPlans} 个未开始` : "全部已开始"}
            />
            <CountStat
              label="用例"
              value={caseCount}
              sub={distinctCases !== caseCount ? `去重后 ${distinctCases} 条` : "无重复用例"}
            />
            <CountStat
              label="缺陷"
              value={defectCount}
              sub={highDefects > 0 ? `${highDefects} 条高优先级` : "无高优先级"}
              danger={defectCount > 0}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2 text-13 font-medium text-secondary">
            执行结果分布 <span className="text-12 font-normal text-tertiary">按用例数</span>
          </div>
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-layer-3">
            {total > 0 ? (
              EXECUTION_RESULT_META.filter((m) => Number(passRate[m.key] || 0) > 0).map((m) => (
                <div
                  key={m.key}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(Number(passRate[m.key] || 0) / total) * 100}%`, background: m.color }}
                  title={`${m.label} ${Number(passRate[m.key] || 0)}`}
                />
              ))
            ) : (
              <div className="h-full w-full" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 @[520px]:grid-cols-3 @[860px]:grid-cols-5">
            {EXECUTION_RESULT_META.map((m) => {
              const count = Number(passRate[m.key] || 0);
              const pct = total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";
              return (
                <div key={m.key} className="flex min-w-0 items-center gap-2 rounded-[7px] bg-surface-2 px-2.5 py-2 text-13">
                  <span className={cn("size-2.5 shrink-0 rounded-[3px]", m.dotClass)} />
                  <span className="whitespace-nowrap text-secondary">{m.label}</span>
                  <b className="ml-auto whitespace-nowrap font-semibold text-primary tabular-nums">
                    {count}
                    <span className="ml-1 text-12 font-normal text-tertiary">{pct}%</span>
                  </b>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ReportCard>
  );
};
