import type { FC } from "react";
import { observer } from "mobx-react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@plane/propel/button";
import { useUser } from "@/hooks/store/user";
import { useProjectDefectAnalytics } from "@/hooks/store/use-project-defect-analytics";
import { DefectDistributionCard } from "./defect-distribution-card";
import type { TDistributionItem } from "./defect-distribution-card";
import { DefectPersonalPanel } from "./defect-personal-panel";
import { DefectSummaryCards } from "./defect-summary-cards";
import { DefectTrendChart } from "./defect-trend-chart";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  backlog: { label: "待办", color: "#c2c8d1" },
  unstarted: { label: "未开始", color: "#8b94a3" },
  started: { label: "进行中", color: "#3f76ff" },
  completed: { label: "已完成", color: "#16a34a" },
  cancelled: { label: "已取消", color: "#9aa4b2" },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  urgent: { label: "紧急", color: "#ef4444" },
  high: { label: "高", color: "#f97316" },
  medium: { label: "中", color: "#eab308" },
  low: { label: "低", color: "#3f76ff" },
  none: { label: "无", color: "#94a3b8" },
};

export const DefectOverview: FC<Props> = observer(({ workspaceSlug, projectId }) => {
  const analytics = useProjectDefectAnalytics(workspaceSlug, projectId);
  const { data: currentUser } = useUser();

  const currentUserName =
    currentUser?.display_name ||
    [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(" ") ||
    currentUser?.email ||
    "我";

  const statusItems: TDistributionItem[] = analytics.statusDistribution.map((slice) => ({
    key: slice.group,
    label: STATUS_META[slice.group]?.label ?? slice.group,
    color: STATUS_META[slice.group]?.color ?? "#94a3b8",
    count: slice.count,
  }));

  const priorityItems: TDistributionItem[] = analytics.priorityDistribution.map((slice) => ({
    key: slice.priority,
    label: PRIORITY_META[slice.priority]?.label ?? slice.priority,
    color: PRIORITY_META[slice.priority]?.color ?? "#94a3b8",
    count: slice.count,
  }));

  return (
    <div className="flex flex-col gap-5 px-4 py-5 lg:px-6">
      {analytics.error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-danger-primary">
            <AlertTriangle className="h-4 w-4" />
            统计数据加载失败，请稍后重试。
          </div>
          <Button variant="secondary" size="sm" onClick={analytics.refetch}>
            重试
          </Button>
        </div>
      ) : null}

      <DefectSummaryCards
        isLoading={analytics.isLoading}
        totalDefects={analytics.summary.total}
        pendingDefects={analytics.summary.pending}
        resolvedDefects={analytics.summary.resolved}
        pendingRatio={analytics.pendingRatio}
        overdueDefects={analytics.summary.overdue}
        dueSoonDefects={analytics.summary.due_soon}
      />

      <DefectPersonalPanel
        isLoading={analytics.isLoading}
        currentUserName={currentUserName}
        myDefectCount={analytics.myDefectCount}
        myDefectRatio={analytics.myDefectRatio}
        totalDefects={analytics.summary.total}
        topAssignees={analytics.topAssignees}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DefectDistributionCard title="缺陷状态分布" isLoading={analytics.isLoading} items={statusItems} />
        <DefectDistributionCard title="缺陷优先级分布" isLoading={analytics.isLoading} items={priorityItems} />
      </div>

      <DefectTrendChart isLoading={analytics.isLoading} trend={analytics.trend} />
    </div>
  );
});
