/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { ChevronRight, Eye, EyeOff } from "lucide-react";
// hooks
import { useLocalStorage } from "@plane/hooks";
// types
import type { TIssueExtraFieldType, TIssueExtraFieldValue } from "@plane/types";
// shared extra-field utilities
import {
  ExtraFieldControl,
  findValueForField,
  getSelectOptions,
  getTextMode,
  isValueEmpty,
  upsertValue,
} from "@/components/issues/extra-fields";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
import { useMember } from "@/hooks/store/use-member";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
// services
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
// utils
import { cn, renderFormattedDate } from "@plane/utils";
import type { TIssueOperations } from "./root";

const HIDE_EMPTY_STORAGE_KEY = "plane:issue-extra-fields:hide-empty";
const COLLAPSED_STORAGE_KEY = "plane:issue-extra-fields:collapsed";

const isParagraphField = (field: TTypeExtraField) =>
  field.field_type === "text" && getTextMode(field.options) === "paragraph";

/** 区块标题按类型叫：「缺陷(软件)」→「缺陷信息」；取不到类型名时仍叫「自定义字段」 */
const getSectionTitle = (typeName: string | undefined) => {
  const base = typeName?.replace(/\s*[(（][^()（）]*[)）]\s*$/, "").trim();
  return base ? `${base}信息` : "自定义字段";
};

// ─── 单个字段：标签（名称）、值 ─────────────────────────────────────

type TFieldCellProps = {
  field: TTypeExtraField;
  projectId: string;
  issueId: string;
  value: unknown;
  onCommit: (next: TIssueExtraFieldValue["value"]) => Promise<void>;
  disabled?: boolean;
};

const FieldLabel = ({ field, required }: { field: TTypeExtraField; required: boolean }) => {
  return (
    <div
      className="flex min-h-[22px] min-w-0 items-center gap-2 text-14 text-secondary"
      title={field.description || field.name}
    >
      <span className="truncate">{field.name}</span>
      {required && <span className="-ml-1.5 text-danger-primary">*</span>}
    </div>
  );
};

/** 文本 / 数字：失焦或回车（段落除外）才提交 */
const DeferredFieldCell = observer(function DeferredFieldCell(props: TFieldCellProps) {
  const { field, projectId, issueId, value, onCommit, disabled } = props;
  const committedValue = isValueEmpty(value) ? "" : value;
  const [localValue, setLocalValue] = useState<unknown>(committedValue);
  const commitOnEnter = !isParagraphField(field);

  useEffect(() => {
    setLocalValue(committedValue);
  }, [committedValue, issueId, field.id]);

  const handleBlur = useCallback(async () => {
    if (localValue !== committedValue) {
      await onCommit(localValue as TIssueExtraFieldValue["value"]);
    }
  }, [localValue, committedValue, onCommit]);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (!commitOnEnter || e.key !== "Enter") return;
      e.preventDefault();
      if (localValue !== committedValue) {
        await onCommit(localValue as TIssueExtraFieldValue["value"]);
      }
      (e.target as HTMLElement).blur();
    },
    [commitOnEnter, localValue, committedValue, onCommit]
  );

  return (
    <div className="min-w-0" onBlur={handleBlur} onKeyDown={handleKeyDown}>
      <ExtraFieldControl
        field={field}
        value={localValue}
        onChange={(next) => setLocalValue(next)}
        disabled={disabled}
        projectId={projectId}
        size="md"
      />
    </div>
  );
});

const ImmediateFieldCell = observer(function ImmediateFieldCell(props: TFieldCellProps) {
  const { field, projectId, value, onCommit, disabled } = props;
  return (
    <div className="flex min-w-0 items-center">
      <ExtraFieldControl
        field={field}
        value={value}
        onChange={(next) => onCommit(next)}
        disabled={disabled}
        projectId={projectId}
        size="md"
      />
    </div>
  );
});

