"use client";

import { useEffect, useState } from "react";
import { Card, Input, Pagination, Table, Tag } from "antd";
import type { TableProps } from "antd";
import type { TReportCaseRow } from "@/services/qa/report.service";

const RESULT_COLOR: Record<string, string> = {
  成功: "success",
  失败: "error",
  阻塞: "warning",
  无效: "default",
  未执行: "default",
};

const PRIORITY_LABEL: Record<number, string> = { 0: "低", 1: "中", 2: "高" };

type Props = {
  rows: TReportCaseRow[];
  count: number;
  loading: boolean;
  onPageChange: (page: number, pageSize: number) => void;
  onSearch: (name?: string) => void;
};

export const ReportCaseTable = ({ rows, count, loading, onPageChange, onSearch }: Props) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    setPage(1);
  }, [count]);

  const columns: TableProps<TReportCaseRow>["columns"] = [
    {
      title: "编号",
      dataIndex: "code",
      key: "code",
      width: 120,
      render: (code: string) => <span className="text-secondary">{code || "-"}</span>,
    },
    { title: "名称", dataIndex: "name", key: "name", minWidth: 180, ellipsis: true },
    {
      title: "等级",
      dataIndex: "priority",
      key: "priority",
      width: 80,
      render: (p: number | null) => (p === null || p === undefined ? "-" : PRIORITY_LABEL[p] ?? String(p)),
    },
    {
      title: "执行结果",
      dataIndex: "result",
      key: "result",
      width: 110,
      render: (r: string) => <Tag color={RESULT_COLOR[r] || "default"}>{r || "-"}</Tag>,
    },
    {
      title: "所属模块",
      dataIndex: "module",
      key: "module",
      width: 160,
      render: (m: string) => <span className="text-secondary">{m || "-"}</span>,
    },
    {
      title: "执行人",
      dataIndex: "assignee_name",
      key: "assignee_name",
      width: 140,
      render: (n: string | null) => <span className="text-secondary">{n || "-"}</span>,
    },
    {
      title: "缺陷数",
      dataIndex: "defect_count",
      key: "defect_count",
      width: 90,
      render: (c: number) => <span className={c ? "text-red-600" : "text-secondary"}>{c || 0}</span>,
    },
    {
      title: "所属计划",
      dataIndex: "plan_name",
      key: "plan_name",
      width: 180,
      ellipsis: true,
      render: (n: string) => <span className="text-secondary">{n || "-"}</span>,
    },
  ];

  const handleSearch = () => {
    setPage(1);
    onSearch(keyword.trim() || undefined);
  };

  return (
    <Card className="p-0">
      <div className="mb-3 flex items-center justify-end gap-2">
        <Input.Search
          allowClear
          size="small"
          placeholder="搜索编号/名称"
          value={keyword}
          style={{ width: 220 }}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
        />
      </div>
      <Table
        dataSource={rows}
        columns={columns}
        loading={loading}
        rowKey="id"
        bordered
        pagination={false}
        scroll={{ x: 1100 }}
        locale={{ emptyText: "暂无数据" }}
      />
      <div className="flex items-center justify-end py-3">
        <Pagination
          simple
          current={page}
          pageSize={pageSize}
          total={count}
          showSizeChanger
          pageSizeOptions={["10", "20", "50", "100"]}
          size="small"
          onChange={(p, s) => {
            const nextSize = s || pageSize;
            setPage(p);
            setPageSize(nextSize);
            onPageChange(p, nextSize);
          }}
        />
      </div>
    </Card>
  );
};
