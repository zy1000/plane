"use client";

/**
 * 导入弹窗 - Step 2：展示校验结果，支持 Tab 切换 + 行级勾选。
 */

import React from "react";
import { Table, Tabs, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table";
import type { ValidationResponse, ValidationRow } from "./types";

type Props = {
  validation: ValidationResponse | null;
  selectedRowKeys: number[];
  passedRowKeys: Set<number>;
  onSelectionChange: (keys: number[]) => void;
};

export function StepValidate({ validation, selectedRowKeys, passedRowKeys, onSelectionChange }: Props) {
  const [tab, setTab] = React.useState<"all" | "failed">("all");

  const columns = React.useMemo<ColumnsType<ValidationRow>>(
    () => [
      { title: "行号", dataIndex: "row_number", key: "row_number", width: 80 },
      { title: "标题", dataIndex: "title", key: "title", ellipsis: true },
      {
        title: "状态",
        dataIndex: "passed",
        key: "passed",
        width: 90,
        render: (passed: boolean) => (
          <span className={passed ? "text-success-primary font-medium" : "text-danger-primary font-medium"}>
            {passed ? "通过" : "不通过"}
          </span>
        ),
      },
      {
        title: "错误 / 提示",
        key: "messages",
        render: (_, record) => {
          const errors = record.errors ?? [];
          const warnings = record.warnings ?? [];
          if (errors.length === 0 && warnings.length === 0) return <span className="text-placeholder">-</span>;
          return (
            <div className="flex flex-col gap-1">
              {errors.map((err, idx) => (
                <Tooltip key={`e-${idx}`} title={err}>
                  <span className="truncate text-danger-primary">{err}</span>
                </Tooltip>
              ))}
              {warnings.map((warn, idx) => (
                <Tooltip key={`w-${idx}`} title={warn}>
                  <span className="truncate text-warning-primary">{warn}</span>
                </Tooltip>
              ))}
            </div>
          );
        },
      },
    ],
    []
  );

  const rowSelection: TableRowSelection<ValidationRow> = React.useMemo(
    () => ({
      selectedRowKeys,
      preserveSelectedRowKeys: true,
      onChange: (keys) => onSelectionChange(keys as number[]),
      // 已校验失败的行不允许勾选
      getCheckboxProps: (record) => ({ disabled: !passedRowKeys.has(record.row_number) }),
    }),
    [selectedRowKeys, onSelectionChange, passedRowKeys]
  );

  const dataSource = React.useMemo<ValidationRow[]>(() => {
    if (!validation) return [];
    return tab === "failed" ? validation.results.filter((r) => !r.passed) : validation.results;
  }, [validation, tab]);

  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-medium text-primary">校验结果</div>
          <div className="mt-1 text-sm text-secondary">
            {validation
              ? `通过 ${validation.passed_count} / ${validation.total_count} 行；已勾选 ${selectedRowKeys.length} 行`
              : "暂无结果"}
          </div>
        </div>
        {validation && (
          <div
            className={
              validation.all_passed
                ? "rounded-full bg-success-subtle px-3 py-1 text-sm font-medium text-success-primary"
                : "rounded-full bg-danger-subtle px-3 py-1 text-sm font-medium text-danger-primary"
            }
          >
            {validation.all_passed ? "全部通过，可开始导入" : "存在未通过行，可仅勾选通过行导入"}
          </div>
        )}
      </div>

      <div className="mt-3">
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as "all" | "failed")}
          items={[
            { key: "all", label: `全部 (${validation?.total_count ?? 0})` },
            {
              key: "failed",
              label: `仅有问题 (${(validation?.total_count ?? 0) - (validation?.passed_count ?? 0)})`,
            },
          ]}
        />
        <Table
          rowSelection={rowSelection}
          dataSource={dataSource}
          columns={columns}
          rowKey={(r) => r.row_number}
          size="middle"
          pagination={false}
          bordered
          scroll={{ y: 360 }}
          rowClassName={(record) => (record.passed ? "bg-success-subtle/30" : "bg-danger-subtle/30")}
        />
      </div>
    </div>
  );
}
