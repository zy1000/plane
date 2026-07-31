"use client";
import React, { useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { ArrowRight, CheckCircle2, XCircle, Clock, ChevronLeft, X, Loader2, Search } from "lucide-react";
import { Avatar } from "@plane/ui";
import { cn } from "@plane/utils";
import { message } from "antd";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { useWorkflowApprovals } from "@/hooks/store/use-workflow-approvals";
import type { TTransitionRecord, TApprovalRecord } from "@/services/project/project-workflow.service";

type TTab = "pending" | "processed";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  pending: {
    label: "待审批",
    color: "#f97316",
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    label: "已通过",
    color: "#10b981",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: "已拒绝",
    color: "#ef4444",
    icon: <XCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: "已取消",
    color: "#6b7280",
    icon: <XCircle className="h-3 w-3" />,
  },
};

const APPROVER_ACTION_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  pending: {
    label: "待审批",
    color: "#f97316",
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    label: "通过",
    color: "#10b981",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: "拒绝",
    color: "#ef4444",
    icon: <XCircle className="h-3 w-3" />,
  },
};

function StatusTag({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0"
      style={{
        color: cfg.color,
        backgroundColor: `${cfg.color}22`,
        border: `1px solid ${cfg.color}55`,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ActionTag({ action }: { action: string | null }) {
  const key = action ?? "pending";
  const cfg = APPROVER_ACTION_CONFIG[key] ?? APPROVER_ACTION_CONFIG.pending;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0"
      style={{
        color: cfg.color,
        backgroundColor: `${cfg.color}22`,
        border: `1px solid ${cfg.color}55`,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function StateChip({
  name,
  color,
  group,
}: {
  name: string | null;
  color: string | null;
  group: string | null;
}) {
  if (!name) return <span className="text-tertiary text-xs">初始</span>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: color ? `${color}22` : "var(--bg-layer-2)",
        color: color || "var(--text-primary)",
        border: `1px solid ${color ? `${color}44` : "var(--border-subtle)"}`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color || "var(--text-secondary)" }}
      />
      {name}
    </span>
  );
}

function ApproverRow({ rec }: { rec: TApprovalRecord }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Avatar
        name={rec.approver_display_name}
        src={rec.approver_avatar_url ?? undefined}
        size="sm"
        className="flex-shrink-0"
      />
      <span className="flex-1 text-sm text-primary truncate">{rec.approver_display_name}</span>
      <ActionTag action={rec.action} />
    </div>
  );
}

function RecordCard({
  record,
  isSelected,
  onClick,
  myAction,
}: {
  record: TTransitionRecord;
  isSelected: boolean;
  onClick: () => void;
  myAction: "approved" | "rejected" | null | undefined;
}) {
  const approvedCount = record.approval_records.filter((r) => r.action === "approved").length;
  const total = record.approval_records.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm",
        isSelected
          ? "border-accent-primary bg-accent-subtle/10 shadow-sm"
          : "border-subtle bg-surface-1 hover:border-secondary"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs text-tertiary mb-0.5">
            #{record.issue_sequence_id}
          </p>
          <p className="text-sm font-medium text-primary truncate">{record.issue_name}</p>
        </div>
        <StatusTag status={record.status} />
      </div>

      <div className="flex items-center gap-1.5 text-xs text-secondary">
        <StateChip
          name={record.from_state_name}
          color={record.from_state_color}
          group={record.from_state_group}
        />
        <ArrowRight className="h-3 w-3 flex-shrink-0" />
        <StateChip
          name={record.to_state_name}
          color={record.to_state_color}
          group={record.to_state_group}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-tertiary">
        <span>
          已通过 {approvedCount}/{total}
          {record.required_count ? `（需 ${record.required_count}）` : ""}
        </span>
        {myAction != null && (
          <ActionTag action={myAction} />
        )}
      </div>
    </button>
  );
}

function DetailPanel({
  record,
  currentUserId,
  getAssigneeLabel,
  onSubmit,
  isSubmitting,
}: {
  record: TTransitionRecord;
  currentUserId: string | undefined;
  getAssigneeLabel: (userId: string) => string;
  onSubmit: (action: "approved" | "rejected", comment: string) => void;
  isSubmitting: boolean;
}) {
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);
  const [comment, setComment] = useState("");

  const myRec = record.approval_records.find((r) => r.approver_id === currentUserId);
  const alreadyActed = myRec?.action != null;
  const canAct = record.status === "pending" && myRec !== undefined && !alreadyActed;
  const targetAssigneeNames = (record.target_assignee_ids ?? []).map((userId) => getAssigneeLabel(userId));

  const approvedCount = record.approval_records.filter((r) => r.action === "approved").length;
  const total = record.approval_records.length;

  const handleSubmit = () => {
    if (!action) {
      message.warning("请选择通过或拒绝");
      return;
    }
    onSubmit(action, comment);
    setAction(null);
    setComment("");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 详情内容（头信息 + 变更原因 + 审批人统一滚动，避免中间区域被头/操作区挤扁） */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 border-b border-subtle">
          <div className="flex items-start gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-tertiary mb-0.5">#{record.issue_sequence_id}</p>
              <h3 className="text-base font-semibold text-primary break-words">{record.issue_name}</h3>
            </div>
            <div className="mt-1 flex-shrink-0">
              <StatusTag status={record.status} />
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <StateChip
              name={record.from_state_name}
              color={record.from_state_color}
              group={record.from_state_group}
            />
            <ArrowRight className="h-4 w-4 text-tertiary" />
            <StateChip
              name={record.to_state_name}
              color={record.to_state_color}
              group={record.to_state_group}
            />
          </div>

          <div className="mt-2 text-xs text-secondary">
            审批进度：{approvedCount}/{total}
            {record.required_count ? `，需 ${record.required_count} 人通过` : ""}
          </div>

          {record.target_assignee_ids !== null && (
            <div className="mt-2 rounded-md border border-subtle bg-layer-1 px-2.5 py-2 text-xs text-secondary">
              <p className="font-medium text-primary">审批通过后负责人将更新为：</p>
              <p className="mt-1">
                {targetAssigneeNames.length > 0 ? targetAssigneeNames.join("、") : "无负责人"}
              </p>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="mb-4 rounded-md border border-subtle bg-layer-1 px-2.5 py-2 text-xs text-secondary">
            <p className="font-medium text-primary">变更原因</p>
            <p className="mt-1 whitespace-pre-wrap break-words">
              {record.approval_reason?.trim() || "未填写"}
            </p>
          </div>

          <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">审批人</p>
          <div className="space-y-0.5">
            {record.approval_records.map((rec) => (
              <ApproverRow key={rec.id} rec={rec} />
            ))}
          </div>

          {record.approval_records.some((r) => r.comment) && (
            <div className="mt-4">
              <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">评审意见</p>
              <div className="space-y-2">
                {record.approval_records
                  .filter((r) => r.comment)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="rounded-md bg-layer-1 border border-subtle p-2.5 text-sm"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Avatar
                          name={r.approver_display_name}
                          src={r.approver_avatar_url ?? undefined}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-primary">{r.approver_display_name}</span>
                      </div>
                      <p className="text-xs text-secondary whitespace-pre-wrap">{r.comment}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 操作区（仅 pending 且我是审批人且未操作时显示） */}
      {canAct && (
        <div className="px-4 py-3 border-t border-subtle flex-shrink-0 bg-surface-1">
          <p className="text-xs font-medium text-secondary mb-2">提交审批</p>

          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setAction("approved")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-sm font-medium transition-all"
              style={
                action === "approved"
                  ? { borderColor: "#10b981", backgroundColor: "#10b98122", color: "#10b981" }
                  : undefined
              }
            >
              <CheckCircle2 className="h-4 w-4" />
              通过
            </button>
            <button
              type="button"
              onClick={() => setAction("rejected")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-sm font-medium transition-all"
              style={
                action === "rejected"
                  ? { borderColor: "#ef4444", backgroundColor: "#ef444422", color: "#ef4444" }
                  : undefined
              }
            >
              <XCircle className="h-4 w-4" />
              拒绝
            </button>
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="添加审批意见（可选）"
            rows={2}
            className="w-full resize-none rounded-md border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/60 transition-colors mb-2"
          />

          <button
            type="button"
            disabled={!action || isSubmitting}
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={
              action === "approved"
                ? { backgroundColor: "#10b981", color: "#ffffff" }
                : action === "rejected"
                  ? { backgroundColor: "#ef4444", color: "#ffffff" }
                  : { backgroundColor: "#6b728022", color: "#6b7280", border: "1px solid #6b728055" }
            }
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? "提交中..." : action === "approved" ? "确认通过" : action === "rejected" ? "确认拒绝" : "请先选择操作"}
          </button>
        </div>
      )}

      {alreadyActed && (
        <div className="p-4 border-t border-subtle flex-shrink-0 bg-surface-1">
          <div
            className={cn(
              "flex items-center gap-2 text-sm font-medium rounded-md p-2.5",
              myRec.action === "approved"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            )}
          >
            {myRec.action === "approved" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            你已{myRec.action === "approved" ? "通过" : "拒绝"}此审批
          </div>
        </div>
      )}

      {!myRec && record.status === "pending" && (
        <div className="p-4 border-t border-subtle flex-shrink-0 bg-surface-1">
          <p className="text-sm text-secondary">你不是该审批申请的审批人</p>
        </div>
      )}
    </div>
  );
}

export function WorkflowApprovalModal({ isOpen, onClose, workspaceSlug, projectId }: Props) {
  const [activeTab, setActiveTab] = useState<TTab>("pending");
  const [selectedRecord, setSelectedRecord] = useState<TTransitionRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: currentUser } = useUser();
  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
  } = useMember();

  const {
    pendingRecords,
    processedRecords,
    isLoading,
    fetchPendingApprovals,
    fetchProcessedApprovals,
    submitAction,
  } = useWorkflowApprovals(workspaceSlug, projectId);

  // 弹窗打开时拉取数据
  useEffect(() => {
    if (!isOpen) return;
    fetchPendingApprovals();
  }, [isOpen, fetchPendingApprovals]);

  useEffect(() => {
    if (!isOpen) return;
    if (!getProjectMemberIds(projectId, false)) {
      fetchProjectMembers(workspaceSlug, projectId);
    }
  }, [fetchProjectMembers, getProjectMemberIds, isOpen, projectId, workspaceSlug]);

  useEffect(() => {
    if (!isOpen || activeTab !== "processed") return;
    fetchProcessedApprovals();
  }, [isOpen, activeTab, fetchProcessedApprovals]);

  // 选中项随列表刷新后同步
  useEffect(() => {
    if (!selectedRecord) return;
    const list = activeTab === "pending" ? pendingRecords : processedRecords;
    const fresh = list.find((r) => r.id === selectedRecord.id);
    if (fresh) setSelectedRecord(fresh);
    else setSelectedRecord(null);
  }, [pendingRecords, processedRecords]);

  const handleTabChange = (tab: TTab) => {
    setActiveTab(tab);
    setSelectedRecord(null);
    setSearchQuery("");
    if (tab === "pending") fetchPendingApprovals();
    else fetchProcessedApprovals();
  };

  const handleSubmit = async (action: "approved" | "rejected", comment: string) => {
    if (!selectedRecord) return;
    setIsSubmitting(true);
    try {
      await submitAction(selectedRecord.id, { action, comment });
      message.success(action === "approved" ? "审批通过" : "已拒绝");
      setSelectedRecord(null);
    } catch (err: any) {
      message.error(err?.error || err?.message || "审批失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const records = activeTab === "pending" ? pendingRecords : processedRecords;

  const filteredRecords = searchQuery.trim()
    ? records.filter((r) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          r.issue_name?.toLowerCase().includes(q) ||
          String(r.issue_sequence_id).includes(q)
        );
      })
    : records;

  const getCurrentUserId = (): string | undefined => currentUser?.id?.toString();
  const getAssigneeLabel = (userId: string) => getUserDetails(userId)?.display_name ?? "未知成员";

  return (
    <Transition.Root show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-30" onClose={onClose}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-backdrop transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-30 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-6xl rounded-xl bg-surface-1 shadow-raised-200 overflow-hidden flex flex-col"
                style={{ height: "min(92vh, 900px)" }}
              >
                {/* 头部 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-subtle flex-shrink-0">
                  <div>
                    <Dialog.Title className="text-base font-semibold text-primary">
                      工作流审批
                    </Dialog.Title>
                    <p className="text-xs text-secondary mt-0.5">管理需要你审批的状态变更申请</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Tab 栏 */}
                <div className="flex border-b border-subtle flex-shrink-0 px-5">
                  {(["pending", "processed"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => handleTabChange(tab)}
                      className={cn(
                        "relative px-4 py-3 text-sm font-medium transition-colors -mb-px",
                        activeTab === tab
                          ? "text-accent-primary border-b-2 border-accent-primary"
                          : "text-secondary hover:text-primary"
                      )}
                    >
                      {tab === "pending" ? "待我审批" : "已审批"}
                      {tab === "pending" && pendingRecords.length > 0 && (
                        <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {pendingRecords.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* 主体（左右分栏） */}
                <div className="flex flex-1 overflow-hidden">
                  {/* 左：列表 */}
                  <div className="w-80 flex-shrink-0 border-r border-subtle flex flex-col overflow-hidden">
                    {/* 搜索框 */}
                    <div className="px-3 pt-3 pb-2 flex-shrink-0">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tertiary pointer-events-none" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="搜索编号或标题..."
                          className="w-full rounded-md border border-subtle bg-surface-2 pl-8 pr-3 py-1.5 text-sm text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/60 transition-colors"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary hover:text-primary transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isLoading ? (
                      <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
                      </div>
                    ) : filteredRecords.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-secondary">
                        <CheckCircle2 className="h-10 w-10 opacity-20" />
                        <p className="text-sm">
                          {searchQuery ? "未找到匹配的申请" : activeTab === "pending" ? "暂无待审批申请" : "暂无已审批记录"}
                        </p>
                      </div>
                    ) : (
                      <div
                        className="flex-1 overflow-y-auto p-3 space-y-2"
                        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-scrollbar, #cbd5e1) transparent" }}
                      >
                        {filteredRecords.map((record) => {
                          const myRec = record.approval_records.find(
                            (r) => r.approver_id === currentUser?.id?.toString()
                          );
                          return (
                            <RecordCard
                              key={record.id}
                              record={record}
                              isSelected={selectedRecord?.id === record.id}
                              onClick={() => setSelectedRecord(record)}
                              myAction={myRec?.action}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 右：详情 */}
                  <div className="flex-1 overflow-hidden">
                    {selectedRecord ? (
                      <DetailPanel
                        record={selectedRecord}
                        currentUserId={getCurrentUserId()}
                        getAssigneeLabel={getAssigneeLabel}
                        onSubmit={handleSubmit}
                        isSubmitting={isSubmitting}
                      />
                    ) : (
                      <div className="flex flex-1 h-full flex-col items-center justify-center gap-2 text-secondary">
                        <ChevronLeft className="h-8 w-8 opacity-20" />
                        <p className="text-sm">从左侧选择一条申请查看详情</p>
                      </div>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
