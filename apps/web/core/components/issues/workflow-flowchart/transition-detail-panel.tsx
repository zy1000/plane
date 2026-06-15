/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { ArrowRight, Play, Tag, UserCheck, UserCog, Users, X } from "lucide-react";
import type { TFlowchartState, TFlowchartTransition } from "@/services/project/project-workflow.service";
import { ApprovalRuleBadge, PrincipalGroup, StateNode } from "./flow-shared";

type Props = {
  transition: TFlowchartTransition;
  fromState: TFlowchartState | null;
  toState: TFlowchartState | null;
  isInitial: boolean;
  onClose: () => void;
};

/** 点击某条流转后从右侧滑入的详情面板：发起人 / 目标负责人 / 审批人 / 必填字段 */
export function TransitionDetailPanel({ transition, fromState, toState, isInitial, onClose }: Props) {
  return (
    <div className="animate-slide-in-from-right absolute inset-y-0 right-0 z-20 flex w-[320px] max-w-[85%] flex-col border-l border-subtle bg-surface-1 shadow-raised-200">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-subtle px-4 py-3">
        <p className="text-sm font-semibold text-primary">流转详情</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
          aria-label="关闭详情"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* from → to */}
        <div className="flex flex-wrap items-center gap-2">
          {isInitial ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-accent-primary/40 bg-accent-primary/10 px-2.5 py-1 text-sm font-medium text-accent-primary">
              <Play className="h-3 w-3 fill-current" />
              初始流转
            </span>
          ) : (
            <StateNode state={fromState} />
          )}
          <ArrowRight className="h-4 w-4 flex-shrink-0 text-tertiary" />
          <StateNode state={toState} />
        </div>

        <div>
          <ApprovalRuleBadge transition={transition} />
        </div>

        <div className="h-px bg-border-subtle" />

        <PrincipalGroup
          icon={<Users className="h-3 w-3" />}
          label="发起人"
          items={transition.initiators}
          emptyLabel="全部成员"
        />
        <PrincipalGroup
          icon={<UserCog className="h-3 w-3" />}
          label="目标负责人"
          items={transition.assignees}
          emptyLabel="不约束"
        />
        <PrincipalGroup
          icon={<UserCheck className="h-3 w-3" />}
          label="审批人"
          items={transition.approvers}
          emptyLabel="无需审批"
        />

        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-tertiary">
            <Tag className="h-3 w-3" />
            必填字段
          </div>
          {transition.required_fields.length === 0 ? (
            <span className="text-xs text-tertiary">无</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {transition.required_fields.map((field) => (
                <span
                  key={field.id}
                  className="inline-flex items-center gap-1 rounded-md border border-subtle bg-layer-2 px-2 py-0.5 text-xs text-secondary"
                >
                  {field.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
