"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageHead } from "@/components/core/page-title";
import { ReportService, type TReportListItem } from "@/services/qa/report.service";
import { Space, Table, Tag, Input, Button, Modal, Tooltip, Pagination } from "antd";
import { SearchOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { TableProps, InputRef, TableColumnType } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { formatDateTime } from "../util";
import { CreateUpdateReportModal } from "@/components/qa/reports/create-update-report-modal";
import styles from "../reviews/reviews.module.css";
import { useTestHub } from "../testhub-context";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import UnauthorizedImg from "@/app/assets/auth/unauthorized.svg?url";
import { useTranslation } from "@plane/i18n";
import { qaCaseSetToastError } from "@/utils/qa-case-error";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

const reportService = new ReportService();

const REPORT_TYPE_COLOR: Record<string, string> = {
  计划报告: "blue",
  对外报告: "gold",
};

const QA_REPORT_VIEW_PERMISSION_KEY = "qa.report.view" as const;
const QA_REPORT_CREATE_PERMISSION_KEY = "qa.report.create" as const;
const QA_REPORT_EDIT_PERMISSION_KEY = "qa.report.edit" as const;
const QA_REPORT_DELETE_PERMISSION_KEY = "qa.report.delete" as const;

export default function TestReportsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    String(workspaceSlug || ""),
    String(projectId || "")
  );
  const canViewReports = permissionsFetched && hasPermission(QA_REPORT_VIEW_PERMISSION_KEY);
  const canCreateReport = permissionsFetched && hasPermission(QA_REPORT_CREATE_PERMISSION_KEY);
  const canEditReport = permissionsFetched && hasPermission(QA_REPORT_EDIT_PERMISSION_KEY);
  const canDeleteReport = permissionsFetched && hasPermission(QA_REPORT_DELETE_PERMISSION_KEY);

  const [reports, setReports] = useState<TReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReport, setEditingReport] = useState<TReportListItem | null>(null);
  const { registerOpenNewReportModal } = useTestHub();
  useEffect(() => {
    registerOpenNewReportModal(() => {
      if (!canCreateReport) return;
      setShowCreateModal(true);
    });
  }, [canCreateReport, registerOpenNewReportModal]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ name?: string }>({});
  const searchInput = useRef<InputRef>(null);

  const repositoryId =
    searchParams.get("repositoryId") ||
    (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const repositoryName = typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryName") : "";
  const decodedRepositoryName = repositoryName || "";

  const prevShowCreateRef = useRef<boolean>(false);
  const prevShowEditRef = useRef<boolean>(false);
  const refreshAll = async () => {
    await fetchReports(currentPage, pageSize, filters);
  };
  useEffect(() => {
    if (prevShowCreateRef.current && !showCreateModal) refreshAll();
    prevShowCreateRef.current = showCreateModal;
  }, [showCreateModal]);
  useEffect(() => {
    if (prevShowEditRef.current && !showEditModal) refreshAll();
    prevShowEditRef.current = showEditModal;
  }, [showEditModal]);

  const fetchReports = async (page = currentPage, size = pageSize, filterParams = filters) => {
    if (!workspaceSlug || !projectId) return;
    if (!canViewReports) return;
    try {
      setLoading(true);
      setError(null);
      const queryParams: any = { page, page_size: size };
      if (filterParams.name) queryParams.name__icontains = filterParams.name;
      const response = await reportService.getReports(workspaceSlug as string, projectId as string, queryParams);
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

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (!permissionsFetched) return;
    if (!canViewReports) return;
    fetchReports(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, permissionsFetched, canViewReports, pageSize]);

  const getColumnSearchProps = (dataIndex: string): TableColumnType<TReportListItem> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: FilterDropdownProps) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder="搜索报告名称"
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], dataIndex, close)}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], dataIndex, close)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            搜索
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters, dataIndex)}
            size="small"
            style={{ width: 90 }}
          >
            重置
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    onFilterDropdownOpenChange: (visible) => {
      if (visible) setTimeout(() => searchInput.current?.select(), 100);
    },
  });

  const handleSearch = (selectedKeys: string[], dataIndex: string, close?: () => void) => {
    const newFilters = { ...filters };
    if (selectedKeys[0]) newFilters.name = selectedKeys[0];
    else delete newFilters.name;
    setFilters(newFilters);
    fetchReports(1, pageSize, newFilters);
    close?.();
  };

  const handleReset = (clearFilters: () => void, dataIndex: string) => {
    clearFilters();
    const newFilters = { ...filters };
    delete newFilters.name;
    setFilters(newFilters);
    fetchReports(1, pageSize, newFilters);
  };

  const openEditModal = async (report: TReportListItem) => {
    if (!canEditReport) return;
    setEditingReport(report);
    setShowEditModal(true);
    try {
      const detail = await reportService.getReportDetail(workspaceSlug as string, projectId as string, report.id);
      setEditingReport({ ...report, plans: detail.plans?.map((p) => p.id) } as any);
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
          await reportService.deleteReport(workspaceSlug as string, projectId as string, [report.id]);
          await fetchReports(currentPage, pageSize, filters);
        } catch (e: unknown) {
          qaCaseSetToastError(e, t, "删除测试报告失败，请稍后重试");
        }
      },
    });
  };

  const renderPassRate = (passRate: any) => {
    const orderKeys = ["成功", "失败", "阻塞", "无效", "未执行"];
    const totalCount = orderKeys.reduce((s, k) => s + Number(passRate?.[k] || 0), 0);
    const passed = Number(passRate?.["成功"] || 0);
    const percent = totalCount > 0 ? Math.floor((passed / totalCount) * 100) : 0;
    const categoryColor: Record<string, string> = {
      成功: "#52c41a",
      失败: "#ff4d4f",
      阻塞: "#faad14",
      无效: "#3b5999",
      未执行: "#bfbfbf",
    };
    const segments = orderKeys.map((k) => {
      const count = Number(passRate?.[k] || 0);
      return {
        key: k,
        count,
        color: categoryColor[k] || "#d9d9d9",
        widthPct: totalCount > 0 ? (count / totalCount) * 100 : 0,
      };
    });
    const tooltipContent = (
      <div className={styles.legend}>
        {orderKeys.map((k) => (
          <div key={k} className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: categoryColor[k] || "#d9d9d9" }} />
            <span className={styles.legendLabel}>{k}</span>
            <span className={styles.legendCount}>{Number(passRate?.[k] || 0)}</span>
          </div>
        ))}
      </div>
    );
    return (
      <div className={styles.passRateCell}>
        <Tooltip mouseEnterDelay={0.25} overlayClassName={styles.lightTooltip} title={tooltipContent}>
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              {segments.map((seg, idx) => (
                <div
                  key={`${seg.key}-${idx}`}
                  className={styles.progressSegment}
                  style={{ width: `${seg.widthPct}%`, backgroundColor: seg.color }}
                />
              ))}
            </div>
          </div>
        </Tooltip>
        <span className={styles.progressPercent}>{percent}%</span>
      </div>
    );
  };

  const goToDetail = (reportId: string, reportName: string) => {
    try {
      sessionStorage.setItem("selectedReportName", reportName);
    } catch {}
    const ws = (workspaceSlug as string) || "";
    const pid = (projectId as string) || "";
    const repoQuery = repositoryId ? `&repositoryId=${encodeURIComponent(String(repositoryId))}` : "";
    router.push(`/${ws}/projects/${pid}/testhub/report-detail?reportId=${reportId}${repoQuery}`);
  };

  const columns: TableProps<TReportListItem>["columns"] = [
    {
      title: "报告名称",
      dataIndex: "name",
      key: "name",
      minWidth: 180,
      ...getColumnSearchProps("name"),
      render: (name: string, record: TReportListItem) => (
        <Button
          type="link"
          className="!p-0 !text-primary hover:!text-primary"
          onClick={() => goToDetail(record.id, record.name)}
        >
          <span className="truncate text-inherit">{record.name}</span>
        </Button>
      ),
    },
    {
      title: "报告类型",
      dataIndex: "report_type",
      key: "report_type",
      width: 120,
      render: (rt: string) => <Tag color={REPORT_TYPE_COLOR[rt] || "default"}>{rt || "-"}</Tag>,
    },
    {
      title: "计划名称",
      dataIndex: "plan_names",
      key: "plan_names",
      width: 240,
      render: (planNames: string[]) => {
        if (!planNames || !planNames.length) return <span className="text-secondary">-</span>;
        const display = planNames.join("、");
        return (
          <Tooltip title={display} mouseEnterDelay={0.25}>
            <span className="inline-block max-w-[220px] truncate align-bottom text-primary">{display}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "通过率",
      dataIndex: "pass_rate",
      key: "pass_rate",
      width: 180,
      render: (passRate: any) => renderPassRate(passRate),
    },
    {
      title: "创建人",
      key: "created_by",
      dataIndex: "created_by_detail",
      width: 180,
      render: (detail: any) =>
        detail?.id ? (
          <MemberDropdown
            multiple={true}
            value={[detail.id]}
            onChange={() => {}}
            disabled={true}
            placeholder={"未知用户"}
            className="w-full text-sm"
            buttonContainerClassName="w-full text-left p-0 cursor-default"
            buttonVariant="transparent-with-text"
            buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
            showUserDetails={true}
            optionsClassName="z-[60]"
          />
        ) : (
          <span className="text-secondary">-</span>
        ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (v: string) => <span>{formatDateTime(v)}</span>,
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="编辑"
            disabled={!canEditReport}
            onClick={() => openEditModal(record)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label="删除"
            disabled={!canDeleteReport}
            onClick={() => confirmDelete(record)}
          />
        </Space>
      ),
    },
  ];

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
        <div className="h-full w-full">
          <div className="flex h-full w-full flex-col">
            <div className="flex-1 overflow-hidden p-0">
              {error && (
                <div className="bg-red-50 border-red-200 mb-4 rounded-md border p-4">
                  <div className="text-red-800 text-sm">{error}</div>
                </div>
              )}
              <div className="flex h-full flex-col overflow-hidden">
                <div className="testhub-reports-table-scroll relative flex-1 overflow-y-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-track]:bg-transparent">
                  <Table
                    dataSource={reports}
                    columns={columns}
                    loading={loading}
                    rowKey="id"
                    bordered={true}
                    pagination={false}
                    scroll={{ x: 1100 }}
                  />
                </div>
                <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-secondary">
                      {total > 0
                        ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} 条，共 ${total} 条`
                        : ""}
                    </span>
                  </div>
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
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                    .testhub-reports-table-scroll .ant-table-thead > tr > th {
                      position: sticky;
                      top: 0;
                      z-index: 5;
                      background: var(--bg-surface-1);
                      font-size: 13px !important;
                      font-weight: 500 !important;
                      color: var(--text-color-secondary) !important;
                    }
                  `,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {canCreateReport && (
        <CreateUpdateReportModal
          isOpen={showCreateModal}
          handleClose={() => setShowCreateModal(false)}
          workspaceSlug={workspaceSlug as string}
          projectId={projectId as string}
          mode="create"
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
          workspaceSlug={workspaceSlug as string}
          projectId={projectId as string}
          mode="edit"
          reportId={editingReport?.id}
          initialData={
            editingReport
              ? {
                  name: editingReport.name,
                  report_type: editingReport.report_type,
                  plans: (editingReport as any).plans ?? [],
                }
              : null
          }
          onSuccess={refreshAll}
        />
      )}
    </>
  );
}
