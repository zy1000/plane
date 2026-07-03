/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import { GitBranch, X } from "lucide-react";
import { cn } from "@plane/utils";
import type { TWorkflowFlowchart } from "@/services/project/project-workflow.service";
import { IssueTypeGlyph } from "./workflow-flowchart/flow-shared";
import { WorkflowFlowGraph } from "./workflow-flowchart/workflow-flow-graph";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  flowcharts: TWorkflowFlowchart[];
  isLoading: boolean;
};

function FlowchartBody({ flowchart }: { flowchart: TWorkflowFlowchart }) {
  const hasTransitions = flowchart.transitions.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 工作流信息条 */}
      <div className="m-4 mb-0 flex flex-shrink-0 items-start gap-3 rounded-xl border border-subtle bg-layer-1 px-4 py-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
          <GitBranch className="h-4 w-4 rotate-90" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-primary">{flowchart.workflow.name}</p>
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              启用中
            </span>
          </div>
          {flowchart.workflow.description ? (
            <p className="mt-0.5 truncate text-xs text-secondary">{flowchart.workflow.description}</p>
          ) : null}
        </div>
      </div>

      {hasTransitions ? (
        <div className="mt-3 min-h-0 flex-1">
          <WorkflowFlowGraph flowchart={flowchart} />
        </div>
      ) : (
        <div className="m-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-subtle text-center">
          <GitBranch className="h-8 w-8 rotate-90 text-tertiary" strokeWidth={1.2} />
          <p className="text-sm text-secondary">该工作流暂未配置任何状态流转</p>
        </div>
      )}
    </div>
  );
}

function BodySkeleton() {
  return (
    <div className="space-y-4 p-5">
      <div className="h-14 animate-pulse rounded-xl bg-layer-1" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2.5">
          <div className="h-5 w-40 animate-pulse rounded bg-layer-1" />
          <div className="h-28 animate-pulse rounded-lg border border-subtle bg-layer-1" />
        </div>
      ))}
    </div>
  );
}

export function WorkflowFlowchartModal({ isOpen, onClose, flowcharts, isLoading }: Props) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // 打开或数据变化时，确保选中项有效；优先保留已选类型
  useEffect(() => {
    if (!isOpen) return;
    setSelectedId((prev) =>
      prev && flowcharts.some((item) => item.issue_type_id === prev) ? prev : flowcharts[0]?.issue_type_id
    );
  }, [isOpen, flowcharts]);

  const selected = flowcharts.find((item) => item.issue_type_id === selectedId) ?? flowcharts[0];
  const showSidebar = flowcharts.length > 1;
  const isEmpty = !isLoading && flowcharts.length === 0;

  if (!isOpen) return null;

  return (
    <Dialog as="div" className="relative z-30" open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 bg-backdrop" />

      <div className="fixed inset-0 z-30 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <Dialog.Panel
            className="relative flex w-full flex-col overflow-hidden rounded-xl bg-surface-1 shadow-raised-200"
            style={{ width: "96vw", maxWidth: 1600, height: "94vh" }}
          >
            {/* 头部 */}
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-subtle px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                  <GitBranch className="h-5 w-5 rotate-90" />
                </span>
                <div>
                  <Dialog.Title className="text-base font-semibold text-primary">工作流流程图</Dialog.Title>
                  <p className="mt-0.5 text-xs text-secondary">查看各工作项类型启用中的状态流转与审批规则</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 主体 */}
            <div className="flex min-h-0 flex-1">
              {showSidebar && (
                <aside className="w-52 flex-shrink-0 overflow-y-auto border-r border-subtle p-3">
                  <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-tertiary">
                    工作项类型
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {flowcharts.map((item) => {
                      const isSelected = item.issue_type_id === selected?.issue_type_id;
                      return (
                        <button
                          key={item.issue_type_id}
                          type="button"
                          onClick={() => setSelectedId(item.issue_type_id)}
                          className={cn(
                            "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all duration-150",
                            isSelected
                              ? "bg-accent-primary/10 font-medium text-accent-primary"
                              : "text-secondary hover:bg-layer-1 hover:text-primary"
                          )}
                        >
                          <IssueTypeGlyph logoProps={item.logo_props} className="h-3.5 w-3.5" />
                          <span className="truncate text-sm">{item.issue_type_name}</span>
                          {isSelected && (
                            <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </aside>
              )}

              <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                {isLoading ? (
                  <BodySkeleton />
                ) : isEmpty ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <GitBranch className="h-10 w-10 rotate-90 text-tertiary" strokeWidth={1.2} />
                    <div>
                      <p className="text-sm font-medium text-secondary">该项目暂无启用中的工作流</p>
                      <p className="mt-1 text-xs text-tertiary">在项目设置中为工作项类型启用工作流后即可查看流程图</p>
                    </div>
                  </div>
                ) : selected ? (
                  <FlowchartBody key={selected.issue_type_id} flowchart={selected} />
                ) : null}
              </main>
            </div>
          </Dialog.Panel>
        </div>
      </div>
    </Dialog>
  );
}
