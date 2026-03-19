"use client";
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Avatar } from "@plane/ui";
import { cn } from "@plane/utils";
import { message } from "antd";
import { useUser } from "@/hooks/store/user";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";
import type { TTransitionRecord, TApprovalRecord } from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

// ── 状态/动作配色 ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "待审批", color: "#f97316" },
  approved: { label: "已通过", color: "#10b981" },
  rejected: { label: "已拒绝", color: "#ef4444" },
  cancelled: { label: "已取消", color: "#6b7280" },
};

const ACTION_CONFIG: Record<string, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  pending: { label: "待审批", color: "#f97316", Icon: Loader2 },
  approved: { label: "通过", color: "#10b981", Icon: CheckCircle2 },
  rejected: { label: "拒绝", color: "#ef4444", Icon: XCircle },
};

function Tag({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0"
      style={{ color: cfg.color, backgroundColor: `${cfg.color}22`, border: `1px solid ${cfg.color}55` }}
    >
      {cfg.label}
    </span>
  );
}

function ActionTag({ action }: { action: string | null }) {
  const key = action ?? "pending";
  const cfg = ACTION_CONFIG[key] ?? ACTION_CONFIG.pending;
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: cfg.color, backgroundColor: `${cfg.color}22`, border: `1px solid ${cfg.color}55` }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function StateChip({ name, color }: { name: string | null; color: string | null }) {
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
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color || "var(--text-secondary)" }} />
      {name}
    </span>
  );
}

function ApproverRow({ rec }: { rec: TApprovalRecord }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Avatar name={rec.approver_display_name} src={rec.approver_avatar_url ?? undefined} size="sm" className="flex-shrink-0" />
      <span className="flex-1 text-sm text-primary truncate">{rec.approver_display_name}</span>
      <ActionTag action={rec.action} />
    </div>
  );
}

// ── 主组件 ─────────────────────────────────────────────────────────────────────

type Props = {
  workspaceSlug: string;
  projectId: string;
  transitionRecordId: string;
};

export function ApprovalNotificationPanel({ workspaceSlug, projectId, transitionRecordId }: Props) {
  const { data: currentUser } = useUser();
  const [record, setRecord] = useState<TTransitionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);
  const [comment, setComment] = useState("");

  // 拉取单条审批记录
  useEffect(() => {
    setIsLoading(true);
    setRecord(null);
    workflowService
      .fetchTransitionRecord(workspaceSlug, projectId, transitionRecordId)
      .then(setRecord)
      .catch(() => message.error("加载审批记录失败"))
      .finally(() => setIsLoading(false));
  }, [workspaceSlug, projectId, transitionRecordId]);

  const myRec = record?.approval_records.find((r) => r.approver_id === currentUser?.id?.toString());
  const alreadyActed = myRec?.action != null;
  const canAct = record?.status === "pending" && myRec !== undefined && !alreadyActed;
  const approvedCount = record?.approval_records.filter((r) => r.action === "approved").length ?? 0;
  const total = record?.approval_records.length ?? 0;

  const handleSubmit = async () => {
    if (!action) { message.warning("请选择通过或拒绝"); return; }
    setIsSubmitting(true);
    try {
      const updated = await workflowService.submitApprovalAction(workspaceSlug, projectId, transitionRecordId, { action, comment });
      setRecord(updated);
      setAction(null);
      setComment("");
      message.success(action === "approved" ? "审批通过" : "已拒绝");
    } catch (err: any) {
      message.error(err?.error || err?.message || "审批失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-secondary">
        审批记录不存在或已被删除
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 头部信息 */}
      <div className="p-4 border-b border-subtle flex-shrink-0">
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <Link
              href={`/${workspaceSlug}/projects/${projectId}/issues/${record.issue_id}`}
              className="group inline-flex flex-col gap-0.5 hover:no-underline"
            >
              <p className="text-xs text-tertiary mb-0.5 group-hover:text-accent-primary transition-colors">
                #{record.issue_sequence_id}
              </p>
              <h3 className="text-base font-semibold text-primary break-words group-hover:text-accent-primary transition-colors">
                {record.issue_name}
              </h3>
            </Link>
          </div>
          <div className="mt-1 flex-shrink-0">
            <Tag status={record.status} />
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <StateChip name={record.from_state_name} color={record.from_state_color} />
          <ArrowRight className="h-4 w-4 text-tertiary" />
          <StateChip name={record.to_state_name} color={record.to_state_color} />
        </div>

        <div className="mt-2 text-xs text-secondary">
          审批进度：{approvedCount}/{total}
          {record.required_count ? `，需 ${record.required_count} 人通过` : ""}
        </div>
      </div>

      {/* 审批人列表 */}
      <div className="flex-1 overflow-y-auto p-4">
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
                  <div key={r.id} className="rounded-md bg-layer-1 border border-subtle p-2.5 text-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Avatar name={r.approver_display_name} src={r.approver_avatar_url ?? undefined} size="sm" />
                      <span className="text-xs font-medium text-primary">{r.approver_display_name}</span>
                    </div>
                    <p className="text-xs text-secondary whitespace-pre-wrap">{r.comment}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* 操作区 */}
      {canAct && (
        <div className="p-4 border-t border-subtle flex-shrink-0 bg-surface-1">
          <p className="text-xs font-medium text-secondary mb-3">提交审批</p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setAction("approved")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium transition-all"
              style={action === "approved" ? { borderColor: "#10b981", backgroundColor: "#10b98122", color: "#10b981" } : undefined}
            >
              <CheckCircle2 className="h-4 w-4" />
              通过
            </button>
            <button
              type="button"
              onClick={() => setAction("rejected")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium transition-all"
              style={action === "rejected" ? { borderColor: "#ef4444", backgroundColor: "#ef444422", color: "#ef4444" } : undefined}
            >
              <XCircle className="h-4 w-4" />
              拒绝
            </button>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="添加审批意见（可选）"
            rows={3}
            className="w-full resize-none rounded-md border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/60 transition-colors mb-3"
          />
          <button
            type="button"
            disabled={!action || isSubmitting}
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className={cn("flex items-center gap-2 text-sm font-medium rounded-md p-2.5",
            myRec.action === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          )}>
            {myRec.action === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
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
