"use client";

import { useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { Button } from "@plane/propel/button";
import { message, Tag } from "antd";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import UnauthorizedImg from "@/app/assets/auth/unauthorized.svg?url";
import { useReportDetail } from "./use-report-detail";
import { ReportAnalysisCards } from "./report-analysis-cards";
import { ReportExecutionChart } from "./report-execution-chart";
import { ReportSummaryEditor } from "./report-summary-editor";
import { ReportCaseTable } from "./report-case-table";
import { exportReportAsPdf } from "./export-report-pdf";

const REPORT_TYPE_COLOR: Record<string, string> = {
  计划报告: "blue",
  对外报告: "gold",
};

const QA_REPORT_VIEW_PERMISSION_KEY = "qa.report.view" as const;
const QA_REPORT_EDIT_PERMISSION_KEY = "qa.report.edit" as const;
const QA_REPORT_EXPORT_PERMISSION_KEY = "qa.report.export" as const;

const waitForPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

export default function ReportDetailPage() {
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const reportId = searchParams.get("reportId");
  const reportName =
    searchParams.get("name") ||
    (typeof window !== "undefined" ? sessionStorage.getItem("selectedReportName") : "") ||
    "";
  const [exporting, setExporting] = useState(false);

  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = workspaceSlug ? getWorkspaceBySlug(workspaceSlug as string)?.id : undefined;

  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    String(workspaceSlug || ""),
    String(projectId || "")
  );
  const canView = permissionsFetched && hasPermission(QA_REPORT_VIEW_PERMISSION_KEY);
  const canEditReport = permissionsFetched && hasPermission(QA_REPORT_EDIT_PERMISSION_KEY);
  const canExportReport = permissionsFetched && hasPermission(QA_REPORT_EXPORT_PERMISSION_KEY);

  const { detail, analysis, cases, caseCount, loading, error, fetchCases, fetchAllCases, saveSummary } =
    useReportDetail(String(workspaceSlug || ""), String(projectId || ""), canView ? reportId : null);

  const reportTitle = detail?.name || reportName || "测试报告";

  const handleBack = () => {
    const ws = (workspaceSlug as string) || "";
    const pid = (projectId as string) || "";
    router.push(`/${ws}/projects/${pid}/testhub/reports`);
  };

  const handleExportPdf = async () => {
    if (!canExportReport) return;
    if (!reportId || !detail || exporting) return;

    setExporting(true);
    try {
      await waitForPaint();
      const allCases = await fetchAllCases();
      await waitForPaint();
      await exportReportAsPdf({
        detail,
        analysis,
        rows: allCases,
        filenameBase: reportTitle || `test-report-${reportId}`,
      });
    } catch (e: any) {
      message.error(e?.message || "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const handleSaveSummary = async (summaryHtml: string, summaryJson: unknown) => {
    if (!canEditReport) return;
    await saveSummary(summaryHtml, summaryJson);
  };

  if (!permissionsFetched) {
    return (
      <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
        <div className="text-secondary">加载中...</div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-y-5 text-center">
        <div className="h-44 w-72">
          <img src={UnauthorizedImg} className="h-[176px] w-[288px] object-contain" alt="unauthorized" />
        </div>
        <h1 className="text-xl font-medium text-primary">您没有查看此页面的权限</h1>
      </div>
    );
  }

  if (!reportId) {
    return (
      <div className="flex h-full min-h-[50vh] w-full items-center justify-center text-secondary">缺少报告 ID</div>
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
          <Button
            variant="secondary"
            size="sm"
            className="!gap-1.5"
            onClick={handleExportPdf}
            loading={exporting}
            disabled={exporting || loading || !detail || !canExportReport}
          >
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
          <div className="border-red-200 bg-red-50 text-red-800 rounded-md border p-4 text-sm">{error}</div>
        ) : (
          <div className="flex w-full flex-col gap-4">
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
                canEdit={canEditReport}
                onSave={handleSaveSummary}
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
