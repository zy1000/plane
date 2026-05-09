/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState } from "react";
import { ArrowRight, Check, ChevronRight, Tag } from "lucide-react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { IState, TStateGroups } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn } from "@plane/utils";
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
import { useMember } from "@/hooks/store/use-member";
import {
  WORKFLOW_SPECIAL_APPROVER_OPTIONS,
  getWorkflowApproverLabel,
} from "./approver-utils";

export type TStatePanelConfig = {
  type: "state";
  availableStates: IState[];
  currentValue: string | null;
  onConfirm: (stateId: string) => void;
};

export type TMemberPanelConfig = {
  type: "member";
  projectId: string;
  currentValue: string[];
  requiredCount: number;
  isNofM: boolean;
  readOnly?: boolean;
  onConfirm: (memberIds: string[], count: number, useNofM: boolean) => void;
  /** 当设置时，底部按钮变为 Next，点击后调用此回调而不关闭面板（由调用方负责打开下一个面板）。 */
  onNext?: (memberIds: string[], count: number, useNofM: boolean) => void;
};

export type TFlowPanelConfig = {
  type: "flow";
  onConfirm: () => void;
};

export type TFieldsPanelConfig = {
  type: "fields";
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  currentValue: string[];
  readOnly?: boolean;
  onConfirm: (extraFieldIds: string[]) => void;
};

export type TPanelConfig = TStatePanelConfig | TMemberPanelConfig | TFlowPanelConfig | TFieldsPanelConfig;

const STATE_GROUP_ORDER: TStateGroups[] = ["backlog", "unstarted", "started", "completed", "cancelled"];
const STATE_GROUP_LABELS: Record<TStateGroups, string> = {
  backlog: "Backlog",
  unstarted: "Unstarted",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
};