const FieldControlCell = (props: TFieldCellProps) => {
  const isDeferred = props.field.field_type === "text" || props.field.field_type === "number";
  return isDeferred ? <DeferredFieldCell {...props} /> : <ImmediateFieldCell {...props} />;
};

const toIdList = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : isValueEmpty(value) ? [] : [String(value)];

/** 只读态：值一律排成纯文本，空值「未填写」，不渲染灰掉的输入框 */
const ReadOnlyFieldValue = observer(function ReadOnlyFieldValue({ field, value }: { field: TTypeExtraField; value: unknown }) {
  const { getUserDetails } = useMember();
  const text = (content: string) => <span className="font-medium break-all text-primary">{content}</span>;

  if (field.field_type === "boolean") return text(value === true || value === "true" || value === 1 ? "是" : "否");
  if (isValueEmpty(value)) return <span className="text-tertiary">未填写</span>;

  switch (field.field_type) {
    case "date":
      return <span className="font-medium text-primary tabular-nums">{renderFormattedDate(value as string) ?? String(value)}</span>;
    case "select": {
      const options = getSelectOptions(field);
      return text(toIdList(value).map((key) => options.find((option) => option.key === key)?.label ?? key).join("、"));
    }
    case "user":
      return text(toIdList(value).map((id) => getUserDetails(id)?.display_name ?? id).join("、"));
    default:
      if (isParagraphField(field)) {
        return <div className="leading-relaxed break-words whitespace-pre-wrap text-primary">{String(value)}</div>;
      }
      return text(String(value));
  }
});

// ─── 字段区块 ─────────────────────────────────────────────────────────────────

type TIssueExtraFieldsSectionProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  /** 只读：值按文本展示，不出输入控件 */
  disabled?: boolean;
  /** 整块压暗（无权限 / 已归档）。不传时跟随 disabled；只是未进编辑态的只读不该压暗 */
  dimmed?: boolean;
};

/**
 * 工作项类型的自定义字段，放在详情主区描述下方：
 * 去框的属性清单，标签在左、值在右，容器够宽时两列；段落文本各占一整行。
 * 「隐藏未填」按人记在 localStorage，只作用于查看态，编辑态总是列出全部字段。
 * 标题行最右的箭头收起/展开整块，同样按人记在 localStorage。
 */
