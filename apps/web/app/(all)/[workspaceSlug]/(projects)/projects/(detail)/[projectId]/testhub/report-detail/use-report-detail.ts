"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReportService,
  type TReportDetail,
  type TReportAnalysis,
  type TReportCaseRow,
} from "@/services/qa/report.service";

const reportService = new ReportService();

export type TReportDetailState = {
  detail: TReportDetail | null;
  analysis: TReportAnalysis | null;
  cases: TReportCaseRow[];
  caseCount: number;
  loading: boolean;
  error: string | null;
  refreshDetail: () => Promise<void>;
  refreshAnalysis: () => Promise<void>;
  fetchCases: (page: number, pageSize: number, opts?: { name?: string; result?: string }) => Promise<void>;
  saveSummary: (summaryHtml: string, summaryJson: unknown) => Promise<void>;
};

export const useReportDetail = (
  workspaceSlug: string,
  projectId: string,
  reportId: string | null
): TReportDetailState => {
  const [detail, setDetail] = useState<TReportDetail | null>(null);
  const [analysis, setAnalysis] = useState<TReportAnalysis | null>(null);
  const [cases, setCases] = useState<TReportCaseRow[]>([]);
  const [caseCount, setCaseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDetail = useCallback(async () => {
    if (!workspaceSlug || !projectId || !reportId) return;
    try {
      const data = await reportService.getReportDetail(workspaceSlug, projectId, reportId);
      setDetail(data);
    } catch {
      setError("获取测试报告详情失败");
    }
  }, [workspaceSlug, projectId, reportId]);

  const refreshAnalysis = useCallback(async () => {
    if (!workspaceSlug || !projectId || !reportId) return;
    try {
      const data = await reportService.getReportAnalysis(workspaceSlug, projectId, reportId);
      setAnalysis(data);
    } catch {
      setError("获取报告分析数据失败");
    }
  }, [workspaceSlug, projectId, reportId]);

  const fetchCases = useCallback(
    async (page: number, pageSize: number, opts?: { name?: string; result?: string }) => {
      if (!workspaceSlug || !projectId || !reportId) return;
      try {
        const res = await reportService.getReportCaseList(workspaceSlug, projectId, {
          report_id: reportId,
          page,
          page_size: pageSize,
          name__icontains: opts?.name,
          result: opts?.result,
        });
        setCases(res.data);
        setCaseCount(res.count);
      } catch {
        setError("获取执行明细失败");
      }
    },
    [workspaceSlug, projectId, reportId]
  );

  const saveSummary = useCallback(
    async (summaryHtml: string, summaryJson: unknown) => {
      if (!workspaceSlug || !projectId || !reportId) return;
      await reportService.updateReport(workspaceSlug, projectId, {
        id: reportId,
        summary_html: summaryHtml,
        summary_json: summaryJson,
      });
      setDetail((prev) => (prev ? { ...prev, summary_html: summaryHtml, summary_json: summaryJson } : prev));
    },
    [workspaceSlug, projectId, reportId]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (!workspaceSlug || !projectId || !reportId) return;
      setLoading(true);
      setError(null);
      await Promise.all([refreshDetail(), refreshAnalysis()]);
      await fetchCases(1, 20);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, reportId]);

  return {
    detail,
    analysis,
    cases,
    caseCount,
    loading,
    error,
    refreshDetail,
    refreshAnalysis,
    fetchCases,
    saveSummary,
  };
};
