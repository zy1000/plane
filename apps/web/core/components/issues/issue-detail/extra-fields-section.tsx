/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { evaluateFieldLinkage } from "@/utils/field-linkage";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
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
import { useIssueTypeLayout } from "@/hooks/store/use-issue-type-layout";
import { useUser } from "@/hooks/store/user";
import { IssueFieldLayout } from "../extra-fields/field-layout";
// services
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
// utils
import { cn, renderFormattedDate } from "@plane/utils";
import type { TIssueOperations } from "./root";

const isParagraphField = (field: TTypeExtraField) =>
  field.field_type === "text" && getTextMode(field.options) === "paragraph";

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
const ReadOnlyFieldValue = observer(function ReadOnlyFieldValue({
  field,
  value,
}: {
  field: TTypeExtraField;
  value: unknown;
}) {
  const { getUserDetails } = useMember();
  const text = (content: string) => <span className="font-medium break-all text-primary">{content}</span>;

  if (field.field_type === "boolean") return text(value === true || value === "true" || value === 1 ? "是" : "否");
  if (isValueEmpty(value)) return <span className="text-tertiary">未填写</span>;

  switch (field.field_type) {
    case "date":
      return (
        <span className="font-medium text-primary tabular-nums">
          {renderFormattedDate(value as string) ?? String(value)}
        </span>
      );
    case "select": {
      const options = getSelectOptions(field);
      return text(
        toIdList(value)
          .map((key) => options.find((option) => option.key === key)?.label ?? key)
          .join("、")
      );
    }
    case "user":
      return text(
        toIdList(value)
          .map((id) => getUserDetails(id)?.display_name ?? id)
          .join("、")
      );
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

/** Details and side peek use the same type-owned layout and preserve editor instances between pages. */
export const IssueExtraFieldsSection = observer(function IssueExtraFieldsSection(props: TIssueExtraFieldsSectionProps) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled, dimmed = disabled } = props;
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);
  const { data: user } = useUser();
  const { fields } = useIssueTypeExtraFields(
    workspaceSlug,
    projectId,
    issue?.type_id ?? null,
    issue?.type_extra_fields ?? null
  );
  const { layout } = useIssueTypeLayout(workspaceSlug, projectId, issue?.type_id);
  const commit = useCallback(
    async (fieldId: string, fieldType: TIssueExtraFieldType, nextValue: TIssueExtraFieldValue["value"]) => {
      const allowed = new Set((fields ?? []).map((field) => field.id));
      const current = (issue?.extra_field_values ?? []).filter((entry) => allowed.has(entry.extra_field_id));
      const merged = upsertValue(current, fieldId, fieldType, nextValue);
      await issueOperations.update(workspaceSlug, projectId, issueId, {
        extra_field_values: evaluateFieldLinkage(fields ?? [], merged).values,
      });
    },
    [fields, issue?.extra_field_values, issueOperations, workspaceSlug, projectId, issueId]
  );
  if (!issue || !fields?.length) return null;
  const effective = evaluateFieldLinkage(fields, issue.extra_field_values ?? []);
  const isEditing = !disabled;
  return (
    <div className={cn(dimmed && "opacity-60")}>
      <IssueFieldLayout
        key={issueId + ":" + issue.type_id}
        issueId={issueId}
        layout={layout}
        fields={effective.fields}
        values={effective.values}
        context={isEditing ? "edit" : "detail"}
        preferenceKey={[user?.id ?? "anonymous", workspaceSlug, issue.type_id].join(":")}
        renderField={(field, _placement, clearError) => (
          <div className="min-w-0 space-y-2">
            <FieldLabel field={field} required={isEditing && !!field.is_required} />
            {isEditing ? (
              <FieldControlCell
                field={field}
                projectId={projectId}
                issueId={issueId}
                value={findValueForField(effective.values, field.id)}
                onCommit={(value) => {
                  clearError();
                  return commit(field.id, field.field_type, value);
                }}
              />
            ) : (
              <div className="min-w-0 text-14">
                <ReadOnlyFieldValue field={field} value={findValueForField(effective.values, field.id)} />
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
});
