/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
// hooks
import { useLocalStorage } from "@plane/hooks";
// types
import type { TIssueExtraFieldType, TIssueExtraFieldValue } from "@plane/types";
// ui
import { ToggleSwitch } from "@plane/ui";
// shared extra-field utilities
import { ExtraFieldControl, findValueForField, getTextMode, isValueEmpty, upsertValue } from "@/components/issues/extra-fields";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
// services
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
// utils
import { cn } from "@plane/utils";
import type { TIssueOperations } from "./root";

const HIDE_EMPTY_STORAGE_KEY = "plane:issue-extra-fields:hide-empty";

const isParagraphField = (field: TTypeExtraField) =>
  field.field_type === "text" && getTextMode(field.options) === "paragraph";

// ─── 单个字段：标签在上、控件在下 ─────────────────────────────────────────────

type TFieldCellProps = {
  field: TTypeExtraField;
  projectId: string;
  issueId: string;
  value: unknown;
  onCommit: (next: TIssueExtraFieldValue["value"]) => Promise<void>;
  disabled?: boolean;
};

const FieldLabel = ({ field }: { field: TTypeExtraField }) => (
  <div className="mb-1 flex items-center gap-0.5 text-12 text-tertiary" title={field.description || undefined}>
    <span className="truncate">{field.name}</span>
    {field.is_required && <span className="text-danger-primary">*</span>}
  </div>
);

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
    <div className="-ml-1.5 min-w-0" onBlur={handleBlur} onKeyDown={handleKeyDown}>
      <ExtraFieldControl
        field={field}
        value={localValue}
        onChange={(next) => setLocalValue(next)}
        disabled={disabled}
        projectId={projectId}
        compact
        size="md"
      />
    </div>
  );
});

const ImmediateFieldCell = observer(function ImmediateFieldCell(props: TFieldCellProps) {
  const { field, projectId, value, onCommit, disabled } = props;
  return (
    <div className="-ml-1.5 flex min-h-7.5 min-w-0 items-center">
      <ExtraFieldControl
        field={field}
        value={value}
        onChange={(next) => onCommit(next)}
        disabled={disabled}
        projectId={projectId}
        compact
        size="md"
      />
    </div>
  );
});

const FieldControlCell = (props: TFieldCellProps) => {
  const isDeferred = props.field.field_type === "text" || props.field.field_type === "number";
  return isDeferred ? <DeferredFieldCell {...props} /> : <ImmediateFieldCell {...props} />;
};

// ─── 字段卡片 ─────────────────────────────────────────────────────────────────

type TIssueExtraFieldsSectionProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/**
 * 工作项类型的自定义字段，放在详情主区描述下方：
 * 短字段按容器宽度 1/2/3 列网格，段落文本各占一整行；「隐藏未填」按人记在 localStorage。
 */
export const IssueExtraFieldsSection = observer(function IssueExtraFieldsSection(
  props: TIssueExtraFieldsSectionProps
) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;

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

  const { storedValue: hideEmptyStored, setValue: setHideEmpty } = useLocalStorage<boolean>(
    HIDE_EMPTY_STORAGE_KEY,
    false
  );
  const hideEmpty = hideEmptyStored === true;

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

  const values = (issue.extra_field_values ?? []) as TIssueExtraFieldValue[];
  // 布尔字段没有「未填」：关着也是一个值
  const isEmptyField = (field: TTypeExtraField) =>
    field.field_type !== "boolean" && isValueEmpty(findValueForField(values, field.id));
  const emptyCount = activeFields.filter(isEmptyField).length;
  const visibleFields = hideEmpty ? activeFields.filter((f) => !isEmptyField(f)) : activeFields;
  const shortFields = visibleFields.filter((f) => !isParagraphField(f));
  const paragraphFields = visibleFields.filter(isParagraphField);

  const renderCell = (field: TTypeExtraField) => (
    <FieldControlCell
      key={`${issueId}-${field.id}`}
      field={field}
      projectId={projectId}
      issueId={issueId}
      value={findValueForField(values, field.id)}
      onCommit={(next) => commit(field.id, field.field_type, next)}
      disabled={disabled}
    />
  );

  return (
    <section className="@container overflow-hidden rounded-lg border border-subtle">
      <div className="flex h-11 items-center gap-2 border-b border-subtle bg-layer-1 px-4">
        <span className="text-14 font-semibold text-primary">自定义字段</span>
        <span className="rounded-full border border-subtle bg-layer-2 px-1.5 text-12 leading-[18px] font-medium text-secondary tabular-nums">
          {activeFields.length}
        </span>
        <span className="flex-1" />
        {(emptyCount > 0 || hideEmpty) && (
          <label className="flex cursor-pointer items-center gap-2 text-13 text-secondary select-none">
            <ToggleSwitch value={hideEmpty} onChange={(next) => setHideEmpty(next)} size="sm" />
            隐藏未填
          </label>
        )}
      </div>

      <div className={cn(disabled && "opacity-60")}>
        {shortFields.length > 0 && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 @md:grid-cols-2 @2xl:grid-cols-3">
            {shortFields.map((field) => (
              <div key={field.id} className="min-w-0">
                <FieldLabel field={field} />
                {renderCell(field)}
              </div>
            ))}
          </div>
        )}

        {paragraphFields.map((field, index) => (
          <div
            key={field.id}
            className={cn("px-4 py-3", (shortFields.length > 0 || index > 0) && "border-t border-subtle")}
          >
            <FieldLabel field={field} />
            {renderCell(field)}
          </div>
        ))}

        {visibleFields.length === 0 && (
          <div className="px-4 py-4 text-13 text-placeholder">{activeFields.length} 个字段都未填写</div>
        )}
      </div>
    </section>
  );
});
