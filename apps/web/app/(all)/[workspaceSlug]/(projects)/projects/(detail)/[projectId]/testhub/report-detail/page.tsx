"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Share2, FileDown } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Tag } from "antd";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import UnauthorizedImg from "@/app/assets/auth/unauthorized.svg?url";
import { useReportDetail } from "./use-report-detail";
import { ReportAnalysisCards } from "./report-analysis-cards";
import { ReportExecutionChart } from "./report-execution-chart";
import { ReportSummaryEditor } from "./report-summary-editor";
import { ReportCaseTable } from "./report-case-table";

const REPORT_TYPE_COLOR: Record<string, string> = {
  计划报告: "blue",
  对外报告: "gold",
};

export default function ReportDetailPage() {
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const reportId = searchParams.get("reportId");
  const reportName = searchParams.get("name") || (typeof window !== "undefined" ? sessionStorage.getItem("selectedReportName") : "") || "";

  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = workspaceSlug ? getWorkspaceBySlug(workspaceSlug as string)?.id : undefined;

  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    String(workspaceSlug || ""),
    String(projectId || "")
  );

  const {
    detail,
    analysis,
    cases,
    caseCount,
    loading,
    error,
    fetchCases,
    saveSummary,
  } = useReportDetail(String(workspaceSlug || ""), String(projectId || ""), reportId);

  const canView = permissionsFetched && hasPermission("qa.plan.view");

  const handleBack = () => {
    const ws = (workspaceSlug as string) || "";
    const pid = (projectId as string) || "";
    router.push(`/${ws}/projects/${pid}/testhub/reports`);
  };

  if (!permissionsFetched) {
    return (
      <div className="flex h-full w-full min-h-[50vh] items-center justify-center">
        <div className="text-secondary">加载中...</div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex h-full w-full min-h-[50vh] flex-col items-center justify-center gap-y-5 text-center">
        <div className="h-44 w-72">
          <img src={UnauthorizedImg} className="h-[176px] w-[288px] object-contain" alt="unauthorized" />
        </div>
        <h1 className="text-xl font-medium text-primary">您没有查看此页面的权限</h1>
      </div>
    );
  }

  if (!reportId) {
    return (
      <div className="flex h-full w-full min-h-[50vh] items-center justify-center text-secondary">
        缺少报告 ID
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-subtle bg-surface-1 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleBack} className="!px-2">
            <ArrowLeft className="size-4" />
          </Button>
          <h2 className="truncate text-base font-semibold text-primary">{detail?.name || reportName}</h2>
          {detail?.report_type && (
            <Tag color={REPORT_TYPE_COLOR[detail.report_type] || "default"}>{detail.report_type}</Tag>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" className="!gap-1.5">
            <Share2 className="size-3.5" />
            分享
          </Button>
          <Button variant="secondary" size="sm" className="!gap-1.5" disabled>
            <FileDown className="size-3.5" />
            导出 PDF
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && !detail ? (
          <div className="flex h-full min-h-[40vh] items-center justify-center text-secondary">加载中...</div>
        ) : error && !detail ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : (
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
            {/* 报告分析 */}
            <section>
              <SectionTitle title="报告分析" />
              <ReportAnalysisCards analysis={analysis} />
            </section>

            {/* 执行分析 */}
            <section>
              <SectionTitle title="执行分析" />
              <ReportExecutionChart analysis={analysis} />
            </section>

            {/* 报告总结 */}
            <section>
              <SectionTitle title="报告总结" />
              <ReportSummaryEditor
                workspaceId={workspaceId ?? ""}
                workspaceSlug={String(workspaceSlug || "")}
                projectId={String(projectId || "")}
                reportId={reportId}
                summaryHtml={detail?.summary_html ?? ""}
                onSave={saveSummary}
              />
            </section>

            {/* 执行明细 */}
            <section>
              <SectionTitle title="执行明细" />
              <ReportCaseTable
                rows={cases}
                count={caseCount}
                loading={loading}
                onPageChange={(p, s) => fetchCases(p, s)}
                onSearch={(name) => fetchCases(1, 20, { name })}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

const SectionTitle = ({ title }: { title: string }) => (
  <div className="mb-2 flex items-center gap-2">
    <span className="h-4 w-1 rounded-full bg-accent-primary" />
    <h3 className="text-sm font-semibold text-primary">{title}</h3>
  </div>
);
