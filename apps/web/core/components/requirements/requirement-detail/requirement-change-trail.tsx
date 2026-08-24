"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirementChangeSnapshot,
  TRequirementContentTrailEntry,
  TRequirementSchemaTrailEntry,
  TRequirementTrailEntry,
  TRequirementTypeSchema,
} from "@plane/types";
import {
  REQUIREMENT_BUILTIN_TITLE_COLUMN,
  resolveBuiltinLayout,
} from "@/components/requirements/requirement-builtin-layout";
import {
  HistoryEmpty,
  HistoryEntry,
  HistoryLine,
  HistoryPill,
  HistorySub,
  HistoryTimeline,
  type THistoryNode,
} from "./requirement-history-timeline";

/**
 * 列出前后快照里真正变了的字段名。
 *
 * 只报字段名不报值：轨迹是「什么时候谁动了哪几项」的索引，具体改成什么去变更单里看
 * 逐字段 diff —— 在这儿铺开新旧值会把一条轨迹撑成半屏。
 *
 * 版本历史也用它（比较相邻两版的快照），所以导出。
 */
export const diffSnapshotFieldNames = (
  before: TRequirementChangeSnapshot | null | undefined,
  after: TRequirementChangeSnapshot | null | undefined,
  requirementType: TRequirementTypeSchema | null,
  labelOf: (key: string) => string
) => {
  if (!before || !after) return [];

  const names: string[] = [];
  // 字段名列举顺序与类型布局一致（标题恒在最前）；只看内容列，status 不进 diff
  const contentColumns = [
    REQUIREMENT_BUILTIN_TITLE_COLUMN,
    ...resolveBuiltinLayout(requirementType?.builtin_fields).map((entry) => entry.column),
  ].filter((column) => column.isContent);
  for (const column of contentColumns) {
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

/** 审批状态决定节点形状：已通过实心、审批中空心、驳回/撤回红环 */
const NODE_BY_STATUS: Record<string, THistoryNode> = {
  approved: "approved",
  pending: "pending",
  rejected: "rejected",
  cancelled: "rejected",
};

const ContentEntry = ({
  entry,
  fields,
  isFirst,
  isLast,
  onFocusVersion,
}: {
  entry: TRequirementContentTrailEntry;
  fields: string[];
  isFirst: boolean;
  isLast: boolean;
  onFocusVersion?: (version: number) => void;
}) => {
  const { t } = useTranslation();
  const version = entry.version;

  return (
    <HistoryEntry
      node={NODE_BY_STATUS[entry.change_status] ?? "pending"}
      occurredAt={entry.occurred_at}
      isFirst={isFirst}
      isLast={isLast}
    >
      <HistoryLine actor={entry.actor_detail?.display_name ?? "—"}>
        {t(`requirement_detail.trail.action.${entry.change_type}`)}
        {fields.length > 0 && t("requirement_detail.trail.fields", { fields: fields.join("、") })}
      </HistoryLine>
      <HistorySub>
        {version !== null ? (
          // 已通过的改动落成了某一版 —— 点它直接跳到下面版本历史里的那个节点，
          // 省得用户自己在两个列表之间对号入座
          <HistoryPill
            tone="version"
            onClick={onFocusVersion ? () => onFocusVersion(version) : undefined}
            title={t("requirement_detail.trail.jump_to_version", { version })}
          >
            {t("requirement_detail.trail.version", { version })}
          </HistoryPill>
        ) : (
          <HistoryPill tone={entry.change_status === "pending" ? "pending" : "rejected"}>
            {t(`requirement_detail.trail.status.${entry.change_status}`)}
          </HistoryPill>
        )}
        <HistoryPill>{t("requirement_detail.trail.change_request", { sequence: entry.sequence_id })}</HistoryPill>
      </HistorySub>
    </HistoryEntry>
  );
};

/**
 * 字段结构变更。
 *
 * 这一条会在该需求类型下**每一条需求**的轨迹里一模一样地出现 —— 400 条需求就看 400 遍。
 * 所以两件事必须做到：文案点明它是类型级的，视觉上明显后退（齿轮节点、三级色、小一号），
 * 否则读起来像是有人改了这一行，一次类型重构会让每条需求的轨迹都变成「被重写过」。
 */
const SchemaEntry = ({
  entry,
  isFirst,
  isLast,
}: {
  entry: TRequirementSchemaTrailEntry;
  isFirst: boolean;
  isLast: boolean;
}) => {
  const { t } = useTranslation();
  const operations = entry.diff ?? [];
  const preview = operations.slice(0, 3);
  const overflow = operations.length - preview.length;

  return (
    <HistoryEntry node="schema" occurredAt={entry.occurred_at} isFirst={isFirst} isLast={isLast}>
      <HistoryLine actor={entry.actor_detail?.display_name ?? "—"} muted>
        {t("requirement_detail.trail.schema_changed", { name: entry.requirement_type_name })}
      </HistoryLine>
      <HistorySub>
        {preview.map((operation) => (
          <HistoryPill
            key={operation.field_id}
            tone={
              operation.change_type === "create" ? "added" : operation.change_type === "delete" ? "removed" : "neutral"
            }
          >
            {operation.change_type === "create" ? "+" : operation.change_type === "delete" ? "−" : "~"}
            {operation.name}
          </HistoryPill>
        ))}
        {overflow > 0 && <span>+{overflow}</span>}
        <span>{t("requirement_detail.trail.schema_scope")}</span>
      </HistorySub>
    </HistoryEntry>
  );
};

type TProps = {
  entries: TRequirementTrailEntry[];
  requirementType: TRequirementTypeSchema | null;
  /** 点轨迹里的版本徽章时，把下面的版本历史滚到那一版并展开 */
  onFocusVersion?: (version: number) => void;
};

/**
 * 变更轨迹。折叠交互与下方版本历史对齐：标题左侧 chevron，点一下收起/展开。
 * 默认展开 —— 轨迹数据随详情一起到齐，不像版本历史要等展开才去拉。
 */
export const RequirementChangeTrail = ({ entries, requirementType, onFocusVersion }: TProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        fields:
          entry.kind === "content" && entry.change_type === "update"
            ? diffSnapshotFieldNames(entry.before_snapshot, entry.proposed_snapshot, requirementType, t)
            : [],
      })),
    [entries, requirementType, t]
  );

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-1.5 text-12 font-medium text-primary"
      >
        {isOpen ? (
          <ChevronDown className="size-3 text-tertiary" />
        ) : (
          <ChevronRight className="size-3 text-tertiary" />
        )}
        {t("requirement_detail.change_trail")}
      </button>

      {isOpen &&
        (!entries.length ? (
          <HistoryEmpty
            title={t("requirement_detail.trail.empty")}
            description={t("requirement_detail.trail.empty_description")}
          />
        ) : (
          <HistoryTimeline>
            {rows.map(({ entry, fields }, index) => {
              const isFirst = index === 0;
              const isLast = index === rows.length - 1;
              return entry.kind === "content" ? (
                <ContentEntry
                  key={entry.id}
                  entry={entry}
                  fields={fields}
                  isFirst={isFirst}
                  isLast={isLast}
                  onFocusVersion={onFocusVersion}
                />
              ) : (
                <SchemaEntry key={entry.id} entry={entry} isFirst={isFirst} isLast={isLast} />
              );
            })}
          </HistoryTimeline>
        ))}
    </div>
  );
};
