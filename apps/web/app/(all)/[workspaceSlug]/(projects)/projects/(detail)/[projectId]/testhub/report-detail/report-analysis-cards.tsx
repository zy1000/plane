import { CheckCircle2, Target, ListChecks, Bug } from "lucide-react";
import type { TReportAnalysis } from "@/services/qa/report.service";

type Props = {
  analysis: TReportAnalysis | null;
};

type TMetric = {
  key: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
};

export const ReportAnalysisCards = ({ analysis }: Props) => {
  const planCount = analysis?.plan_count ?? 0;
  const caseCount = analysis?.case_count ?? 0;
  const overallPassRate = analysis?.overall_pass_rate ?? 0;
  const completionRate = analysis?.completion_rate ?? 0;
  const defectCount = analysis?.pass_rate?.失败 ?? 0;

  const metrics: TMetric[] = [
    {
      key: "pass_rate",
      label: "通过率",
      value: `${Number(overallPassRate).toFixed(2)}%`,
      icon: <Target className="size-5" />,
      iconBg: "bg-green-500/10",
      iconColor: "text-green-600",
    },
    {
      key: "completion",
      label: "执行完成率",
      value: `${Number(completionRate).toFixed(2)}%`,
      icon: <CheckCircle2 className="size-5" />,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
    },
    {
      key: "plan_count",
      label: "计划个数",
      value: `${planCount}`,
      icon: <ListChecks className="size-5" />,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600",
    },
    {
      key: "case_count",
      label: "用例个数",
      value: `${caseCount}`,
      icon: <ListChecks className="size-5" />,
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-600",
    },
    {
      key: "defect_count",
      label: "缺陷总数",
      value: `${defectCount}`,
      icon: <Bug className="size-5" />,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {metrics.map((m) => (
        <div
          key={m.key}
          className="rounded-lg border border-subtle bg-surface-1 p-4 transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-secondary">{m.label}</span>
            <span className={`inline-flex size-8 items-center justify-center rounded-md ${m.iconBg} ${m.iconColor}`}>
              {m.icon}
            </span>
          </div>
          <div className="mt-3 text-2xl font-semibold text-primary">{m.value}</div>
        </div>
      ))}
    </div>
  );
};
