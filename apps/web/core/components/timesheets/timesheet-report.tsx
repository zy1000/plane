/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { Button, DatePicker, Dropdown, Select, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { Download, RotateCcw } from "lucide-react";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useTimesheetCategories } from "@/hooks/store/use-timesheet-categories";
import { useTimesheetReport } from "@/hooks/store/use-timesheet-report";
import type { TTimesheetReportRow } from "@/services/issue/timesheet.service";

type TTimesheetReportProps = {
  workspaceSlug: string;
};

const DATE_FORMAT = "YYYY-MM-DD";

export const TimesheetReport = observer(function TimesheetReport({
  workspaceSlug,
}: TTimesheetReportProps) {
  const { fetchProjects, workspaceProjectIds, getProjectById } = useProject();
  const { workspace: workspaceMemberStore, getUserDetails } = useMember();
  const { categories } = useTimesheetCategories();

  const {
    filters,
    patchFilters,
    resetFilters,
    page,
    pageSize,
    setPage,
    setPageSize,
    rows,
    total,
    isLoading,
    error,
    selectedIds,
    setSelectedIds,
    exportCurrent,
    exportSelected,
    isExporting,
  } = useTimesheetReport({ workspaceSlug });

  useEffect(() => {
    if (workspaceSlug) {
      fetchProjects(workspaceSlug);
      workspaceMemberStore.fetchWorkspaceMembers(workspaceSlug).catch(() => {
        /* 忽略成员拉取失败，下拉将为空 */
      });
    }
  }, [workspaceSlug, fetchProjects, workspaceMemberStore]);

  useEffect(() => {
    if (error) message.error(error);
  }, [error]);

  const projectOptions = useMemo(() => {
    const ids = workspaceProjectIds ?? [];
    return ids
      .map((id) => {
        const project = getProjectById(id);
        if (!project) return null;
        return { value: project.id, label: project.name };
      })
      .filter(Boolean) as { value: string; label: string }[];
  }, [workspaceProjectIds, getProjectById]);

  const memberOptions = useMemo(() => {
    const ids = workspaceMemberStore.getWorkspaceMemberIds(workspaceSlug) ?? [];
    return ids
      .map((id) => {
        const detail = getUserDetails(id);
        if (!detail) return null;
        return {
          value: id,
          label: detail.display_name || detail.first_name || detail.email || id,
        };
      })
      .filter(Boolean) as { value: string; label: string }[];
  }, [workspaceMemberStore, workspaceSlug, getUserDetails]);

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => c.is_active)
        .map((c) => ({ value: c.key, label: c.name })),
    [categories]
  );

  const dateRangeValue: [Dayjs | null, Dayjs | null] = useMemo(
    () => [
      filters.startDate ? dayjs(filters.startDate) : null,
      filters.endDate ? dayjs(filters.endDate) : null,
    ],
    [filters.startDate, filters.endDate]
  );

  const columns: ColumnsType<TTimesheetReportRow> = useMemo(
    () => [
      {
        title: "项目编号",
        dataIndex: "pms_project_name",
        key: "pms_project_name",
        width: 140,
        render: (value: string | null) => value || "-",
      },
      {
        title: "项目",
        dataIndex: "project_name",
        key: "project_name",
        width: 180,
        ellipsis: true,
        render: (value: string | null) => value || "-",
      },
      {
        title: "工作项",
        dataIndex: "issue_name",
        key: "issue_name",
        ellipsis: true,
        render: (value: string | null) => value || "-",
      },
      {
        title: "测试用例",
        dataIndex: "case_name",
        key: "case_name",
        ellipsis: true,
        render: (value: string | null) => value || "-",
      },
      {
        title: "类别",
        dataIndex: "category_name",
        key: "category_name",
        width: 100,
        render: (value: string | null) => value || "-",
      },
      {
        title: "成员",
        dataIndex: "member_name",
        key: "member_name",
        width: 120,
        render: (value: string | null) => value || "-",
      },
      { title: "日期", dataIndex: "date", key: "date", width: 110 },
      {
        title: "起止时间",
        key: "time_range",
        width: 140,
        render: (_, record) =>
          `${(record.start_time ?? "").slice(0, 5)} - ${(record.end_time ?? "").slice(0, 5)}`,
      },
      { title: "工时", dataIndex: "hours", key: "hours", width: 80 },
      {
        title: "描述",
        dataIndex: "description",
        key: "description",
        ellipsis: true,
        render: (value: string | null) => value || "-",
      },
    ],
    []
  );

  const handleExportCurrent = async () => {
    try {
      await exportCurrent();
    } catch (err) {
      message.error((err as { detail?: string } | null)?.detail || "导出失败，请重试");
    }
  };

  const handleExportSelected = async () => {
    if (selectedIds.length === 0) {
      message.info("请先勾选要导出的记录");
      return;
    }
    try {
      await exportSelected();
    } catch (err) {
      message.error((err as { detail?: string } | null)?.detail || "导出失败，请重试");
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-subtle bg-surface-1 px-4 py-3">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 180 }}
          placeholder="全部项目"
          value={filters.projectId}
          onChange={(value) => patchFilters({ projectId: value || undefined })}
          options={projectOptions}
        />
        <DatePicker.RangePicker
          value={dateRangeValue}
          allowEmpty={[true, true]}
          onChange={(range) => {
            const [start, end] = range ?? [null, null];
            patchFilters({
              startDate: start ? start.format(DATE_FORMAT) : undefined,
              endDate: end ? end.format(DATE_FORMAT) : undefined,
            });
          }}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 160 }}
          placeholder="全部人员"
          value={filters.memberId}
          onChange={(value) => patchFilters({ memberId: value || undefined })}
          options={memberOptions}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 160 }}
          placeholder="全部工时类别"
          value={filters.categoryKey}
          onChange={(value) => patchFilters({ categoryKey: value || undefined })}
          options={categoryOptions}
        />
        <Button
          icon={<RotateCcw size={14} />}
          onClick={() => resetFilters()}
        >
          重置
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-secondary">共 {total} 条</span>
          <Dropdown
            menu={{
              items: [
                { key: "current", label: "导出当前筛选" },
                {
                  key: "selected",
                  label: `导出已选 ${selectedIds.length} 条`,
                  disabled: selectedIds.length === 0,
                },
              ],
              onClick: ({ key }) => {
                if (key === "current") handleExportCurrent();
                else if (key === "selected") handleExportSelected();
              },
            }}
          >
            <Button type="primary" icon={<Download size={14} />} loading={isExporting}>
              导出
            </Button>
          </Dropdown>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        <Table<TTimesheetReportRow>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: "max-content" }}
          rowSelection={{
            type: "checkbox",
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys.map((k) => String(k))),
            preserveSelectedRowKeys: true,
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100, 200],
            showTotal: (t) => `共 ${t} 条`,
            onChange: (nextPage, nextPageSize) => {
              if (nextPageSize !== pageSize) {
                setPageSize(nextPageSize);
                setPage(1);
              } else {
                setPage(nextPage);
              }
            },
          }}
        />
      </div>
    </div>
  );
});
