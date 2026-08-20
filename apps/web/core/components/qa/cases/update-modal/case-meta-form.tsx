"use client";
import React, { useState } from "react";
import { Select } from "antd";
import { FileText, Flag, Tag } from "lucide-react";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import * as LucideIcons from "lucide-react";

type Option = { value: string; label: React.ReactNode; title?: string; disabled?: boolean };

type CaseMetaFormProps = {
  disabled?: boolean;
  projectId?: string;
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

const fieldShell = (index: number) =>
  cn("flex min-h-7 min-w-0 flex-1 items-center", index > 0 && "border-l border-subtle pl-2.5", "pr-2.5");

const selectClassName =
  "w-full min-w-0 text-body-xs-medium [&_.ant-select-selector]:!h-7 [&_.ant-select-selector]:!px-0 [&_.ant-select-selection-item]:!text-body-xs-medium [&_.ant-select-selection-item]:!leading-5 [&_.ant-select-selection-item]:!text-secondary [&_.ant-select-selection-placeholder]:!text-placeholder";

const priorityDotClass = (label: string) => {
  if (label.includes("高")) return "bg-danger-primary";
  if (label.includes("中")) return "bg-warning-primary";
  if (label.includes("低")) return "bg-accent-primary";
  return "bg-[--border-subtle]";
};

export function CaseMetaForm(props: CaseMetaFormProps) {
  const {
    disabled = false,
    projectId,
    assignee,
    onAssigneeChange,
    onAssigneeBlur,
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

  const selectedPriorityLabel = String(
    casePriorityOptions.find((option) => String(option.value) === String(priorityValue))?.title ??
      casePriorityOptions.find((option) => String(option.value) === String(priorityValue))?.label ??
      ""
  );

  return (
    <div className={cn("mb-2 flex w-full min-w-0 flex-nowrap items-stretch text-body-xs-medium", disabled && "opacity-60")}>
      <div className={fieldShell(0)}>
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
          placeholder="维护人"
          className="group w-full min-w-0"
          buttonContainerClassName="h-7 w-full min-w-0 text-left"
          buttonVariant="transparent-with-text"
          buttonClassName="h-7 min-w-0 justify-start px-0 text-body-xs-medium leading-5 text-secondary"
          dropdownArrowClassName="h-3.5 w-3.5"
          showUserDetails={true}
          optionsClassName="z-[1200]"
        />
      </div>

      <div className={fieldShell(1)}>
        <FileText className="size-3.5 shrink-0 text-secondary" />
        <Select
          placeholder="类型"
          options={caseTypeOptions}
          value={typeValue}
          onChange={onTypeChange}
          onBlur={onTypeBlur}
          disabled={disabled}
          showSearch
          suffixIcon={null}
          variant="borderless"
          className={selectClassName}
          popupMatchSelectWidth={false}
          dropdownStyle={{ zIndex: 1200 }}
          filterOption={(input, option) =>
            String(option?.label ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
        />
      </div>

      <div className={fieldShell(2)}>
        {selectedPriorityLabel ? (
          <span className={`size-3.5 shrink-0 rounded-full ${priorityDotClass(selectedPriorityLabel)}`} />
        ) : (
          <Flag className="size-3.5 shrink-0 text-placeholder" />
        )}
        <Select
          placeholder="优先级"
          options={casePriorityOptions}
          value={priorityValue}
          onChange={onPriorityChange}
          onBlur={onPriorityBlur}
          disabled={disabled}
          showSearch
          suffixIcon={null}
          variant="borderless"
          className={selectClassName}
          popupMatchSelectWidth={false}
          dropdownStyle={{ zIndex: 1200 }}
          filterOption={(input, option) =>
            String(option?.label ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
        />
      </div>

      <div
        className={cn(fieldShell(3), "cursor-text")}
        onClick={() => {
          if (disabled) return;
          document.getElementById("meta-label-input")?.focus();
        }}
      >
        <Tag className="size-3.5 shrink-0 text-secondary" />
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {labelList.map((label) => (
            <span
              key={label.id}
              className="group inline-flex items-center gap-0.5 text-body-xs-medium leading-5 text-secondary"
            >
              {label.name}
              <span
                className={cn(
                  "text-tertiary opacity-0 transition-opacity group-hover:opacity-100",
                  disabled ? "cursor-not-allowed" : "cursor-pointer hover:text-danger-primary"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  onDeleteLabel?.(label.id);
                }}
              >
                <LucideIcons.X size={10} />
              </span>
            </span>
          ))}
          <input
            id="meta-label-input"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleCreateLabel}
            disabled={disabled}
            placeholder={labelList.length === 0 ? "添加标签" : ""}
            className="min-w-[4.5rem] bg-transparent text-body-xs-medium leading-5 text-secondary outline-none placeholder:text-placeholder disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}
