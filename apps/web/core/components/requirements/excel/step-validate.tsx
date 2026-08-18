"use client";

/**
 * 导入弹窗 Step 2：逐行校验结果 + 勾选。
 *
 * 勾选的 key 是 `row_key`（`工作表名!行号`）而不是行号 —— 产品下按需求类型分了多个
 * 工作表，光有行号会在工作表之间撞车。
 */

import React from "react";
import { Alert, Table, Tabs, Tag, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table";
import { useTranslation } from "@plane/i18n";
import type { TRequirementExcelRow, TRequirementExcelValidation } from "@plane/types";

type TProps = {
  validation: TRequirementExcelValidation | null;
  selectedRowKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  error: string | null;
};

const ACTION_TAG_COLOR: Record<TRequirementExcelRow["action"], string> = {
  create: "green",
  update: "blue",
  unchanged: "default",
  skip: "default",
};

export function RequirementExcelStepValidate({ validation, selectedRowKeys, onSelectionChange, error }: TProps) {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState<"all" | "problem">("all");

  const results = validation?.results ?? [];
  const problemCount = results.filter((row) => !row.passed).length;

  const columns = React.useMemo<ColumnsType<TRequirementExcelRow>>(
    () => [
      {
        title: t("requirement_excel.validate.column_row"),
        key: "row",
        width: 150,
        render: (_, record) => (
          <span className="text-12 text-secondary">
            {record.sheet}
            <span className="text-placeholder"> · </span>
            {record.row_number}
          </span>
        ),
      },
      {
        title: t("requirement_excel.validate.column_title"),
        key: "title",
        ellipsis: true,
        render: (_, record) => (
          <div className="flex min-w-0 items-center gap-1.5">
            {record.display_id && <span className="shrink-0 text-11 text-tertiary">{record.display_id}</span>}
            <span className="truncate">{record.title || "—"}</span>
          </div>
        ),
      },
      {
        title: t("requirement_excel.validate.column_action"),
        key: "action",
        width: 90,
        render: (_, record) => (
          <Tag color={record.errors.length ? "red" : ACTION_TAG_COLOR[record.action]}>
            {record.errors.length
              ? t("requirement_excel.validate.action_error")
              : t(`requirement_excel.validate.action_${record.action}`)}
          </Tag>
        ),
      },
      {
        title: t("requirement_excel.validate.column_message"),
        key: "message",
        render: (_, record) => {
          const lines = [
            ...record.errors.map((text) => ({ text, tone: "text-danger-primary" })),
            ...record.warnings.map((text) => ({ text, tone: "text-warning-primary" })),
            ...(record.skip_reason ? [{ text: record.skip_reason, tone: "text-secondary" }] : []),
          ];
          if (lines.length === 0) return <span className="text-placeholder">—</span>;
          return (
            <div className="flex flex-col gap-1">
              {lines.map((line, index) => (
                <Tooltip key={index} title={line.text}>
                  <span className={`truncate text-12 ${line.tone}`}>{line.text}</span>
                </Tooltip>
              ))}
            </div>
          );
        },
      },
    ],
    [t]
  );

  const rowSelection: TableRowSelection<TRequirementExcelRow> = React.useMemo(
    () => ({
      selectedRowKeys,
      preserveSelectedRowKeys: true,
      onChange: (keys) => onSelectionChange(keys as string[]),
      // 有错的、以及命中只读闸门被跳过的行不可勾选
      getCheckboxProps: (record) => ({ disabled: !record.passed }),
    }),
    [selectedRowKeys, onSelectionChange]
  );

  const dataSource = tab === "problem" ? results.filter((row) => !row.passed) : results;

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert type="error" showIcon message={error} />}
      {validation && validation.ignored_sheets.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t("requirement_excel.validate.ignored_sheets", { names: validation.ignored_sheets.join("、") })}
        />
      )}
      {validation && validation.ignored_headers.length > 0 && (
        <Alert
          type="info"
          showIcon
          message={t("requirement_excel.validate.ignored_headers", { names: validation.ignored_headers.join("、") })}
        />
      )}

      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="text-13 text-secondary">
          {validation
            ? t("requirement_excel.validate.summary", {
                create: validation.create_count,
                update: validation.update_count,
                unchanged: validation.unchanged_count,
                skip: validation.skipped_count,
                error: validation.error_count,
              })
            : "—"}
          <span className="ml-2 text-primary">
            {t("requirement_excel.validate.selected", { count: selectedRowKeys.length })}
          </span>
        </div>

        <Tabs
          className="mt-2"
          activeKey={tab}
          onChange={(key) => setTab(key as "all" | "problem")}
          items={[
            { key: "all", label: t("requirement_excel.validate.tab_all", { count: results.length }) },
            { key: "problem", label: t("requirement_excel.validate.tab_problem", { count: problemCount }) },
          ]}
        />
        <Table
          rowSelection={rowSelection}
          dataSource={dataSource}
          columns={columns}
          rowKey={(row) => row.row_key}
          size="middle"
          pagination={false}
          bordered
          scroll={{ y: 340 }}
          locale={{ emptyText: t("requirement_excel.validate.empty") }}
          rowClassName={(record) =>
            record.errors.length
              ? "bg-danger-subtle/30"
              : record.action === "skip" || record.action === "unchanged"
                ? "bg-layer-1"
                : "bg-success-subtle/20"
          }
        />
      </div>
    </div>
  );
}