const StatePanel: FC<{ config: TStatePanelConfig; onConfirm: (stateId: string) => void }> = ({
  config,
  onConfirm,
}) => {
  const [selected, setSelected] = useState<string | null>(config.currentValue);
  const [search, setSearch] = useState("");

  const filtered = search
    ? config.availableStates.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : config.availableStates;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="p-3 border-b border-subtle">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search states"
          className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {STATE_GROUP_ORDER.map((group) => {
          const statesInGroup = filtered.filter((s) => s.group === group);
          if (statesInGroup.length === 0) return null;
          return (
            <div key={group} className="mb-2">
              <p className="px-2 py-1 text-xs font-medium text-tertiary">{STATE_GROUP_LABELS[group]}</p>
              {statesInGroup.map((state) => (
                <button
                  key={state.id}
                  type="button"
                  onClick={() => setSelected(state.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1"
                >
                  <div
                    className={cn(
                      "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      selected === state.id
                        ? "border-accent-primary bg-accent-primary"
                        : "border-secondary bg-transparent"
                    )}
                  >
                    {selected === state.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <StateGroupIcon stateGroup={state.group} color={state.color} size={EIconSize.SM} />
                  <span className="truncate text-primary">{state.name}</span>
                </button>
              ))}
            </div>
          );
        })}

        <div className="mt-2">
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            className="flex w-full items-center justify-center gap-1 rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const MemberPanel: FC<{
  config: TMemberPanelConfig;
  onClose: () => void;
  onConfirm: (memberIds: string[], count: number, useNofM: boolean) => void;
}> = ({ config, onClose, onConfirm }) => {
  const readOnly = config.readOnly ?? false;
  const [selected, setSelected] = useState<string[]>(config.currentValue);
  const [requiredCount, setRequiredCount] = useState(config.requiredCount);
  const [useNofM, setUseNofM] = useState(config.isNofM);
  const [search, setSearch] = useState("");

  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();

  const memberIds = getProjectMemberIds(config.projectId, false) ?? [];
  const isAllSelected = selected.length === 0;
  const filteredSpecialOptions = WORKFLOW_SPECIAL_APPROVER_OPTIONS.filter((option) =>
    `${option.label} ${option.description}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredIds = search
    ? memberIds.filter((id) => {
        const user = getUserDetails(id);
        return (
          user?.display_name?.toLowerCase().includes(search.toLowerCase()) ||
          user?.email?.toLowerCase().includes(search.toLowerCase())
        );
      })
    : memberIds;

  const handleSelectAll = () => {
    if (readOnly) return;
    setSelected([]);
    setRequiredCount(1);
  };

  const handleToggle = (id: string) => {
    if (readOnly) return;
    const newSelected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    const newCount = Math.min(requiredCount, Math.max(1, newSelected.length));
    setSelected(newSelected);
    setRequiredCount(newCount);
    // auto-disable n_of_m when fewer than 2 members selected
    if (newSelected.length < 2) setUseNofM(false);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="p-3 border-b border-subtle">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members"
          className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* All option */}
        {!search && (
          <button
            type="button"
            onClick={handleSelectAll}
            className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                  isAllSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                )}
              >
                {isAllSelected && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <span className="font-medium text-primary">All</span>
            </div>
            <span className="text-xs text-tertiary">Default</span>
          </button>
        )}

        {/* special approver options */}
        {filteredSpecialOptions.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleToggle(option.id)}
              className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-layer-1"
            >
              <div
                className={cn(
                  "mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                  isSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                )}
              >
                {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-primary">{option.label}</p>
                <p className="text-xs text-secondary">{option.description}</p>
              </div>
            </button>
          );
        })}

        {/* member list */}
        {filteredIds.map((id) => {
          const user = getUserDetails(id);
          if (!user) return null;
          const isSelected = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleToggle(id)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1"
            >
              <div
                className={cn(
                  "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                  isSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                )}
              >
                {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <Avatar name={user.display_name} src={user.avatar_url} size="sm" className="flex-shrink-0" />
              <span className="truncate text-primary">{getWorkflowApproverLabel(id, getUserDetails)}</span>
            </button>
          );
        })}

        {/* n_of_m — only when 2+ specific members selected */}
        {!isAllSelected && selected.length >= 2 && (
          <div className="mt-2 border-t border-subtle px-2 pt-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => !readOnly && setUseNofM((v) => !v)}
                disabled={readOnly}
                className={cn(
                  "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                  useNofM ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent",
                  readOnly && "cursor-default opacity-60"
                )}
              >
                {useNofM && <Check className="h-2.5 w-2.5 text-white" />}
              </button>
              <span className="flex-1 text-xs text-secondary">最少需要审批人数</span>
              {useNofM && (
                <input
                  type="number"
                  min={1}
                  max={selected.length}
                  value={requiredCount}
                  readOnly={readOnly}
                  onChange={(e) => {
                    if (readOnly) return;
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setRequiredCount(Math.min(Math.max(1, v), selected.length));
                  }}
                  className={cn(
                    "w-12 rounded border border-subtle bg-surface-2 px-1.5 py-0.5 text-center text-sm font-medium text-primary outline-none",
                    readOnly ? "cursor-default opacity-60" : "focus:border-accent-primary/50"
                  )}
                />
              )}
            </div>
          </div>
        )}

        <div className="mt-3">
          {readOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-subtle bg-surface-2 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-3"
            >
              关闭
            </button>
          ) : config.onNext ? (
            <button
              type="button"
              onClick={() => config.onNext!(selected, requiredCount, useNofM)}
              className="flex w-full items-center justify-center gap-1 rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm(selected, requiredCount, useNofM)}
              className="flex w-full items-center justify-center gap-1 rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FieldsPanel: FC<{
  config: TFieldsPanelConfig;
  onClose: () => void;
  onConfirm: (extraFieldIds: string[]) => void;
}> = ({ config, onClose, onConfirm }) => {
  const readOnly = config.readOnly ?? false;
  const [selected, setSelected] = useState<string[]>(config.currentValue);
  const [search, setSearch] = useState("");

  const { fields, isLoading } = useIssueTypeExtraFields(
    config.workspaceSlug,
    config.projectId,
    config.issueTypeId,
    undefined,
    { lite: true }
  );

  const filtered = search
    ? (fields ?? []).filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : (fields ?? []);

  const handleToggle = (id: string) => {
    if (readOnly) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-subtle p-3">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索字段"
          className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <p className="px-2 py-4 text-center text-xs text-tertiary">加载中...</p>
        ) : filtered.length === 0 && !search ? (
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
            <Tag className="h-6 w-6 text-tertiary" strokeWidth={1.2} />
            <p className="text-xs text-tertiary">该工作项类型暂无可选字段</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-2 text-center text-xs text-tertiary">无匹配字段</p>
        ) : (
          filtered.map((field) => {
            const isSelected = selected.includes(field.id);
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => handleToggle(field.id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1"
              >
                <div
                  className={cn(
                    "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                    isSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent",
                    readOnly && "cursor-default opacity-60"
                  )}
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className="truncate text-primary">{field.name}</span>
              </button>
            );
          })
        )}

        <div className="mt-3">
          {readOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-subtle bg-surface-2 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-3"
            >
              关闭
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              className="flex w-full items-center justify-center gap-1 rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FlowPanel: FC<{ config: TFlowPanelConfig; onConfirm: () => void }> = ({ config, onConfirm }) => {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-accent-primary bg-accent-subtle/10 p-3 transition-colors">
          <div className="flex h-5 items-center">
            <div className="flex h-4 w-4 items-center justify-center rounded-full border border-accent-primary bg-accent-primary">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-primary">Transition</span>
            <span className="text-xs text-secondary leading-relaxed">
              Define the path through which your work process, ensuring every work item follows the right steps.
            </span>
          </div>
        </label>

        <div className="mt-3">
          <button
            type="button"
            onClick={onConfirm}
            className="flex w-full items-center justify-center gap-1 rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

type TWorkflowSidePanelProps = {
  config: TPanelConfig;
  onClose: () => void;
};

export const WorkflowSidePanel: FC<TWorkflowSidePanelProps> = ({ config, onClose }) => {
  const titleMap: Record<TPanelConfig["type"], string> = {
    state: "States",
    member: "Members",
    flow: "Flow",
    fields: "必填字段",
  };
  const title = titleMap[config.type];

  const handleStateConfirm = (stateId: string) => {
    if (config.type === "state") {
      onClose();
      config.onConfirm(stateId);
    }
  };

  const handleMemberConfirm = (memberIds: string[], count: number, useNofM: boolean) => {
    if (config.type === "member") {
      onClose();
      config.onConfirm(memberIds, count, useNofM);
    }
  };

  const handleFlowConfirm = () => {
    if (config.type === "flow") {
      onClose();
      config.onConfirm();
    }
  };

  const handleFieldsConfirm = (extraFieldIds: string[]) => {
    if (config.type === "fields") {
      onClose();
      config.onConfirm(extraFieldIds);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-subtle bg-surface-1 overflow-hidden">
      {/* panel header */}
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-medium text-primary">{title}</h3>
      </div>

      {config.type === "state" && <StatePanel config={config} onConfirm={handleStateConfirm} />}
      {config.type === "member" && <MemberPanel config={config} onClose={onClose} onConfirm={handleMemberConfirm} />}
      {config.type === "flow" && <FlowPanel config={config} onConfirm={handleFlowConfirm} />}
      {config.type === "fields" && (
        <FieldsPanel config={config} onClose={onClose} onConfirm={handleFieldsConfirm} />
      )}
    </div>
  );
};
