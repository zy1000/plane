/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Checkbox, CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { TypeIcon } from "@/components/common/type-icon-picker";
// hooks
import { useIssueTypeCopySources } from "@/hooks/store/use-issue-type-copy-sources";
import type { TIssueType, TIssueTypeCopyPart } from "@/services/project/project-issue-type.service";

export const ALL_COPY_PARTS: TIssueTypeCopyPart[] = ["fields", "layout", "states", "workflow"];

/** 子项依赖父项：父项不勾，子项置灰且不带 */
const COPY_PART_OPTIONS: { key: TIssueTypeCopyPart; label: string; parent?: TIssueTypeCopyPart }[] = [
  { key: "fields", label: "属性" },
  { key: "layout", label: "布局", parent: "fields" },
  { key: "states", label: "状态" },
  { key: "workflow", label: "工作流", parent: "states" },
];

export const toggleCopyPart = (parts: TIssueTypeCopyPart[], key: TIssueTypeCopyPart, checked: boolean) => {
  if (checked) return ALL_COPY_PARTS.filter((item) => item === key || parts.includes(item));
  const children = COPY_PART_OPTIONS.filter((item) => item.parent === key).map((item) => item.key);
  return parts.filter((item) => item !== key && !children.includes(item));
};

const LABEL = "text-xs font-medium text-secondary";
const SELECT_BUTTON = "h-9 w-full rounded-lg border border-subtle bg-surface-1 px-2.5 text-sm";

type Props = {
  workspaceSlug: string;
  scopeKey: string | undefined;
  onScopeChange: (scopeKey: string) => void;
  sourceTypeId: string | undefined;
  onSourceTypeChange: (issueType: TIssueType) => void;
  parts: TIssueTypeCopyPart[];
  /** 没有对应管理权限、不能勾的内容 */
  lockedParts?: TIssueTypeCopyPart[];
  onPartsChange: (parts: TIssueTypeCopyPart[]) => void;
};

/** 复制类型弹窗里的「来源范围 / 来源类型 / 复制内容」三行 */
export const IssueTypeCopySourceFields = observer(function IssueTypeCopySourceFields({
  workspaceSlug,
  scopeKey,
  onScopeChange,
  sourceTypeId,
  onSourceTypeChange,
  parts,
  lockedParts = [],
  onPartsChange,
}: Props) {
  const { scopeOptions, issueTypes } = useIssueTypeCopySources(workspaceSlug, scopeKey, true);
  const selectedScope = scopeOptions.find((option) => option.key === scopeKey);
  const selectedType = issueTypes?.find((item) => item.id === sourceTypeId);

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>
            来源范围<span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <CustomSearchSelect
            value={scopeKey}
            onChange={(value: string) => onScopeChange(value)}
            options={scopeOptions.map((option) => ({
              value: option.key,
              query: option.label,
              content: (
                <span className="flex items-center gap-2">
                  <span className="truncate">{option.label}</span>
                  {option.group === "project" && <span className="shrink-0 text-xs text-tertiary">项目自定义</span>}
                </span>
              ),
            }))}
            label={
              <span className={cn("truncate", !selectedScope && "text-placeholder")}>
                {selectedScope?.label ?? "选择来源范围"}
              </span>
            }
            buttonClassName={SELECT_BUTTON}
            searchPlaceholder="搜索项目"
            maxHeight="lg"
            input
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>
            来源类型<span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <CustomSearchSelect
            value={sourceTypeId}
            onChange={(value: string) => {
              const issueType = issueTypes?.find((item) => item.id === value);
              if (issueType) onSourceTypeChange(issueType);
            }}
            options={(issueTypes ?? []).map((issueType) => ({
              value: issueType.id,
              query: issueType.name,
              content: (
                <span className="flex items-center gap-2">
                  <TypeIcon iconProps={issueType.logo_props?.icon} className="size-4 shrink-0" iconClassName="size-3" />
                  <span className="truncate">{issueType.name}</span>
                </span>
              ),
            }))}
            label={
              selectedType ? (
                <span className="flex min-w-0 items-center gap-2">
                  <TypeIcon
                    iconProps={selectedType.logo_props?.icon}
                    className="size-4 shrink-0"
                    iconClassName="size-3"
                  />
                  <span className="truncate">{selectedType.name}</span>
                </span>
              ) : (
                <span className="text-placeholder">{issueTypes === undefined ? "加载中…" : "选择来源类型"}</span>
              )
            }
            buttonClassName={SELECT_BUTTON}
            disabled={!scopeKey}
            noResultsMessage="该范围下没有类型"
            maxHeight="lg"
            input
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>复制内容</span>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-subtle px-3 py-2.5">
          {COPY_PART_OPTIONS.map((option) => {
            const locked = lockedParts.includes(option.key);
            const disabled = locked || (!!option.parent && !parts.includes(option.parent));
            return (
              <label
                key={option.key}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  disabled ? "cursor-not-allowed text-placeholder" : "cursor-pointer text-primary"
                )}
              >
                <Checkbox
                  checked={parts.includes(option.key)}
                  disabled={disabled}
                  onChange={(event) => onPartsChange(toggleCopyPart(parts, option.key, event.target.checked))}
                />
                {option.label}
                {locked && <span className="text-xs text-tertiary">（无管理权限）</span>}
                {!locked && option.parent && <span className="text-xs text-tertiary">（随{option.parent === "fields" ? "属性" : "状态"}）</span>}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-tertiary">
          {!parts.includes("states")
            ? "未复制状态，新类型使用默认状态。"
            : parts.includes("workflow") && !parts.includes("fields")
              ? "未复制属性，流转必填字段不带入。"
              : "属性中绑定字段库的字段，复制后仍绑定同一个库字段。"}
        </p>
      </div>
    </div>
  );
});
