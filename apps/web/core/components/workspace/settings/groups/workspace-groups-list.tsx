/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { ConfigProvider, Table } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import { PencilIcon, ChevronDown, Trash2Icon, UsersRound } from "lucide-react";
import type { IWorkspaceGroup, IWorkspaceGroupMember, IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { GroupFormModal } from "./group-form-modal";
import { GroupMembersRolesManager } from "./group-members-roles-manager";

type TMemberOption = {
  id: string;
  memberId: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
};

type TGroupDetail = {
  members: IWorkspaceGroupMember[];
  roles: IWorkspaceGroupRole[];
  isLoading: boolean;
  loaded: boolean;
};

type Props = {
  groups: IWorkspaceGroup[];
  /** 未经过搜索筛选的团队总数；传入后与 `groups` 对比可区分「暂无团队」与「没有匹配的团队」 */
  totalGroupCount?: number;
  isLoading: boolean;
  isAdmin: boolean;
  onRequestCreate?: () => void;
  getGroupDetail: (groupId: string) => TGroupDetail;
  loadGroupDetail: (groupId: string) => Promise<void>;
  availableRoles: IWorkspaceRole[];
  memberOptions: TMemberOption[];
  onUpdate: (groupId: string, data: { name: string; description: string }) => Promise<void>;
  onDelete: (groupId: string) => Promise<void>;
  onAddMember: (groupId: string, memberId: string) => Promise<void>;
  onRemoveMember: (groupId: string, membershipId: string) => Promise<void>;
  onAddRole: (groupId: string, roleId: string) => Promise<void>;
  onRemoveRole: (groupId: string, groupRoleId: string) => Promise<void>;
};

export function WorkspaceGroupsList(props: Props) {
  const {
    groups,
    totalGroupCount: totalGroupCountProp,
    isLoading,
    isAdmin,
    getGroupDetail,
    loadGroupDetail,
    availableRoles,
    memberOptions,
    onUpdate,
    onDelete,
    onAddMember,
    onRemoveMember,
    onAddRole,
    onRemoveRole,
    onRequestCreate,
  } = props;

  const totalGroupCount = totalGroupCountProp ?? groups.length;
  const isSearchNoResults = groups.length === 0 && totalGroupCount > 0;

  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [editingGroup, setEditingGroup] = useState<IWorkspaceGroup | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  useEffect(() => {
    const validIds = new Set(groups.map((g) => g.id));
    setExpandedRowKeys((prev) => prev.filter((id) => validIds.has(id)));
  }, [groups]);

  const handleExpand = (expanded: boolean, record: IWorkspaceGroup) => {
    if (expanded) void loadGroupDetail(record.id);
    setExpandedRowKeys((prev) =>
      expanded ? [...prev, record.id] : prev.filter((id) => id !== record.id)
    );
  };

  const handleUpdateGroup = async (data: { name: string; description: string }) => {
    if (!editingGroup) return;
    await onUpdate(editingGroup.id, data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: "团队信息已更新" });
  };

  const handleDeleteGroup = async (group: IWorkspaceGroup) => {
    if (!confirm(`确定要删除团队「${group.name}」吗？此操作不可恢复。`)) return;
    setDeletingGroupId(group.id);
    try {
      await onDelete(group.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已删除", message: `团队「${group.name}」已删除` });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: "请稍后重试" });
    } finally {
      setDeletingGroupId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="divide-y-[0.5px] divide-subtle border-t border-subtle">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex animate-pulse items-center gap-4 bg-surface-1 px-4 py-4">
            <div className="size-9 rounded-lg bg-layer-transparent-hover" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-40 rounded bg-layer-transparent-hover" />
              <div className="h-3 w-full max-w-md rounded bg-layer-transparent-hover" />
            </div>
            <div className="hidden h-3 w-16 rounded bg-layer-transparent-hover sm:block" />
            <div className="size-6 rounded bg-layer-transparent-hover" />
          </div>
        ))}
      </div>
    );
  }

  const columns: ColumnsType<IWorkspaceGroup> = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      onCell: () => ({ style: { minWidth: 200 } }),
      render: (name: string) => (
        <span className="truncate text-body-sm-semibold text-primary">{name}</span>
      ),
    },
    {
      title: "描述",
      key: "description",
      ellipsis: true,
      onCell: () => ({ style: { minWidth: 160 } }),
      render: (_: unknown, record: IWorkspaceGroup) => (
        <span className="line-clamp-1 text-body-xs-regular text-tertiary">
          {record.description?.trim() ? record.description : "—"}
        </span>
      ),
    },
    {
      title: "成员数",
      dataIndex: "member_count",
      key: "member_count",
      align: "center",
      width: 100,
      render: (count: number) => (
        <span className="block text-center tabular-nums text-body-xs-regular text-secondary">{count}</span>
      ),
    },
    {
      title: "角色数",
      dataIndex: "role_count",
      key: "role_count",
      align: "center",
      width: 100,
      render: (count: number) => (
        <span className="block text-center tabular-nums text-body-xs-regular text-secondary">{count}</span>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 128,
      render: (date: string) => (
        <span className="tabular-nums text-body-xs-regular text-secondary">
          {renderFormattedPayloadDate(date) ?? "—"}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            title: "操作",
            key: "actions",
            align: "center",
            width: 116,
            fixed: "right",
            render: (_: unknown, record: IWorkspaceGroup) => (
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingGroup(record);
                  }}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-layer-1-hover hover:text-primary"
                  aria-label="编辑团队"
                  title="编辑"
                >
                  <PencilIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteGroup(record);
                  }}
                  disabled={deletingGroupId === record.id}
                  className={cn(
                    "flex size-7 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-red-500/10 hover:text-red-600",
                    deletingGroupId === record.id && "cursor-wait opacity-50"
                  )}
                  aria-label="删除团队"
                  title="删除"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            ),
          } satisfies ColumnsType<IWorkspaceGroup>[number],
        ]
      : []),
  ];

  const expandable: TableProps<IWorkspaceGroup>["expandable"] = {
    expandedRowKeys,
    onExpand: handleExpand,
    expandedRowRender: (record) => {
      const detail = getGroupDetail(record.id);
      return (
        <div className="border-t border-subtle bg-canvas">
          <GroupMembersRolesManager
            variant="embedded"
            group={record}
            members={detail.members}
            roles={detail.roles}
            isDetailLoading={detail.isLoading}
            availableRoles={availableRoles}
            memberOptions={memberOptions}
            isAdmin={isAdmin}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAddMember={onAddMember}
            onRemoveMember={onRemoveMember}
            onAddRole={onAddRole}
            onRemoveRole={onRemoveRole}
          />
        </div>
      );
    },
    expandIcon: ({ expanded, onExpand, record }) => (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExpand(record, e);
        }}
        aria-expanded={expanded}
        aria-label={expanded ? "收起详情" : "展开详情"}
        className="flex cursor-pointer items-center justify-center rounded p-1 text-secondary transition-colors duration-200 hover:bg-layer-1-hover"
      >
        <ChevronDown
          className={cn("size-4 transition-transform duration-300 ease-out", expanded && "rotate-180")}
        />
      </button>
    ),
    expandRowByClick: true,
    columnWidth: 40,
    fixed: "right",
  };

  return (
    <div
      className={cn(
        "border-t border-subtle",
        // 消除 antd 展开行单元格的默认内边距，让 GroupMembersRolesManager 完整撑满
        "[&_.ant-table-expanded-row>td]:p-0",
        // 展开行不显示 antd 默认的列分隔线
        "[&_.ant-table-expanded-row>td]:border-0",
        // 表头字体匹配 text-body-xs-medium（0.75rem / 500）
        "[&_.ant-table-thead>tr>th]:py-2.5",
        "[&_.ant-table-thead>tr>th]:text-body-xs-medium",
        // 消除 antd 行展开图标列的多余 padding
        "[&_.ant-table-row-expand-icon-cell]:px-0",
        "[&_.ant-table-row-expand-icon-cell]:pr-2"
      )}
    >
      <ConfigProvider
        theme={{
          token: {
            // 基底容器背景 → 行背景跟随 surface-1
            colorBgContainer: "var(--background-color-surface-1)",
          },
          components: {
            Table: {
              // 表头
              headerBg: "var(--background-color-surface-1)",
              headerColor: "var(--text-color-placeholder)",
              headerSplitColor: "transparent",
              headerBorderRadius: 0,
              // 分隔线颜色
              borderColor: "var(--border-color-subtle)",
              // 行悬浮背景 → layer-1-hover（对应 surface-1 上的 hover）
              rowHoverBg: "var(--background-color-layer-1-hover)",
              // 选中行（不使用 row selection，保持与普通行一致）
              rowSelectedBg: "var(--background-color-surface-1)",
              rowSelectedHoverBg: "var(--background-color-layer-1-hover)",
              // 排序列背景（不使用排序，透明即可）
              bodySortBg: "transparent",
              // 单元格内边距
              cellPaddingBlock: 14,
              cellPaddingInline: 16,
              // 展开图标背景透明
              expandIconBg: "transparent",
              // 底部背景
              footerBg: "transparent",
            },
          },
        }}
      >
        <Table<IWorkspaceGroup>
          dataSource={groups}
          columns={columns}
          expandable={expandable}
          rowKey="id"
          locale={{
            emptyText: (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-layer-1">
                  <UsersRound className="size-5 text-placeholder" />
                </div>
                {isSearchNoResults ? (
                  <p className="text-body-sm-regular text-tertiary">没有匹配的团队</p>
                ) : (
                  <>
                    <p className="text-body-sm-regular text-tertiary">暂无团队</p>
                    {isAdmin && onRequestCreate && (
                      <button
                        type="button"
                        onClick={onRequestCreate}
                        className="mt-2 cursor-pointer text-body-xs-medium text-custom-primary-100 transition-colors hover:underline"
                      >
                        点击新建
                      </button>
                    )}
                  </>
                )}
              </div>
            ),
          }}
          pagination={false}
          sticky
          scroll={{ x: 720 }}
          rowClassName="cursor-pointer"
        />
      </ConfigProvider>
      <GroupFormModal
        isOpen={Boolean(editingGroup)}
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSubmit={handleUpdateGroup}
      />
    </div>
  );
}
