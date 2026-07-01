"use client";
import React, { useState } from "react";
import { Select } from "antd";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import * as LucideIcons from "lucide-react";

type Option = { value: string; label: React.ReactNode; title?: string; disabled?: boolean };

type CaseMetaFormProps = {
  disabled?: boolean;
  projectId?: string;
  code?: string;
  onCodeChange?: (v: string) => void;
  onCodeBlur?: () => void;
  assignee?: string;
  onAssigneeChange: (v: any) => void;
  onAssigneeBlur: () => void;
  assigneeOptions: Option[];

  stateValue?: string;
  onStateChange: (v: any) => void;
  onStateBlur: () => void;
  caseStateOptions: Option[];

  typeValue?: string;
  onTypeChange: (v: any) => void;
  onTypeBlur: () => void;
  caseTypeOptions: Option[];

  priorityValue?: string;
  onPriorityChange: (v: any) => void;
  onPriorityBlur: () => void;
  casePriorityOptions: Option[];

  labelList?: any[];
  onCreateLabel?: (name: string) => void;
  onDeleteLabel?: (id: string) => void;
};

export function CaseMetaForm(props: CaseMetaFormProps) {
  const {
    disabled = false,
    projectId,
    code,
    onCodeChange,
    onCodeBlur,
    assignee,
    onAssigneeChange,
    onAssigneeBlur,
    assigneeOptions,
    stateValue,
    onStateChange,
    onStateBlur,
    caseStateOptions,
    typeValue,
    onTypeChange,
    onTypeBlur,
    caseTypeOptions,
    priorityValue,
    onPriorityChange,
    onPriorityBlur,
    casePriorityOptions,
    labelList = [],
    onCreateLabel,
    onDeleteLabel,
  } = props;

  const [labelInput, setLabelInput] = useState("");

  const handleCreateLabel = () => {
    if (disabled) return;
    const name = labelInput.trim();
    if (name && onCreateLabel) {
      onCreateLabel(name);
      setLabelInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateLabel();
    }
  };

  return (
    <div className="mb-5">
      <div className="ml-[10px] grid grid-cols-5 gap-2">
        <div>
          <label className="mb-1 ml-[10px] block text-sm font-medium text-secondary">维护人</label>
          <div className="w-full rounded-md border border-transparent text-sm ring-1 ring-transparent transition-colors focus-within:border-accent-subtle focus-within:ring-accent-subtle hover:border-accent-subtle">
            <MemberDropdown
              multiple={false}
              projectId={projectId ? String(projectId) : undefined}
              value={assignee ?? null}
              onChange={(val) => {
                if (disabled) return;
                onAssigneeChange(val);
                setTimeout(() => onAssigneeBlur(), 0);
              }}
              disabled={disabled}
              placeholder="请选择维护人"
              className="w-full text-sm"
              buttonContainerClassName="w-full text-left"
              buttonVariant="transparent-with-text"
              buttonClassName="text-sm"
              dropdownArrowClassName="h-3.5 w-3.5"
              showUserDetails={true}
              optionsClassName="z-[1200]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 ml-[6px] block text-sm font-medium text-secondary">用例编号</label>
          <div className="w-full rounded-md border border-transparent text-sm ring-1 ring-transparent transition-colors focus-within:border-accent-subtle focus-within:ring-accent-subtle hover:border-accent-subtle">
            <input
              value={code ?? ""}
              onChange={(e) => onCodeChange?.(e.target.value)}
              onBlur={onCodeBlur}
              disabled={disabled}
              placeholder="例如：ABC-123"
              className="w-full bg-transparent px-2 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:text-secondary"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 ml-[6px] block text-sm font-medium text-secondary">用例类型</label>
          <div className="w-full rounded-md border border-transparent text-sm ring-1 ring-transparent transition-colors focus-within:border-accent-subtle focus-within:ring-accent-subtle hover:border-accent-subtle">
            <Select
              placeholder="请选择用例类型"
              options={caseTypeOptions}
              value={typeValue}
              onChange={onTypeChange}
              onBlur={onTypeBlur}
              disabled={disabled}
              showSearch
              suffixIcon={null}
              variant="borderless"
              className="w-full text-sm"
              dropdownStyle={{ zIndex: 1200 }}
              filterOption={(input, option) =>
                String(option?.label ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            />
          </div>
        </div>
        <div>
          <label className="mb-1 ml-[10px] block text-sm font-medium text-secondary">优先级</label>
          <div className="w-full rounded-md border border-transparent text-sm ring-1 ring-transparent transition-colors focus-within:border-accent-subtle focus-within:ring-accent-subtle hover:border-accent-subtle">
            <Select
              placeholder="请选择优先级"
              options={casePriorityOptions}
              value={priorityValue}
              onChange={onPriorityChange}
              onBlur={onPriorityBlur}
              disabled={disabled}
              showSearch
              suffixIcon={null}
              variant="borderless"
              className="w-full text-sm"
              dropdownStyle={{ zIndex: 1200 }}
              filterOption={(input, option) =>
                String(option?.label ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1 ml-[10px] block text-sm font-medium text-secondary">标签</label>
          <div
            className="flex min-h-[32px] cursor-text flex-wrap items-center gap-2 rounded border border-transparent bg-white p-1 transition-colors focus-within:border-subtle"
            onClick={() => {
              if (disabled) return;
              const input = document.getElementById("meta-label-input");
              input?.focus();
            }}
          >
            {labelList.map((label) => (
              <div
                key={label.id}
                className="group flex items-center gap-1 rounded border border-accent-subtle bg-accent-subtle px-2 py-0.5 text-xs text-accent-primary"
              >
                <span>{label.name}</span>
                <span
                  className={`opacity-50 transition-opacity ${
                    disabled ? "cursor-not-allowed" : "cursor-pointer group-hover:opacity-100 hover:text-danger-primary"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (disabled) return;
                    onDeleteLabel?.(label.id);
                  }}
                >
                  <LucideIcons.X size={12} />
                </span>
              </div>
            ))}

            <input
              id="meta-label-input"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCreateLabel}
              disabled={disabled}
              placeholder={labelList.length === 0 ? "输入标签名称" : ""}
              className="min-w-[60px] flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:text-secondary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
