"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pagination } from "antd";
import { PageHead } from "@/components/core/page-title";
import { ReportService, type TReportListItem } from "@/services/qa/report.service";
import { CreateUpdateReportModal } from "@/components/qa/reports/create-update-report-modal";
import { ReportListTable } from "@/components/qa/reports/report-list-table";
import { ReportModuleTree } from "@/components/qa/reports/report-module-tree";
import { useReportModules } from "@/hooks/store/use-report-modules";
import { useTestHub } from "../testhub-context";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import UnauthorizedImg from "@/app/assets/auth/unauthorized.svg?url";
import { useTranslation } from "@plane/i18n";
import { qaCaseSetToastError } from "@/utils/qa-case-error";

const reportService = new ReportService();

const QA_REPORT_VIEW_PERMISSION_KEY = "qa.report.view" as const;
const QA_REPORT_CREATE_PERMISSION_KEY = "qa.report.create" as const;
const QA_REPORT_EDIT_PERMISSION_KEY = "qa.report.edit" as const;
const QA_REPORT_DELETE_PERMISSION_KEY = "qa.report.delete" as const;

type TEditingReport = TReportListItem & { plans?: string[] };

export default function TestReportsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ws = String(workspaceSlug || "");
  const pid = String(projectId || "");

  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(ws, pid);
  const canViewReports = permissionsFetched && hasPermission(QA_REPORT_VIEW_PERMISSION_KEY);
  const canCreateReport = permissionsFetched && hasPermission(QA_REPORT_CREATE_PERMISSION_KEY);
  const canEditReport = permissionsFetched && hasPermission(QA_REPORT_EDIT_PERMISSION_KEY);
  const canDeleteReport = permissionsFetched && hasPermission(QA_REPORT_DELETE_PERMISSION_KEY);

  const [reports, setReports] = useState<TReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ name?: string }>({});

  // URL 带 moduleId 时作为初始选中；之后以用户在树上的选择为准
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(searchParams.get("moduleId"));
  const selectedModuleIdRef = useRef<string | null>(selectedModuleId);
  selectedModuleIdRef.current = selectedModuleId;
  const reportModules = useReportModules({ workspaceSlug: ws, projectId: pid, enabled: canViewReports });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createInitialValues, setCreateInitialValues] = useState<{ module: string | null } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReport, setEditingReport] = useState<TEditingReport | null>(null);
  // 弹窗的 effect 依赖 initialData 对象，必须 memo，否则页面任意一次 render 都会把编辑中的表单重置
  const editInitialValues = useMemo(
    () =>
      editingReport
        ? {
            name: editingReport.name,
            report_type: editingReport.report_type,
            plans: editingReport.plans ?? [],
            module: editingReport.module,
          }
        : null,
    [editingReport]
  );

  const { registerOpenNewReportModal, registerReportSearch, setReportSearchValue } = useTestHub();
  // 新建报告默认带入左树当前选中模块；initialData 存进 state，避免每次 render 新对象把弹窗表单重置
  const openCreateModal = useCallback(() => {
    if (!canCreateReport) return;
    setCreateInitialValues({ module: selectedModuleIdRef.current });
    setShowCreateModal(true);
  }, [canCreateReport]);
  useEffect(() => {
    registerOpenNewReportModal(openCreateModal);
  }, [openCreateModal, registerOpenNewReportModal]);

  const repositoryId =
    searchParams.get("repositoryId") ||
    (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const repositoryName = typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryName") : "";
  const decodedRepositoryName = repositoryName || "";

  const fetchReports = async (
    page = currentPage,
    size = pageSize,
    filterParams = filters,
    moduleOverride?: string | null
  ) => {
    if (!ws || !pid || !canViewReports) return;
    const moduleParam = moduleOverride === undefined ? selectedModuleId : moduleOverride;
    try {
      setLoading(true);
      setError(null);
      const queryParams: Record<string, unknown> = { page, page_size: size };
      if (moduleParam) queryParams.module_id = moduleParam;
      if (filterParams.name) queryParams.name__icontains = filterParams.name;
      const response = await reportService.getReports(ws, pid, queryParams);
      setReports(response.data || []);
      setTotal(response.count || 0);
      setCurrentPage(page);
      setPageSize(size);
    } catch {
      setError("获取测试报告数据失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  /** 报告增删改之后列表和树上的计数都会变，一起刷新 */
  const refreshAll = async () => {
    await Promise.all([fetchReports(currentPage, pageSize, filters), reportModules.refresh().catch(() => {})]);
  };

  const handleReportSearch = (query: string) => {
    const trimmedQuery = query.trim();
    const newFilters = { ...filters };
    if (trimmedQuery) newFilters.name = trimmedQuery;
    else delete newFilters.name;
    setFilters(newFilters);
    setReportSearchValue(trimmedQuery);
    fetchReports(1, pageSize, newFilters);
  };

  useEffect(() => {
    registerReportSearch(handleReportSearch);
  }, [handleReportSearch, registerReportSearch]);

  useEffect(() => {
    setReportSearchValue("");
    return () => setReportSearchValue("");
  }, [setReportSearchValue]);

  useEffect(() => {
    if (!ws || !pid) return;
    if (!permissionsFetched) return;
    if (!canViewReports) return;
    fetchReports(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, pid, permissionsFetched, canViewReports, pageSize]);

  const handleSelectModule = (moduleId: string | null) => {
    if (moduleId === selectedModuleId) return;
    setSelectedModuleId(moduleId);
    // 同步写 ref：树组件「删除当前选中模块」会先调这里再删，删完的重拉要拿到新值
    selectedModuleIdRef.current = moduleId;
    fetchReports(1, pageSize, filters, moduleId);
  };

  // 改名 / 换父 / 删除会改变列表里的「所属模块」或当前模块下的报告集合，成功后顺带重拉当前页
  const refetchAfterModuleChange = () => fetchReports(currentPage, pageSize, filters, selectedModuleIdRef.current);
  const renameModule = async (moduleId: string, name: string) => {
    await reportModules.renameModule(moduleId, name);
    await refetchAfterModuleChange();
  };
  const moveModule = async (moduleId: string, parentId: string | null) => {
    await reportModules.moveModule(moduleId, parentId);
    await refetchAfterModuleChange();
  };
  const deleteModule = async (moduleId: string) => {
    await reportModules.deleteModule(moduleId);
    await refetchAfterModuleChange();
  };

  const openEditModal = async (report: TReportListItem) => {
    if (!canEditReport) return;
    setEditingReport(report);
    setShowEditModal(true);
    try {
      const detail = await reportService.getReportDetail(ws, pid, report.id);
      // 详情里的 module 为准：列表加载后模块可能已被清空或删除，null 也要照收
      setEditingReport({ ...report, module: detail.module, plans: detail.plans?.map((p) => p.id) });
    } catch {
      // 保留已有信息，不阻塞编辑
    }
  };

  const confirmDelete = (report: TReportListItem) => {
    if (!canDeleteReport) return;
    Modal.confirm({
      title: "确认删除",
      content: "确定要删除该测试报告吗？此操作不可撤销。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await reportService.deleteReport(ws, pid, [report.id]);
          await refreshAll();
        } catch (e: unknown) {
          qaCaseSetToastError(e, t, "删除测试报告失败，请稍后重试");
        }
      },
    });
  };

  const goToDetail = (report: TReportListItem) => {
    try {
      sessionStorage.setItem("selectedReportName", report.name);
    } catch {}
    const repoQuery = repositoryId ? `&repositoryId=${encodeURIComponent(String(repositoryId))}` : "";
    router.push(`/${ws}/projects/${pid}/testhub/report-detail?reportId=${report.id}${repoQuery}`);
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const newPageSize = size || pageSize;
    const nextPage = newPageSize !== pageSize ? 1 : page;
    fetchReports(nextPage, newPageSize, filters);
  };

  return (
    <>
      <PageHead title={`测试报告 - ${decodedRepositoryName}`} />
      {!permissionsFetched ? (
        <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
          <div className="text-secondary">加载中...</div>
        </div>
      ) : !canViewReports ? (
        <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-y-5 text-center">
          <div className="h-44 w-72">
            <img src={UnauthorizedImg} className="h-[176px] w-[288px] object-contain" alt="unauthorized" />
          </div>
          <h1 className="text-xl font-medium text-primary">您没有查看此页面的权限</h1>
        </div>
      ) : (
        <div className="flex h-full w-full">
          <ReportModuleTree
            modules={reportModules.modules}
            total={reportModules.total}
            loaded={reportModules.loaded}
            loading={!reportModules.loaded}
            selectedModuleId={selectedModuleId}
            onSelectModule={handleSelectModule}
            canCreate={canCreateReport}
            canEdit={canEditReport}
            canDelete={canDeleteReport}
            createModule={reportModules.createModule}
            renameModule={renameModule}
            moveModule={moveModule}
            deleteModule={deleteModule}
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {error ? (
              <div className="m-4 rounded-md border border-danger-subtle bg-danger-subtle p-4 text-13 text-danger-primary">
                {error}
              </div>
            ) : (
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <ReportListTable
                  reports={reports}
                  loading={loading}
                  canEdit={canEditReport}
                  canDelete={canDeleteReport}
                  onOpen={goToDetail}
                  onEdit={openEditModal}
                  onDelete={confirmDelete}
                />
              </div>
            )}
            <div className="flex shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
              <span className="text-sm text-secondary">
                {total > 0
                  ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} 条，共 ${total} 条`
                  : ""}
              </span>
              <Pagination
                simple
                current={currentPage}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                pageSizeOptions={["10", "20", "50", "100"]}
                onChange={handlePaginationChange}
                onShowSizeChange={handlePaginationChange}
                size="small"
              />
            </div>
          </div>
        </div>
      )}

      {canCreateReport && (
        <CreateUpdateReportModal
          isOpen={showCreateModal}
          handleClose={() => setShowCreateModal(false)}
          workspaceSlug={ws}
          projectId={pid}
          mode="create"
          initialData={createInitialValues}
          onSuccess={refreshAll}
        />
      )}

      {canEditReport && (
        <CreateUpdateReportModal
          key={editingReport?.id || "edit"}
          isOpen={showEditModal}
          handleClose={() => {
            setShowEditModal(false);
            setEditingReport(null);
          }}
          workspaceSlug={ws}
          projectId={pid}
          mode="edit"
          reportId={editingReport?.id}
          initialData={editInitialValues}
          onSuccess={refreshAll}
        />
      )}
    </>
  );
}
