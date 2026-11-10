/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  IWorkspaceMyAccess,
  TMyAccessGrant,
  TMyAccessPassthrough,
  TMyAccessSource,
  TMyAccessVisibleSourceType,
} from "@plane/types";

/** 直通身份的说法：来源 tooltip、项目权限摘要、身份条共用 */
export const PASSTHROUGH_LABELS: Record<TMyAccessPassthrough, string> = {
  workspace_owner: "工作区所有者",
  instance_admin: "实例管理员",
  project_lead: "项目负责人",
};

export const isPassthroughSource = (source: TMyAccessSource): source is TMyAccessSource & { type: TMyAccessPassthrough } =>
  source.type in PASSTHROUGH_LABELS;

/** 一条来源：「测试管理组」「测试管理组（经团队「硬件测试」）」「本项目绑定的模板「软件测试负责人」」「工作区所有者」 */
export const describeSource = (source: TMyAccessSource): string => {
  if (isPassthroughSource(source)) return PASSTHROUGH_LABELS[source.type];
  const name = source.role?.name ?? "—";
  if (source.type === "template") return `本项目绑定的标准权限组「${name}」`;
  if (source.type === "project_role") return `本项目的权限组「${name}」`;
  return source.team ? `${name}（经团队「${source.team.name}」）` : name;
};

/** 已授予 chip 的 tooltip：「来自 测试管理组、研发组」 */
export const describeSources = (sources: TMyAccessSource[]): string => {
  const parts = [...new Set(sources.map(describeSource))];
  return parts.length > 0 ? `来自 ${parts.join("、")}` : "已授予";
};

export type TGrantTag = "标准权限组" | "本项目" | null;

/** 选了项目后，只来自模板 / 本项目组（没有工作区组、没有直通）的 chip 加小标 */
export const getGrantTag = (sources: TMyAccessSource[]): TGrantTag => {
  if (sources.some((source) => source.type === "workspace_group" || isPassthroughSource(source))) return null;
  if (sources.some((source) => source.type === "template")) return "标准权限组";
  if (sources.some((source) => source.type === "project_role")) return "本项目";
  return null;
};

/** 这批 key 里出现过的直通身份（去重、按固定顺序） */
export const getPassthroughLabels = (grants: TMyAccessGrant[]): string[] => {
  const present = new Set(grants.flatMap((grant) => grant.sources.filter(isPassthroughSource).map((s) => s.type)));
  return (Object.keys(PASSTHROUGH_LABELS) as TMyAccessPassthrough[])
    .filter((type) => present.has(type))
    .map((type) => PASSTHROUGH_LABELS[type]);
};

/** 这批 key 里出现过的工作区权限组（去重，保持首次出现顺序） */
export const getWorkspaceGroupsInGrants = (grants: TMyAccessGrant[]): { id: string; name: string }[] => {
  const seen = new Map<string, { id: string; name: string }>();
  for (const grant of grants) {
    for (const source of grant.sources) {
      if (source.type === "workspace_group" && source.role && !seen.has(source.role.id)) seen.set(source.role.id, source.role);
    }
  }
  return [...seen.values()];
};

export const VISIBLE_SOURCE_LABELS: Record<TMyAccessVisibleSourceType, string> = {
  passthrough: "直通",
  member: "成员",
  lead: "负责人",
  data_scope: "数据权限",
  owner: "负责人",
  reviewer: "评审人",
  linked_project: "关联项目",
};

/** 项目 / 产品卡大数字后面的灰字顺序 */
export const PROJECT_SOURCE_ORDER: TMyAccessVisibleSourceType[] = ["data_scope", "member", "lead"];
export const PRODUCT_SOURCE_ORDER: TMyAccessVisibleSourceType[] = ["data_scope", "owner", "reviewer", "linked_project"];

/** 「数据权限 158 · 成员 3 · 负责人 2」；直通身份时只写「全部项目」 */
export const formatBySource = (
  bySource: Partial<Record<TMyAccessVisibleSourceType, number>>,
  order: TMyAccessVisibleSourceType[],
  allLabel: string
): string => {
  if ((bySource.passthrough ?? 0) > 0) return allLabel;
  return order
    .filter((type) => (bySource[type] ?? 0) > 0)
    .map((type) => `${VISIBLE_SOURCE_LABELS[type]} ${bySource[type]}`)
    .join(" · ");
};

/** 身份条「直通身份」：工作区所有者 / 实例管理员 / N 个项目的负责人 */
export const describePassthroughIdentity = (membership: IWorkspaceMyAccess["membership"]): string[] => {
  const parts: string[] = [];
  if (membership.is_workspace_owner) parts.push(PASSTHROUGH_LABELS.workspace_owner);
  if (membership.is_instance_admin) parts.push(PASSTHROUGH_LABELS.instance_admin);
  if (membership.led_project_count > 0) parts.push(`${membership.led_project_count} 个项目的负责人`);
  return parts;
};

/** 加入时间按 YYYY-MM-DD；拿不到写「—」 */
export const formatJoinedAt = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
