/**
 * 历史区的统一条目模型：变更轨迹 + 版本链 → 一条时间线。
 *
 * 版本只在变更单通过时写入，与轨迹里「已通过」的条目一一对应，两个列表讲的是同一件事。
 * 这里把它们并成一种条目：通过的改动自带 version，就是版本节点；没通过的只是圆点。
 * 需求类型级的字段结构修订（每条需求都会看到同样的几条）按相邻合并成一组，不再逐条刷屏。
 *
 * 纯函数，不碰 React。
 */
import type {
  IUserLite,
  TRequirementApprovalType,
  TRequirementChangeApproval,
  TRequirementChangeSnapshot,
  TRequirementChangeStatus,
  TRequirementChangeType,
  TRequirementDiffItem,
  TRequirementField,
  TRequirementSchemaTrailEntry,
  TRequirementTrailEntry,
  TRequirementTypeSchema,
  TRequirementVersion,
} from "@plane/types";

export type THistoryFilter = "all" | "versions" | "schema";

export type THistoryApproval = {
  /** 轨迹来源才知道规则；版本兜底行为 null */
  type: TRequirementApprovalType | null;
  requiredCount: number | null;
  approvals: TRequirementChangeApproval[];
  /** 版本兜底行只有审批人 id，组件里再换名 */
  approvedByIds: string[];
  completedAt: string | null;
};

export type THistoryChangeItem = {
  kind: "change";
  id: string;
  occurredAt: string;
  /** version：只在版本链里、轨迹分页没带回来的旧版本兜底 */
  source: "trail" | "version";
  actor: IUserLite | null;
  changeType: TRequirementChangeType;
  status: TRequirementChangeStatus;
  sequenceId: number | null;
  reason: string;
  /** 轨迹自带的版本号，不等版本链加载；有它就画版本方块 */
  versionNumber: number | null;
  isCurrent: boolean;
  /** 版本链加载完才有；动作行（查看这一版 / 对比 / 回滚）靠它 */
  version: TRequirementVersion | null;
  previousVersion: TRequirementVersion | null;
  before: TRequirementChangeSnapshot | null;
  after: TRequirementChangeSnapshot | null;
  /** 算 diff 用的字段树：优先那一版当时的，其次今天的类型 */
  fields: TRequirementField[];
  approval: THistoryApproval;
  /** 「完整对比」直接喂 ChangeRequestRequirementDiff */
  diffItem: TRequirementDiffItem;
};

export type THistorySchemaGroup = {
  kind: "schema";
  id: string;
  occurredAt: string;
  typeId: string;
  typeName: string;
  /** 新在前 */
  entries: TRequirementSchemaTrailEntry[];
  from: string;
  to: string;
};

export type THistoryItem = THistoryChangeItem | THistorySchemaGroup;

export type THistoryCounts = {
  versions: number;
  /** 内容改动条数（含未通过的） */
  changes: number;
  /** 结构变更按次数，不按组数 */
  schema: number;
  /** 没成为版本的改动 */
  nonVersionChanges: number;
};

/** 新版在前。后端顺序不保证，而「相邻两版求差异」依赖这个次序 */
export const sortVersionsDesc = (versions: TRequirementVersion[]) =>
  [...versions].sort((a, b) => b.version - a.version);

/** 把两版快照拼成变更项的形状，喂给评审页现成的竖排两栏 diff */
export const buildVersionDiffItem = (
  before: TRequirementVersion | null,
  after: TRequirementVersion,
  requirementTypeName: string
): TRequirementDiffItem => {
  const isDelete = after.change_type === "delete";
  return {
    id: `${before?.id ?? "none"}-${after.id}`,
    change_type: isDelete ? "delete" : before ? "update" : "create",
    target_id: after.target_id,
    requirement_type_id: after.requirement_type_id,
    requirement_type_name: requirementTypeName,
    title: after.snapshot.title,
    display_id: after.display_id ?? null,
    before_snapshot: isDelete ? after.snapshot : (before?.snapshot ?? null),
    proposed_snapshot: isDelete ? null : after.snapshot,
    base_version: before?.version ?? null,
    proposed_sort_order: after.snapshot.sort_order ?? null,
  };
};

