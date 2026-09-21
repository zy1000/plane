/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { Popconfirm } from "antd";
import { CheckCheck, Copy, Loader2, ShieldCheck, Unlink, UserCog } from "lucide-react";
import { Button, getButtonStyling } from "@plane/propel/button";
import { BulkOperationsBar } from "@/components/common/bulk-operations-bar";
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

/** 勾选用例后浮在分页上方的批量操作条，样式与用例库批量栏一致 */
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
}: TPlanCasesBulkBarProps) => (
  <BulkOperationsBar
    selectedCount={selectedCount}
    selectedLabel={`已选 ${selectedCount} 条`}
    onClearSelection={onClear}
  >
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
        <span className={getButtonStyling("ghost", "lg")}>
          {assigneeUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <UserCog className="size-3.5" />}
          {assigneeUpdating ? "更新中" : "分配执行人"}
        </span>
      }
    />

    {canReview && (
      <Button variant="ghost" size="lg" onClick={onReview}>
        <ShieldCheck className="size-3.5" />
        复核
      </Button>
    )}

    <Popconfirm
      title="确定将选中用例全部标记为执行成功？"
      onConfirm={onExecute}
      okText="确定"
      cancelText="取消"
      okButtonProps={{ loading: executeLoading }}
    >
      <Button variant="ghost" size="lg">
        <CheckCheck className="size-3.5" />
        标记成功
      </Button>
    </Popconfirm>

    {canCopy && (
      <Button variant="ghost" size="lg" onClick={onCopyToPlan}>
        <Copy className="size-3.5" />
        复制到计划
      </Button>
    )}

    <span className="mx-0.5 h-4 border-l border-subtle" aria-hidden />

    <Popconfirm title="确定取关选中用例？" onConfirm={onCancelRelation} okText="确定" cancelText="取消">
      <Button variant="ghost" size="lg" className="text-danger-primary">
        <Unlink className="size-3.5" />
        取关
      </Button>
    </Popconfirm>
  </BulkOperationsBar>
);
