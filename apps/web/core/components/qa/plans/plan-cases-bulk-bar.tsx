/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { Popconfirm } from "antd";
import { CheckCheck, Copy, Loader2, ShieldCheck, Unlink, UserCog, X } from "lucide-react";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

type TPlanCasesBulkBarProps = {
  assigneeUpdating?: boolean;
  canCopy?: boolean;
  canReview?: boolean;
  executeLoading?: boolean;
  onAssigneeChange: (assignee: string) => void;
  onCancelRelation: () => void;
  onClear: () => void;
  onCopyToPlan: () => void;
  onExecute: () => void;
  onReview: () => void;
  projectId?: string;
  selectedCount: number;
};

const ACTION_CLASS =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-12 font-medium whitespace-nowrap text-white/85 transition-colors hover:bg-white/12 hover:text-white";

/** 勾选用例后浮在列表底部的批量操作条 */
export const PlanCasesBulkBar = ({
  assigneeUpdating = false,
  canCopy = false,
  canReview = false,
  executeLoading = false,
  onAssigneeChange,
  onCancelRelation,
  onClear,
  onCopyToPlan,
  onExecute,
  onReview,
  projectId,
  selectedCount,
}: TPlanCasesBulkBarProps) => {
  if (selectedCount <= 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl bg-[#1c1f26] py-1.5 pr-2 pl-3.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)]">
        <span className="mr-2 flex items-center gap-2 text-12 font-semibold whitespace-nowrap text-white">
          <span className="rounded bg-accent-primary px-1.5 py-px tabular-nums">{selectedCount}</span>
          已选
        </span>

        <MemberDropdown
          multiple={false}
          value={null}
          onChange={(value) => {
            if (value) onAssigneeChange(String(value));
          }}
          disabled={assigneeUpdating}
          projectId={projectId}
          buttonVariant="transparent-with-text"
          placement="top-start"
          optionsClassName="z-[80]"
          button={
            <span className={ACTION_CLASS}>
              {assigneeUpdating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UserCog className="size-3.5" />
              )}
              {assigneeUpdating ? "更新中" : "分配执行人"}
            </span>
          }
        />

        {canReview && (
          <button type="button" onClick={onReview} className={ACTION_CLASS}>
            <ShieldCheck className="size-3.5" />
            复核
          </button>
        )}

        <Popconfirm
          title="确定将选中用例全部标记为执行成功？"
          onConfirm={onExecute}
          okText="确定"
          cancelText="取消"
          okButtonProps={{ loading: executeLoading }}
        >
          <button type="button" className={ACTION_CLASS}>
            <CheckCheck className="size-3.5" />
            标记成功
          </button>
        </Popconfirm>

        {canCopy && (
          <button type="button" onClick={onCopyToPlan} className={ACTION_CLASS}>
            <Copy className="size-3.5" />
            复制到计划
          </button>
        )}

        <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-white/20" />

        <Popconfirm title="确定取关选中用例？" onConfirm={onCancelRelation} okText="确定" cancelText="取消">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-12 font-medium whitespace-nowrap text-danger-primary transition-colors hover:bg-white/12"
          >
            <Unlink className="size-3.5" />
            取关
          </button>
        </Popconfirm>

        <button
          type="button"
          onClick={onClear}
          aria-label="清除选择"
          className="ml-1 flex size-7 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/12 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
};
