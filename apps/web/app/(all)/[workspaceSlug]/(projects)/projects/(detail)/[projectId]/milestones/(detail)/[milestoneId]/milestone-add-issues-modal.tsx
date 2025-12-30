"use client";

import { useMemo } from "react";
import type { Key } from "react";
import { Button, Input, Modal, Pagination, Table } from "antd";
import type { TableProps } from "antd";
import { StateGroupIcon } from "@plane/propel/icons";
import { ReadonlyPriority } from "@/components/readonly/priority";

type Props<TIssueRow extends { id: string }> = {
  open: boolean;
  loading: boolean;
  issues: TIssueRow[];
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
  selectedIssueIds: Key[];
  setSelectedIssueIds: (keys: Key[]) => void;
  onCancel: () => void;
  onOk: () => void;
  getIssueLabel: (issue: TIssueRow) => string;
  typeOptions?: { value: string; label: string }[];
  selectedTypeId?: string;
  nameQuery: string;
  onTableChange: TableProps<TIssueRow>["onChange"];
};

export function MilestoneAddIssuesModal<TIssueRow extends { id: string }>(props: Props<TIssueRow>) {
  const {
    open,
    loading,
    issues,
    currentPage,
    pageSize,
    total,
    onPageChange,
    selectedIssueIds,
    setSelectedIssueIds,
    onCancel,
    onOk,
    getIssueLabel,
    typeOptions,
    selectedTypeId,
    nameQuery,
    onTableChange,
  } = props;

  const typeFilters = useMemo(
    () => (typeOptions ?? []).map((o) => ({ text: o.label, value: o.value })),
    [typeOptions]
  );

  const columns: TableProps<TIssueRow>["columns"] = useMemo(
    () => [
      {
        title: "名称",
        dataIndex: "name",
        key: "name",
        filteredValue: nameQuery ? [nameQuery] : null,
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
          <div className="w-[240px] p-2">
            <Input
              allowClear
              placeholder="按名称搜索"
              value={(selectedKeys?.[0] as string) ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedKeys(v ? [v] : []);
              }}
              onPressEnter={() => confirm({ closeDropdown: true })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="small"
                onClick={() => {
                  clearFilters?.();
                  confirm({ closeDropdown: true });
                }}
              >
                重置
              </Button>
              <Button size="small" type="primary" onClick={() => confirm({ closeDropdown: true })}>
                搜索
              </Button>
            </div>
          </div>
        ),
        render: (_: any, record: TIssueRow) => <span className="truncate">{getIssueLabel(record)}</span>,
      },
      {
        title: "类型",
        dataIndex: "type",
        key: "type_id",
        width: 140,
        filters: typeFilters,
        filterMultiple: false,
        filteredValue: selectedTypeId ? [selectedTypeId] : null,
        render: (_: any, record: any) => <span className="truncate">{record?.type?.name ?? "-"}</span>,
      },
      {
        title: "优先级",
        dataIndex: "priority",
        key: "priority",
        width: 160,
        render: (value: any) => <ReadonlyPriority value={value} />,
      },
      {
        title: "状态",
        dataIndex: "state",
        key: "state",
        width: 180,
        render: (_: any, record: any) => {
          const state = record?.state;
          if (!state) return <span className="truncate">-</span>;

          return (
            <div className="flex items-center gap-2 min-w-0">
              {state?.group ? (
                <StateGroupIcon stateGroup={state.group} color={state.color} className="shrink-0 size-3.5" />
              ) : null}
              <span className="truncate">{state?.name ?? "-"}</span>
            </div>
          );
        },
      },
    ],
    [getIssueLabel, nameQuery, selectedTypeId, typeFilters]
  );

  return (
    <Modal
      title="关联工作项"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="确认关联"
      cancelText="取消"
      confirmLoading={loading}
      width={820}
    >
      <div className="vertical-scrollbar scrollbar-md max-h-[70vh] overflow-y-auto">
        <Table
          columns={columns}
          dataSource={issues}
          rowKey="id"
          loading={loading}
          pagination={false}
          onChange={onTableChange}
          locale={{
            filterReset: "重置",
            filterConfirm: "确定",
          }}
          rowSelection={{
            selectedRowKeys: selectedIssueIds,
            onChange: (keys) => setSelectedIssueIds(keys),
          }}
        />
      </div>
      <div className="flex justify-end pt-3 border-t border-custom-border-100 mt-0">
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showTotal={(v) => `共 ${v} 条`}
          onChange={onPageChange}
          disabled={loading}
        />
      </div>
    </Modal>
  );
}