export const IssueExtraFieldsSection = observer(function IssueExtraFieldsSection(
  props: TIssueExtraFieldsSectionProps
) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled, dimmed = disabled } = props;

  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);

  const { fields } = useIssueTypeExtraFields(
    workspaceSlug,
    projectId,
    issue?.type_id ?? null,
    issue?.type_extra_fields ?? null
  );
  const { issueTypes } = useProjectIssueTypes(workspaceSlug, projectId);

  const { storedValue: hideEmptyStored, setValue: setHideEmpty } = useLocalStorage<boolean>(
    HIDE_EMPTY_STORAGE_KEY,
    false
  );
  const hideEmpty = hideEmptyStored === true;
  const { storedValue: collapsedStored, setValue: setCollapsed } = useLocalStorage<boolean>(
    COLLAPSED_STORAGE_KEY,
    false
  );
  const collapsed = collapsedStored === true;

  const commit = useCallback(
    async (fieldId: string, fieldType: TIssueExtraFieldType, nextValue: TIssueExtraFieldValue["value"]) => {
      const allowedFieldIds = new Set((fields ?? []).map((field) => field.id));
      const current = (issue?.extra_field_values ?? []) as TIssueExtraFieldValue[];
      const filteredCurrent = current.filter((item) => allowedFieldIds.has(item.extra_field_id));
      const merged = upsertValue(filteredCurrent, fieldId, fieldType, nextValue);
      await issueOperations.update(workspaceSlug, projectId, issueId, { extra_field_values: merged });
    },
    [fields, issue?.extra_field_values, issueOperations, workspaceSlug, projectId, issueId]
  );

  // fields === null: 尚未确定（embedded 未到，缓存未命中，请求在途）
  // fields.length === 0: 确定无字段
  // 两种情况都不渲染，不显示骨架，避免无字段类型先占位后消失
  if (!issue || fields === null || fields.length === 0) return null;

  const activeFields = fields.filter((f) => f.is_active !== false);
  if (activeFields.length === 0) return null;

  const isEditing = !disabled;
  const title = getSectionTitle(issueTypes?.find((type) => type.id === issue.type_id)?.name);
  const values = (issue.extra_field_values ?? []) as TIssueExtraFieldValue[];
  // 布尔字段没有「未填」：关着也是一个值
  const isEmptyField = (field: TTypeExtraField) =>
    field.field_type !== "boolean" && isValueEmpty(findValueForField(values, field.id));
  const emptyCount = activeFields.filter(isEmptyField).length;
  const visibleFields = hideEmpty && !isEditing ? activeFields.filter((f) => !isEmptyField(f)) : activeFields;
  const shortFields = visibleFields.filter((f) => !isParagraphField(f));
  const paragraphFields = visibleFields.filter(isParagraphField);

  const renderValue = (field: TTypeExtraField) =>
    isEditing ? (
      <FieldControlCell
        key={`${issueId}-${field.id}`}
        field={field}
        projectId={projectId}
        issueId={issueId}
        value={findValueForField(values, field.id)}
        onCommit={(next) => commit(field.id, field.field_type, next)}
      />
    ) : (
      <div className="min-w-0 text-14 leading-[22px]">
        <ReadOnlyFieldValue field={field} value={findValueForField(values, field.id)} />
      </div>
    );

  return (
    // 标题与字段名左缩 11px，对齐上方快捷操作按钮组的图标（1px 边框 + px-2.5）
    <section className="@container">
      <div className="flex h-9 items-center gap-2 rounded-md bg-layer-1 pr-3 pl-[11px]">
        {/* 标题字号、颜色与下方字段名一致 */}
        <span className="text-14 text-secondary">{title}</span>
        <span className="text-14 text-tertiary tabular-nums">{activeFields.length}</span>
        <span className="flex-1" />
        {!collapsed && !isEditing && emptyCount > 0 && (
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-13 text-secondary hover:bg-layer-transparent-hover"
            onClick={() => setHideEmpty(!hideEmpty)}
          >
            {hideEmpty ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {hideEmpty ? `显示未填 ${emptyCount}` : "隐藏未填"}
          </button>
        )}
        <button
          type="button"
          className="-mr-2 flex size-7 shrink-0 items-center justify-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "展开" : "收起"}
          title={collapsed ? "展开" : "收起"}
        >
          <ChevronRight className={cn("size-3.5 transition-transform duration-200", !collapsed && "rotate-90")} />
        </button>
      </div>

      <div className={cn(collapsed && "hidden", dimmed && "opacity-60")}>
        {shortFields.length > 0 && (
          <div className="grid grid-cols-1 gap-x-12 @2xl:grid-cols-2">
            {shortFields.map((field) => (
              <div
                key={field.id}
                className={cn(
                  "grid min-w-0 grid-cols-[7.25rem_minmax(0,1fr)] gap-x-3 border-b border-subtle pl-[11px]",
                  isEditing ? "items-center py-1.5" : "items-start py-2"
                )}
              >
                <FieldLabel field={field} required={isEditing && field.is_required} />
                {renderValue(field)}
              </div>
            ))}
          </div>
        )}

        {paragraphFields.map((field, index) => (
          <div
            key={field.id}
            className={cn(
              "flex flex-col gap-1.5 py-2.5 pl-[11px]",
              index < paragraphFields.length - 1 && "border-b border-subtle"
            )}
          >
            <FieldLabel field={field} required={isEditing && field.is_required} />
            <div>{renderValue(field)}</div>
          </div>
        ))}

        {visibleFields.length === 0 && (
          <div className="py-3 pl-[11px] text-13 text-placeholder">{activeFields.length} 个字段都未填写</div>
        )}
      </div>
    </section>
  );
});
