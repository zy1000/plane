"use client";
import React, { useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Clock, CheckCircle2, XCircle, ArrowRight, X, Loader2 } from "lucide-react";
import { Avatar } from "@plane/ui";
import { message } from "antd";
import { useUser } from "@/hooks/store/user";
import { useIssueApprovalStatus } from "@/hooks/store/use-issue-approval-status";
import {
  ProjectWorkflowService,
  type TTransitionRecord,
  type TApprovalRecord,
} from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

// ─── 颜色工具 ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending: "#f97316",
  approved: "#10b981",
  rejected: "#ef4444",
  cancelled: "#6b7280",
};

function tagStyle(color: string) {
  return {
    color,
    backgroundColor: `${color}22`,
    border: `1px solid ${color}55`,
  };
}

// ─── 子组件 ──────────────────────────────────────────────────────────────────

function StateChip({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return <span className="text-xs" style={{ color: "var(--color-text-tertiary, #9ca3af)" }}>初始</span>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: color ? `${color}22` : undefined,
        color: color || undefined,
        border: `1px solid ${color ? `${color}44` : "rgba(0,0,0,0.1)"}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color || "#9ca3af" }} />
      {name}
    </span>
  );
}

function ApproverRow({ rec }: { rec: TApprovalRecord }) {
  const color = rec.action === null ? STATUS_COLOR.pending
    : rec.action === "approved" ? STATUS_COLOR.approved
    : STATUS_COLOR.rejected;
  const label = rec.action === null ? "待审批" : rec.action === "approved" ? "通过" : "拒绝";
  const Icon = rec.action === null ? Clock : rec.action === "approved" ? CheckCircle2 : XCircle;

  return (
    <div className="flex items-center gap-2 py-1.5">
      <Avatar name={rec.approver_display_name} src={rec.approver_avatar_url ?? undefined} size="sm" className="flex-shrink-0" />
      <span className="flex-1 text-sm truncate">{rec.approver_display_name}</span>
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0" style={tagStyle(color)}>
        <Icon className="h-3 w-3" />
        {label}
      </span>
    </div>
  );
}

function RecordDetail({
  record,
  currentUserId,
  workspaceSlug,
  projectId,
  onActioned,
}: {
  record: TTransitionRecord;
  currentUserId: string | undefined;
  workspaceSlug: string;
  projectId: string;
  onActioned: () => void;
}) {
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const myRec = record.approval_records.find((r) => r.approver_id === currentUserId);
  const alreadyActed = myRec?.action != null;
  const canAct = record.status === "pending" && myRec !== undefined && !alreadyActed;
  const approvedCount = record.approval_records.filter((r) => r.action === "approved").length;

  const handleSubmit = async () => {
    if (!action) return;
    setIsSubmitting(true);
    try {
      await workflowService.submitApprovalAction(workspaceSlug, projectId, record.id, { action, comment });
      message.success(action === "approved" ? "审批通过" : "已拒绝");
      onActioned();
    } catch (err: any) {
      message.error(err?.error || err?.message || "审批失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusColor = STATUS_COLOR[record.status] ?? STATUS_COLOR.pending;
  const statusLabel = { pending: "待审批", approved: "已通过", rejected: "已拒绝", cancelled: "已取消" }[record.status] ?? "待审批";

  return (
    <div className="flex flex-col gap-4">
      {/* 状态 + 流转 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <StateChip name={record.from_state_name} color={record.from_state_color} />
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#9ca3af" }} />
          <StateChip name={record.to_state_name} color={record.to_state_color} />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0" style={tagStyle(statusColor)}>
          <Clock className="h-3 w-3" />
          {statusLabel}
        </span>
      </div>

      {/* 进度 */}
      <p className="text-xs" style={{ color: "#9ca3af" }}>
        审批进度：{approvedCount}/{record.approval_records.length}
        {record.required_count ? `，需 ${record.required_count} 人通过` : ""}
      </p>

      {/* 审批人列表 */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "#9ca3af" }}>审批人</p>
        <div className="space-y-0.5">
          {record.approval_records.map((rec) => (
            <ApproverRow key={rec.id} rec={rec} />
          ))}
        </div>
      </div>

      {/* 评审意见 */}
      {record.approval_records.some((r) => r.comment) && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "#9ca3af" }}>评审意见</p>
          <div className="space-y-2">
            {record.approval_records.filter((r) => r.comment).map((r) => (
              <div key={r.id} className="rounded-md p-2.5 text-sm" style={{ backgroundColor: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Avatar name={r.approver_display_name} src={r.approver_avatar_url ?? undefined} size="sm" />
                  <span className="text-xs font-medium">{r.approver_display_name}</span>
                </div>
                <p className="text-xs whitespace-pre-wrap" style={{ color: "#6b7280" }}>{r.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 操作区 */}
      {canAct && (
        <div className="pt-2 border-t" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setAction("approved")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium transition-all"
              style={action === "approved" ? tagStyle(STATUS_COLOR.approved) : undefined}
            >
              <CheckCircle2 className="h-4 w-4" />
              通过
            </button>
            <button
              type="button"
              onClick={() => setAction("rejected")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium transition-all"
              style={action === "rejected" ? tagStyle(STATUS_COLOR.rejected) : undefined}
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
            className="w-full resize-none rounded-md border px-3 py-2 text-sm outline-none transition-colors mb-2"
            style={{ backgroundColor: "transparent", borderColor: "rgba(0,0,0,0.12)" }}
          />
          <button
            type="button"
            disabled={!action || isSubmitting}
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={
              action === "approved" ? { backgroundColor: "#10b981", color: "#fff" }
              : action === "rejected" ? { backgroundColor: "#ef4444", color: "#fff" }
              : { backgroundColor: "#6b728022", color: "#6b7280", border: "1px solid #6b728055" }
            }
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? "提交中..." : action === "approved" ? "确认通过" : action === "rejected" ? "确认拒绝" : "请先选择操作"}
          </button>
        </div>
      )}

      {alreadyActed && myRec && (
        <div className="pt-2 border-t" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <div className="flex items-center gap-2 text-sm font-medium rounded-md p-2.5" style={tagStyle(myRec.action === "approved" ? STATUS_COLOR.approved : STATUS_COLOR.rejected)}>
            {myRec.action === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            你已{myRec.action === "approved" ? "通过" : "拒绝"}此审批
          </div>
        </div>
      )}

      {!canAct && !alreadyActed && record.status === "pending" && (
        <div className="pt-2 border-t" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-sm" style={{ color: "#9ca3af" }}>你不是该审批申请的审批人，仅可查看</p>
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

interface IssueApprovalTagProps {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
}

export function IssueApprovalTag({ workspaceSlug, projectId, issueId }: IssueApprovalTagProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: currentUser } = useUser();
  const { records, hasPendingApproval, isLoading, invalidate } = useIssueApprovalStatus(workspaceSlug, projectId, issueId);

  // 弹窗打开中时保持渲染，避免因 hasPendingApproval 变为 false 而闪烁关闭
  if (!hasPendingApproval && !isOpen) return null;

  const record = records[0];

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // 每次打开时强制刷新，确保显示最新的审批状态
    invalidate();
    setIsOpen(true);
  };

  const handleActioned = () => {
    invalidate();
    setIsOpen(false);
  };

  return (
    <>
      {hasPendingApproval && (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 transition-opacity hover:opacity-80"
          style={tagStyle(STATUS_COLOR.pending)}
        >
          <Clock className="h-2.5 w-2.5" />
          待审批
        </button>
      )}

      <Transition.Root show={isOpen} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>

          <div className="fixed inset-0 z-50 overflow-y-auto">
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
                <Dialog.Panel className="relative w-full max-w-md rounded-xl shadow-2xl overflow-hidden" style={{ backgroundColor: "var(--color-bg-surface-1, #fff)" }}>
                  {/* 头部 */}
                  <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                    <div className="min-w-0">
                      <p className="text-xs mb-0.5" style={{ color: "#9ca3af" }}>#{record?.issue_sequence_id}</p>
                      <Dialog.Title className="text-base font-semibold truncate">
                        {record?.issue_name ?? "审批流程"}
                      </Dialog.Title>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:opacity-60"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 内容 */}
                  <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#9ca3af" }} />
                      </div>
                    ) : record ? (
                      <RecordDetail
                        record={record}
                        currentUserId={currentUser?.id?.toString()}
                        workspaceSlug={workspaceSlug}
                        projectId={projectId}
                        onActioned={handleActioned}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                        <p className="text-sm font-medium" style={{ color: "#6b7280" }}>审批流程已取消或已完成</p>
                        <p className="text-xs" style={{ color: "#9ca3af" }}>工作项状态已被直接修改</p>
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}
