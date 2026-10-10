"use client";

import { useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Folder, ListChecks, Pencil } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { message } from "antd";
import { formatCNDateTime } from "@/components/qa/cases/util";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import UnauthorizedImg from "@/app/assets/auth/unauthorized.svg?url";
import type { TReportDetail, TReportPlanStat } from "@/services/qa/report.service";
import { tmProjectBasePath } from "../route-helpers";
import { useReportDetail } from "./use-report-detail";
import { ReportOverviewCard } from "./report-overview-card";
import { ReportPlansCard } from "./report-plans-card";
import { ReportSummaryEditor, type ReportSummaryEditorHandle } from "./report-summary-editor";
import { ReportCaseTable } from "./report-case-table";
import { ReportCard, ReportCardHeader } from "./report-card";
import { exportReportAsPdf } from "./export-report-pdf";

const REPORT_TYPE_CLASS: Record<string, string> = {
  计划报告: "bg-accent-subtle text-accent-primary",
  对外报告: "bg-warning-subtle text-warning-primary",
};

const QA_REPORT_VIEW_PERMISSION_KEY = "qa.report.view" as const;
const QA_REPORT_EDIT_PERMISSION_KEY = "qa.report.edit" as const;
const QA_REPORT_EXPORT_PERMISSION_KEY = "qa.report.export" as const;

const waitForPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const MetaDot = () => <span className="mx-1 size-[3px] rounded-full bg-strong" />;

/** 页头第二行：所属模块 · N 个测试计划 · 创建人 · 创建 / 更新时间 */
const ReportMeta = ({ detail, planCount }: { detail: TReportDetail; planCount: number }) => {
  const { getUserDetails } = useMember();
  const creator = detail.created_by ? getUserDetails(detail.created_by) : undefined;
  const creatorName = creator?.display_name || detail.created_by_detail?.display_name || "";
  const creatorAvatar = creator?.avatar_url || detail.created_by_detail?.avatar || "";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-13 text-tertiary">
      {detail.module_name && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <Folder className="size-[13px] text-placeholder" />
            {detail.module_name}
          </span>
          <MetaDot />
        </>
      )}
      <span className="inline-flex items-center gap-1.5">
        <ListChecks className="size-[13px] text-placeholder" />
        <b className="font-medium text-secondary">{planCount}</b> 个测试计划
      </span>
      {creatorName && (
        <>
          <MetaDot />
          <span className="inline-flex items-center gap-1.5">
            <Avatar
              src={getFileURL(creatorAvatar)}
              name={creatorName}
              size="sm"
              fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(creator)}
            />
            {creatorName}
          </span>
        </>
      )}
      <MetaDot />
      <span>创建于 {formatCNDateTime(detail.created_at).slice(0, 10)}</span>
      <MetaDot />
      <span>更新于 {formatCNDateTime(detail.updated_at).slice(0, 16)}</span>
    </div>
  );
};

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
  const summaryRef = useRef<ReportSummaryEditorHandle>(null);

  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = workspaceSlug ? getWorkspaceBySlug(workspaceSlug as string)?.id : undefined;

  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    String(workspaceSlug || ""),
    String(projectId || "")
  );
  const canView = permissionsFetched && hasPermission(QA_REPORT_VIEW_PERMISSION_KEY);
  const canEditReport = permissionsFetched && hasPermission(QA_REPORT_EDIT_PERMISSION_KEY);
  const canExportReport = permissionsFetched && hasPermission(QA_REPORT_EXPORT_PERMISSION_KEY);

  const {
    detail,
    analysis,
    analysisFetchedAt,
    cases,
    caseCount,
    loading,
    error,
    fetchCases,
    fetchAllCases,
    saveSummary,
  } = useReportDetail(String(workspaceSlug || ""), String(projectId || ""), canView ? reportId : null);

  const reportTitle = detail?.name || reportName || "测试报告";
  const basePath = tmProjectBasePath(String(workspaceSlug || ""), String(projectId || ""));

  const handleBack = () => {
    router.push(`${basePath}/reports`);
  };

  const handleOpenPlan = (plan: TReportPlanStat) => {
    try {
      sessionStorage.setItem("selectedPlanName", plan.name || "");
    } catch {}
    const repositoryId = searchParams.get("repositoryId");
    const repoQuery = repositoryId ? `&repositoryId=${encodeURIComponent(repositoryId)}` : "";
    router.push(`${basePath}/plan-cases?planId=${plan.id}${repoQuery}`);
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

  const planCount = analysis?.plan_count ?? detail?.plans?.length ?? 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* 页头 */}
      <div className="flex flex-shrink-0 items-start gap-3.5 border-b border-subtle bg-surface-1 px-7 pb-4 pt-[18px]">
        <Button variant="secondary" size="xl" className="mt-0.5 !px-2" onClick={handleBack} aria-label="返回报告列表">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="truncate text-[20px] font-semibold tracking-tight text-primary">{reportTitle}</h2>
            {detail?.report_type && (
              <span
                className={cn(
                  "inline-flex h-[22px] shrink-0 items-center rounded px-2 text-12 font-medium",
                  REPORT_TYPE_CLASS[detail.report_type] ?? "bg-layer-1 text-secondary"
                )}
              >
                {detail.report_type}
              </span>
            )}
          </div>
          {detail && <ReportMeta detail={detail} planCount={planCount} />}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 pt-0.5">
          {canEditReport && (
            <Button
              variant="secondary"
              size="xl"
              prependIcon={<Pencil />}
              disabled={!detail}
              onClick={() => summaryRef.current?.open()}
            >
              编辑总结
            </Button>
          )}
          <Button
            variant="primary"
            size="xl"
            prependIcon={<Download />}
            onClick={handleExportPdf}
            loading={exporting}
            disabled={exporting || loading || !detail || !canExportReport}
          >
            导出 PDF
          </Button>
        </div>
      </div>

      {/* 正文 */}
      <div className="vertical-scrollbar scrollbar-md flex-1 overflow-y-auto bg-surface-2 px-7 py-5">
        {loading && !detail ? (
          <div className="flex h-full min-h-[40vh] items-center justify-center text-secondary">加载中...</div>
        ) : error && !detail ? (
          <div className="rounded-md border border-danger-subtle bg-danger-subtle p-4 text-sm text-danger-primary">
            {error}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
              <ReportOverviewCard
                analysis={analysis}
                asOf={analysisFetchedAt ? formatCNDateTime(analysisFetchedAt).slice(0, 16) : undefined}
              />
              <ReportPlansCard
                plans={analysis?.plans ?? []}
                loading={loading}
                plansHref={`${basePath}/plans`}
                onOpenPlan={handleOpenPlan}
              />
            </div>

            <ReportSummaryEditor
              ref={summaryRef}
              workspaceId={workspaceId ?? ""}
              workspaceSlug={String(workspaceSlug || "")}
              projectId={String(projectId || "")}
              reportId={reportId}
              summaryHtml={detail?.summary_html ?? ""}
              canEdit={canEditReport}
              onSave={handleSaveSummary}
            />

            <ReportCard>
              <ReportCardHeader title="执行明细" count={caseCount} />
              <ReportCaseTable
                rows={cases}
                count={caseCount}
                loading={loading}
                passRate={analysis?.pass_rate}
                onQueryChange={({ page, pageSize, result, name }) => fetchCases(page, pageSize, { name, result })}
              />
            </ReportCard>
          </div>
        )}
      </div>
    </div>
  );
}
