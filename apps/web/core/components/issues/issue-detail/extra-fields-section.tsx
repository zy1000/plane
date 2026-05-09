/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
// types
import type { TIssueExtraFieldType, TIssueExtraFieldValue } from "@plane/types";
// shared extra-field utilities
import {
  ExtraFieldControl,
  FIELD_TYPE_ICON,
  findValueForField,
  getTextMode,
  isValueEmpty,
  upsertValue,
} from "@/components/issues/extra-fields";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { PropertyGroupSection } from "@/components/issues/peek-overview/properties";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
// services
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
// utils
import { cn } from "@plane/utils";
import type { TIssueOperations } from "./root";

// ─── Text/Number row (deferred save on blur / Enter) ─────────────────────────

type TDeferredFieldRowProps = {
  field: TTypeExtraField;
  committedValue: unknown;
  issueId: string;
  onCommit: (next: TIssueExtraFieldValue["value"]) => Promise<void>;
  disabled?: boolean;
  /** false 时禁用 Enter 提交（段落模式允许换行） */
  commitOnEnter?: boolean;
};

const DeferredFieldRow = observer(function DeferredFieldRow(props: TDeferredFieldRowProps) {
  const { field, committedValue, issueId, onCommit, disabled, commitOnEnter = true } = props;
  const [localValue, setLocalValue] = useState<unknown>(committedValue);

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
      if (!commitOnEnter) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (localValue !== committedValue) {
          await onCommit(localValue as TIssueExtraFieldValue["value"]);
        }
        (e.target as HTMLElement).blur();
      }
    },
    [commitOnEnter, localValue, committedValue, onCommit]
  );

  const FieldIcon = FIELD_TYPE_ICON[field.field_type] ?? FIELD_TYPE_ICON.text;
  // 段落类型的文本域可拖高/多行展示，label 需要贴顶对齐而不是 y 轴居中
  const isParagraphText = field.field_type === "text" && getTextMode(field.options) === "paragraph";

  return (
    <SidebarPropertyListItem icon={FieldIcon} label={field.name} align={isParagraphText ? "start" : "center"}>
      <div
        className="w-full"
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        <ExtraFieldControl
          field={field}
          value={localValue}
          onChange={(next) => setLocalValue(next)}
          disabled={disabled}
          compact
        />
      </div>
    </SidebarPropertyListItem>
  );
});

// ─── Immediate-save row ───────────────────────────────────────────────────────

type TImmediateFieldRowProps = {
  field: TTypeExtraField;
  value: unknown;
  onCommit: (next: TIssueExtraFieldValue["value"]) => Promise<void>;
  disabled?: boolean;
};

const ImmediateFieldRow = observer(function ImmediateFieldRow(props: TImmediateFieldRowProps) {
  const { field, value, onCommit, disabled } = props;
  const FieldIcon = FIELD_TYPE_ICON[field.field_type] ?? FIELD_TYPE_ICON.text;

  return (
    <SidebarPropertyListItem icon={FieldIcon} label={field.name}>
      <ExtraFieldControl
        field={field}
        value={value}
        onChange={(next) => onCommit(next)}
        disabled={disabled}
        compact
      />
    </SidebarPropertyListItem>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

type TIssueExtraFieldsSectionProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

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

  const commit = useCallback(
    async (fieldId: string, fieldType: TIssueExtraFieldType, nextValue: TIssueExtraFieldValue["value"]) => {
      const allowedFieldIds = new Set((fields ?? []).map((field) => field.id));
      const current = (issue?.extra_field_values ?? []) as TIssueExtraFieldValue[];
      const filteredCurrent = current.filter((item) => allowedFieldIds.has(item.extra_field_id));
      const merged = upsertValue(filteredCurrent, fieldId, fieldType, nextValue);
      await issueOperations.update(workspaceSlug, projectId, issueId, { extra_field_values: merged });
    },
    [fields, issue?.extra_field_values, issue?.type_id, issueOperations, workspaceSlug, projectId, issueId]
  );

  // fields === null: 尚未确定（embedded 未到，缓存未命中，请求在途）
  // fields.length === 0: 确定无字段
  // 两种情况都不渲染，不显示骨架，避免无字段类型先占位后消失
  if (!issue || fields === null || fields.length === 0) return null;

  const activeFields = fields.filter((f) => f.is_active !== false);
  if (activeFields.length === 0) return null;

  return (
    <PropertyGroupSection title="自定义">
      <div className={cn("space-y-2", disabled && "opacity-60")}>
        {activeFields.map((field) => {
          const currentValue = findValueForField(
            (issue.extra_field_values ?? []) as TIssueExtraFieldValue[],
            field.id
          );
          const isDeferred = field.field_type === "text" || field.field_type === "number";

          if (isDeferred) {
            const commitOnEnter = !(field.field_type === "text" && getTextMode(field.options) === "paragraph");
            return (
              <DeferredFieldRow
                key={`${issueId}-${field.id}`}
                field={field}
                committedValue={isValueEmpty(currentValue) ? "" : currentValue}
                issueId={issueId}
                onCommit={(next) => commit(field.id, field.field_type, next)}
                disabled={disabled}
                commitOnEnter={commitOnEnter}
              />
            );
          }

          return (
            <ImmediateFieldRow
              key={field.id}
              field={field}
              value={currentValue}
              onCommit={(next) => commit(field.id, field.field_type, next)}
              disabled={disabled}
            />
          );
        })}
      </div>
    </PropertyGroupSection>
  );
});