const previousVersionOf = (sorted: TRequirementVersion[], versionNumber: number | null) => {
  if (versionNumber === null) return null;
  // sorted 是降序，第一个小于它的就是上一版
  return sorted.find((version) => version.version < versionNumber) ?? null;
};

/**
 * 相邻（中间没有内容改动）且同类型的结构修订并成一组。
 * 一次类型重构往往连着改七八次，逐条铺开会把真正的内容改动淹掉。
 */
const groupSchemaEntries = (raw: (THistoryChangeItem | TRequirementSchemaTrailEntry)[]): THistoryItem[] => {
  const items: THistoryItem[] = [];
  for (const entry of raw) {
    if (entry.kind === "change") {
      items.push(entry);
      continue;
    }
    const schema = entry;
    const last = items[items.length - 1];
    if (last && last.kind === "schema" && last.typeId === schema.requirement_type_id) {
      last.entries.push(schema);
      last.from = schema.created_at;
      continue;
    }
    items.push({
      kind: "schema",
      id: schema.id,
      occurredAt: schema.occurred_at,
      typeId: schema.requirement_type_id,
      typeName: schema.requirement_type_name,
      entries: [schema],
      from: schema.created_at,
      to: schema.created_at,
    });
  }
  return items;
};

export const buildHistoryItems = ({
  trail,
  versions,
  requirementType,
  approvedVersion,
}: {
  trail: TRequirementTrailEntry[];
  versions: TRequirementVersion[];
  requirementType: TRequirementTypeSchema | null;
  approvedVersion: number | null;
}): THistoryItem[] => {
  const sorted = sortVersionsDesc(versions);
  const byNumber = new Map(sorted.map((version) => [version.version, version]));
  const referenced = new Set<number>();
  const raw: (THistoryChangeItem | TRequirementSchemaTrailEntry)[] = [];

  for (const entry of trail) {
    if (entry.kind === "schema") {
      raw.push(entry);
      continue;
    }
    const version = entry.version !== null ? (byNumber.get(entry.version) ?? null) : null;
    if (entry.version !== null) referenced.add(entry.version);
    raw.push({
      kind: "change",
      id: entry.id,
      occurredAt: entry.occurred_at,
      source: "trail",
      actor: entry.actor_detail,
      changeType: entry.change_type,
      status: entry.change_status,
      sequenceId: entry.sequence_id,
      reason: entry.reason ?? "",
      versionNumber: entry.version,
      isCurrent: entry.version !== null && entry.version === approvedVersion,
      version,
      previousVersion: previousVersionOf(sorted, entry.version),
      before: entry.before_snapshot,
      after: entry.proposed_snapshot,
      fields: version?.fields_snapshot ?? requirementType?.fields ?? [],
      approval: {
        type: entry.approval_type ?? null,
        requiredCount: entry.required_count ?? null,
        approvals: entry.approvals ?? [],
        approvedByIds: [],
        completedAt: entry.completed_at ?? null,
      },
      diffItem: entry,
    });
  }

  // 轨迹只取前 50 条；更老的版本轨迹里没有，但版本链里有 —— 按版本号做差集补上
  for (const version of sorted) {
    if (referenced.has(version.version)) continue;
    const previous = previousVersionOf(sorted, version.version);
    const isDelete = version.change_type === "delete";
    raw.push({
      kind: "change",
      id: version.id,
      occurredAt: version.created_at,
      source: "version",
      actor: version.created_by_detail,
      changeType: version.change_type,
      status: "approved",
      sequenceId: version.change_request_sequence_id,
      reason: version.change_request_reason ?? "",
      versionNumber: version.version,
      isCurrent: version.version === approvedVersion,
      version,
      previousVersion: previous,
      before: isDelete ? version.snapshot : (previous?.snapshot ?? null),
      after: isDelete ? null : version.snapshot,
      fields: version.fields_snapshot ?? [],
      approval: {
        type: null,
        requiredCount: null,
        approvals: [],
        approvedByIds: version.approved_by ?? [],
        completedAt: version.created_at,
      },
      diffItem: buildVersionDiffItem(previous, version, requirementType?.name ?? ""),
    });
  }

  const occurredAtOf = (entry: THistoryChangeItem | TRequirementSchemaTrailEntry) =>
    "occurredAt" in entry ? entry.occurredAt : entry.occurred_at;
  raw.sort((a, b) => {
    const timeA = occurredAtOf(a);
    const timeB = occurredAtOf(b);
    if (timeA !== timeB) return timeA < timeB ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  return groupSchemaEntries(raw);
};

export type TSchemaDaySummary = {
  /** 当天第一条修订的时间戳，给日期列用 */
  day: string;
  /** 当天修订了几次 */
  count: number;
  created: string[];
  updated: string[];
  deleted: string[];
};

const dayKeyOf = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/**
 * 一组结构修订按天合并成「新增 / 修改 / 删除 了哪些字段」。
 *
 * 一次类型编辑会话往往连着保存七八次，逐次列「~字段3 ~字段2」读不出意思；
 * 按天回放、每个字段只留最终态（删除 > 新增 > 修改），当天先建后删的字段不出现。
 */
export const summarizeSchemaByDay = (entries: TRequirementSchemaTrailEntry[]): TSchemaDaySummary[] => {
  type TFieldState = { name: string; state: "create" | "update" | "delete"; createdToday: boolean };
  const buckets = new Map<string, { day: string; count: number; fields: Map<string, TFieldState> }>();
  // entries 新在前；按时间正序回放才能得到最终态
  for (const entry of [...entries].reverse()) {
    const key = dayKeyOf(entry.created_at);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { day: entry.created_at, count: 0, fields: new Map() };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    for (const operation of entry.diff ?? []) {
      const current = bucket.fields.get(operation.field_id);
      if (operation.change_type === "create") {
        bucket.fields.set(operation.field_id, { name: operation.name, state: "create", createdToday: true });
      } else if (operation.change_type === "delete") {
        if (current?.createdToday) bucket.fields.delete(operation.field_id);
        else bucket.fields.set(operation.field_id, { name: operation.name, state: "delete", createdToday: false });
      } else if (!current) {
        bucket.fields.set(operation.field_id, { name: operation.name, state: "update", createdToday: false });
      } else {
        // 已经是新增 / 删除的字段再被修改，状态不变，只跟着最新的名字
        current.name = operation.name;
      }
    }
  }
  const namesOf = (fields: Map<string, TFieldState>, state: TFieldState["state"]) =>
    [...fields.values()].filter((field) => field.state === state).map((field) => field.name);
  return [...buckets.values()].reverse().map((bucket) => ({
    day: bucket.day,
    count: bucket.count,
    created: namesOf(bucket.fields, "create"),
    updated: namesOf(bucket.fields, "update"),
    deleted: namesOf(bucket.fields, "delete"),
  }));
};

export const countHistory = (items: THistoryItem[]): THistoryCounts => {
  const counts: THistoryCounts = { versions: 0, changes: 0, schema: 0, nonVersionChanges: 0 };
  for (const item of items) {
    if (item.kind === "schema") {
      counts.schema += item.entries.length;
      continue;
    }
    counts.changes += 1;
    if (item.versionNumber !== null) counts.versions += 1;
    else counts.nonVersionChanges += 1;
  }
  return counts;
};

export const applyHistoryFilter = (items: THistoryItem[], filter: THistoryFilter): THistoryItem[] => {
  if (filter === "versions") return items.filter((item) => item.kind === "change" && item.versionNumber !== null);
  if (filter === "schema") return items.filter((item) => item.kind === "schema");
  return items;
};
