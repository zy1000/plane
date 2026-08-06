"use client";

import { useMemo } from "react";
import { Settings2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirementChangeSnapshot,
  TRequirementContentTrailEntry,
  TRequirementSchemaTrailEntry,
  TRequirementTrailEntry,
  TRequirementTypeSchema,
} from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { REQUIREMENT_CONTENT_BUILTIN_COLUMNS } from "@/components/requirements/requirement-builtin-fields";

/**
 * 列出前后快照里真正变了的字段名。
 *
 * 只报字段名不报值：轨迹是「什么时候谁动了哪几项」的索引，具体改成什么去变更单里看
 * 逐字段 diff —— 在这儿铺开新旧值会把一条轨迹撑成半屏。
 */
const changedFieldNames = (
  entry: TRequirementContentTrailEntry,
  requirementType: TRequirementTypeSchema | null,
  labelOf: (key: string) => string
) => {
  const before = entry.before_snapshot;
  const after = entry.proposed_snapshot;
  if (!before || !after) return [];

  const names: string[] = [];
  for (const column of REQUIREMENT_CONTENT_BUILTIN_COLUMNS) {
    const key = column.key as keyof TRequirementChangeSnapshot;
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) names.push(labelOf(column.labelKey));
  }
  const fieldNames = new Map((requirementType?.fields ?? []).map((field) => [field.id, field.name]));
  const fieldIds = new Set([...Object.keys(before.data ?? {}), ...Object.keys(after.data ?? {})]);
  for (const fieldId of fieldIds) {
    if (JSON.stringify(before.data?.[fieldId] ?? null) !== JSON.stringify(after.data?.[fieldId] ?? null)) {
      names.push(fieldNames.get(fieldId) ?? fieldId);
    }
  }
  return names;
};

const ContentEntry = ({
  entry,
  fields,
}: {
  entry: TRequirementContentTrailEntry;
  fields: string[];
}) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 border-b border-subtle py-2 text-12 last:border-b-0">
      <span className="text-tertiary tabular-nums">
        {entry.version !== null
          ? t("requirement_detail.trail.version", { version: entry.version })
          : t(`requirement_detail.trail.status.${entry.change_status}`)}
      </span>
      <span className="min-w-0 text-secondary">
        <span className="text-primary">{entry.actor_detail?.display_name ?? "—"}</span>{" "}
        {t(`requirement_detail.trail.action.${entry.change_type}`)}
        {fields.length > 0 && (
          <span className="text-secondary">
            {t("requirement_detail.trail.fields", { fields: fields.join("、") })}
          </span>
        )}
        <span className="text-placeholder">
          {" · "}
          {t("requirement_detail.trail.change_request", { sequence: entry.sequence_id })}
          {" · "}
          {renderFormattedDate(entry.occurred_at)}
        </span>
      </span>
    </div>
  );
};

/**
 * 字段结构变更。
 *
 * 这一条会在该需求类型下**每一条需求**的轨迹里一模一样地出现 —— 400 条需求就看 400 遍。
 * 所以两件事必须做到：文案点明它是类型级的，视觉上明显后退（三级色、无强调、透明底），
 * 否则读起来像是有人改了这一行，一次类型重构会让每条需求的轨迹都变成「被重写过」。
 */
const SchemaEntry = ({ entry }: { entry: TRequirementSchemaTrailEntry }) => {
  const { t } = useTranslation();
  const operations = entry.diff ?? [];
  const preview = operations.slice(0, 3);
  const overflow = operations.length - preview.length;

  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 border-b border-subtle py-2 text-12 last:border-b-0">
      <span className="flex items-center gap-1 text-tertiary">
        <Settings2 className="size-3" />
        {t("requirement_detail.trail.schema")}
      </span>
      <span className="min-w-0 text-tertiary">
        <span className="text-secondary">{entry.actor_detail?.display_name ?? "—"}</span>{" "}
        {t("requirement_detail.trail.schema_changed", { name: entry.requirement_type_name })}
        <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
          {preview.map((operation) => (
            <span
              key={operation.field_id}
              className={cn(
                "inline-flex h-4 items-center rounded bg-layer-2 px-1 text-10",
                operation.change_type === "create" && "text-success-primary",
                operation.change_type === "delete" && "text-danger-primary"
              )}
            >
              {operation.change_type === "create" ? "+" : operation.change_type === "delete" ? "−" : "~"}
              {operation.name}
            </span>
          ))}
          {overflow > 0 && <span className="text-10 text-placeholder">+{overflow}</span>}
        </span>
        <span className="text-placeholder">
          {" · "}
          {t("requirement_detail.trail.schema_scope")}
          {" · "}
          {renderFormattedDate(entry.occurred_at)}
        </span>
      </span>
    </div>
  );
};

type TProps = {
  entries: TRequirementTrailEntry[];
  requirementType: TRequirementTypeSchema | null;
};

export const RequirementChangeTrail = ({ entries, requirementType }: TProps) => {
  const { t } = useTranslation();

  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        fields:
          entry.kind === "content" && entry.change_type === "update"
            ? changedFieldNames(entry, requirementType, t)
            : [],
      })),
    [entries, requirementType, t]
  );

  if (!entries.length) {
    return <p className="text-12 text-placeholder">{t("requirement_detail.trail.empty")}</p>;
  }

  return (
    <div className="flex flex-col">
      {rows.map(({ entry, fields }) =>
        entry.kind === "content" ? (
          <ContentEntry key={entry.id} entry={entry} fields={fields} />
        ) : (
          <SchemaEntry key={entry.id} entry={entry} />
        )
      )}
    </div>
  );
};
