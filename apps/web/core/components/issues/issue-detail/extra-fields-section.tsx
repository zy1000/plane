/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
// types
import type { TIssueExtraFieldType, TIssueExtraFieldValue } from "@plane/types";
// shared extra-field utilities
import {
  ExtraFieldControl,
  FIELD_TYPE_ICON,
  findValueForField,
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
  onCommit: (next: TIssueExtraFieldValue["value"]) => Promise<void>;
  disabled?: boolean;
};

const DeferredFieldRow = observer(function DeferredFieldRow(props: TDeferredFieldRowProps) {
  const { field, committedValue, onCommit, disabled } = props;
  const [localValue, setLocalValue] = useState<unknown>(committedValue);

  const handleBlur = useCallback(async () => {
    if (localValue !== committedValue) {
      await onCommit(localValue as TIssueExtraFieldValue["value"]);
    }
  }, [localValue, committedValue, onCommit]);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (localValue !== committedValue) {
          await onCommit(localValue as TIssueExtraFieldValue["value"]);
        }
        (e.target as HTMLElement).blur();
      }
    },
    [localValue, committedValue, onCommit]
  );

  const FieldIcon = FIELD_TYPE_ICON[field.field_type] ?? FIELD_TYPE_ICON.text;

  return (
    <SidebarPropertyListItem
      icon={FieldIcon}
      label={field.name + (field.is_required ? " *" : "")}
    >
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
    <SidebarPropertyListItem icon={FieldIcon} label={field.name + (field.is_required ? " *" : "")}>
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

  const buildMergedValues = useCallback(
    (fieldId: string, fieldType: TIssueExtraFieldType, nextValue: TIssueExtraFieldValue["value"]) => {
      const current = (issue?.extra_field_values ?? []) as TIssueExtraFieldValue[];
      return upsertValue(current, fieldId, fieldType, nextValue);
    },
    [issue?.extra_field_values]
  );

  const commit = useCallback(
    async (fieldId: string, fieldType: TIssueExtraFieldType, nextValue: TIssueExtraFieldValue["value"]) => {
      const merged = buildMergedValues(fieldId, fieldType, nextValue);
      await issueOperations.update(workspaceSlug, projectId, issueId, { extra_field_values: merged });
    },
    [buildMergedValues, issueOperations, workspaceSlug, projectId, issueId]
  );

  // fields === null: 尚未确定（embedded 未到，缓存未命中，请求在途）
  // fields.length === 0: 确定无字段
  // 两种情况都不渲染，不显示骨架，避免无字段类型先占位后消失
  if (!issue || fields === null || fields.length === 0) return null;

  const activeFields = fields.filter((f) => f.is_active !== false);
  if (activeFields.length === 0) return null;

  return (
    <PropertyGroupSection title="拓展">
      <div className={cn("space-y-2", disabled && "opacity-60")}>
        {activeFields.map((field) => {
          const currentValue = findValueForField(
            (issue.extra_field_values ?? []) as TIssueExtraFieldValue[],
            field.id
          );
          const isDeferred = field.field_type === "text" || field.field_type === "number";

          if (isDeferred) {
            return (
              <DeferredFieldRow
                key={field.id}
                field={field}
                committedValue={isValueEmpty(currentValue) ? "" : currentValue}
                onCommit={(next) => commit(field.id, field.field_type, next)}
                disabled={disabled}
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
