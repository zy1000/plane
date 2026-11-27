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
import { Avatar } from "@plane/ui";
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
import { issueTransitionDraft } from "@/hooks/store/use-issue-transition-draft";
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
import { useMember } from "@/hooks/store/use-member";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useIssueTypeLayout } from "@/hooks/store/use-issue-type-layout";
import { useUser } from "@/hooks/store/user";
import { IssueFieldLayout } from "../extra-fields/field-layout";
// services
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
// utils
import { cn, getFileURL, renderFormattedDate } from "@plane/utils";
import { issueTypeBaseName } from "@/utils/issue-type-layout";
import { formatNumberFieldValue, getNumberFieldConfig } from "@/utils/number-field";
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

/** dimmed：查看态未填的字段，标签再浅一档 */
const FieldLabel = ({ field, required, dimmed }: { field: TTypeExtraField; required: boolean; dimmed: boolean }) => {
  return (
    <div
      className={`flex min-w-0 items-center gap-1 text-12 ${dimmed ? "text-placeholder" : "text-tertiary"}`}
      title={field.description || field.name}
    >
      <span className="truncate">{field.name}</span>
      {required && <span className="text-danger-primary">*</span>}
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

const VALUE_TAG_CLASS = "inline-flex h-5 items-center rounded-sm px-2 text-12 font-medium";
const NEUTRAL_TAG_CLASS = `${VALUE_TAG_CLASS} bg-layer-1 text-secondary`;

/** 只读态：按字段类型显示值（选项成标签、人员带头像、长文本落在浅底块里），未填显示「—」，不渲染灰掉的输入框 */
const ReadOnlyFieldValue = observer(function ReadOnlyFieldValue({
  field,
  value,
}: {
  field: TTypeExtraField;
  value: unknown;
}) {
  const { getUserDetails } = useMember();
  const paragraph = isParagraphField(field);

  if (isValueEmpty(value)) {
    return paragraph ? (
      <div className="min-h-[38px] rounded-md border border-dashed border-subtle px-2.5 py-2 text-placeholder">—</div>
    ) : (
      <span className="text-placeholder">—</span>
    );
  }

  switch (field.field_type) {
    case "boolean": {
      const checked = value === true || value === "true" || value === 1;
      return (
        <span className={checked ? `${VALUE_TAG_CLASS} bg-success-subtle text-success-primary` : NEUTRAL_TAG_CLASS}>
          {checked ? "是" : "否"}
        </span>
      );
    }
    case "date":
      return (
        <span className="text-primary tabular-nums">{renderFormattedDate(value as string) ?? String(value)}</span>
      );
    case "select": {
      const options = getSelectOptions(field);
      return (
        <>
          {toIdList(value).map((key) => (
            <span key={key} className={NEUTRAL_TAG_CLASS}>
              {options.find((option) => option.key === key)?.label ?? key}
            </span>
          ))}
        </>
      );
    }
    case "user":
      return (
        <>
          {toIdList(value).map((id) => {
            const member = getUserDetails(id);
            const name = member?.display_name ?? id;
            return (
              <span key={id} className="mr-2 inline-flex min-w-0 items-center gap-1.5 text-primary">
                <Avatar size={20} name={name} src={getFileURL(member?.avatar_url ?? "")} showTooltip={false} />
                <span className="truncate">{name}</span>
              </span>
            );
          })}
        </>
      );
    case "number":
      return (
        <span className="text-primary tabular-nums">{formatNumberFieldValue(value, getNumberFieldConfig(field))}</span>
      );
    default:
      if (paragraph) {
        return (
          <div className="min-h-[38px] rounded-md bg-layer-1 px-2.5 py-2 leading-relaxed break-words whitespace-pre-wrap text-primary">
            {String(value)}
          </div>
        );
      }
      return <span className="break-all text-primary">{String(value)}</span>;
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
  const { issueTypes } = useProjectIssueTypes(workspaceSlug, projectId);
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
  const isEditing = !disabled;
  // 点流转按钮进来的编辑态：这次流转要求的字段也按必填处理（红星、保存前校验、分组「N 项必填待补充」）
  const transitionRequiredIds = new Set(
    isEditing ? (issueTransitionDraft.get(issueId)?.required_fields ?? []).map((item) => item.id) : []
  );
  const effective = evaluateFieldLinkage(
    transitionRequiredIds.size > 0
      ? fields.map((field) => (transitionRequiredIds.has(field.id) ? { ...field, is_required: true } : field))
      : fields,
    issue.extra_field_values ?? []
  );
  const typeName = issueTypeBaseName(issueTypes?.find((issueType) => issueType.id === issue.type_id)?.name);
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
        title={typeName ? `${typeName}字段` : "自定义字段"}
        ungroupedName={typeName ? `${typeName}信息` : undefined}
        renderField={(field, _placement, clearError) => {
          const value = findValueForField(effective.values, field.id);
          return (
            <div className="min-w-0 space-y-1">
              <FieldLabel
                field={field}
                required={isEditing && !!field.is_required}
                dimmed={!isEditing && isValueEmpty(value)}
              />
              {isEditing ? (
                <FieldControlCell
                  field={field}
                  projectId={projectId}
                  issueId={issueId}
                  value={value}
                  onCommit={(next) => {
                    clearError();
                    return commit(field.id, field.field_type, next);
                  }}
                />
              ) : (
                <div
                  className={cn(
                    "min-w-0 text-14",
                    !isParagraphField(field) && "flex min-h-[22px] flex-wrap items-center gap-1"
                  )}
                >
                  <ReadOnlyFieldValue field={field} value={value} />
                </div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
});
