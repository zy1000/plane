/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TProjectVisibleMembers, TProjectVisiblePerson, TProjectVisibleSource } from "@plane/types";

/** 授权来源：名单上方「授权来源」标签的一项（点了只看这个来源的人） */
export type TVisibleChannelKind = "member" | "lead" | "passthrough" | "data";

export type TVisibleChannel = {
  key: string;
  kind: TVisibleChannelKind;
  label: string;
  /** 悬停说明：适用范围、在哪里维护 */
  hint?: string;
  /** 数据权限组 id */
  roleId?: string;
};

/** 数据权限组的适用范围（按白名单模式） */
const DATA_SCOPE_LABEL = { all: "全部项目", selected: "指定项目（含本项目）", filter: "按条件匹配（含本项目）" } as const;

const isPassthroughSource = (source: TProjectVisibleSource) =>
  source.type === "owner" || source.type === "instance_admin";

/** 某人是否属于某个来源 */
export const personInChannel = (person: TProjectVisiblePerson, channel: TVisibleChannel) =>
  person.sources.some((source) => {
    if (channel.kind === "data") return source.type === "data" && source.role_id === channel.roleId;
    if (channel.kind === "passthrough") return isPassthroughSource(source);
    return source.type === channel.kind;
  });

/** 来源顺序：项目成员 → 项目负责人 → 系统管理员 → 各数据权限（人数由调用方按当前范围算） */
export const buildChannels = (data: TProjectVisibleMembers): TVisibleChannel[] => [
  { key: "member", kind: "member", label: "项目成员" },
  { key: "lead", kind: "lead", label: "项目负责人" },
  {
    key: "passthrough",
    kind: "passthrough",
    label: "系统管理员",
    hint: "工作区所有者、实例管理员 · 可访问全部项目",
  },
  ...data.data_groups.map((group) => ({
    key: `data:${group.id}`,
    kind: "data" as const,
    label: group.name,
    hint: `适用范围：${DATA_SCOPE_LABEL[group.mode]} · 由工作区「权限」统一维护`,
    roleId: group.id,
  })),
];

/** 人员表「授权来源」列的一个标签 */
export type TSourceChip = { key: string; label: string; prefix?: string; tone: "member" | "lead" | "owner" | "data"; title?: string };

export const sourceChips = (person: TProjectVisiblePerson): TSourceChip[] =>
  person.sources.map((source) => {
    switch (source.type) {
      case "member":
        return { key: "member", label: "项目成员", tone: "member" };
      case "lead":
        return { key: "lead", label: "项目负责人", tone: "lead" };
      case "owner":
        return { key: "owner", label: "工作区所有者", tone: "owner" };
      case "instance_admin":
        return { key: "instance_admin", label: "实例管理员", tone: "owner" };
      default:
        return {
          key: `data:${source.role_id}`,
          prefix: "数据权限组",
          label: source.role_name,
          tone: "data",
          title: source.team ? `通过团队「${source.team}」分配` : undefined,
        };
    }
  });

/** 「项目权限」列：主文字（全部 / N 项 / —）+ 灰字说明（系统身份，或权限组名） */
export const permissionSummary = (person: TProjectVisiblePerson, total: number) => {
  if (person.passthrough) {
    const has = (type: TProjectVisibleSource["type"]) => person.sources.some((source) => source.type === type);
    const reason = has("lead") ? "项目负责人" : has("owner") ? "工作区所有者" : has("instance_admin") ? "实例管理员" : "项目创建人";
    return { text: "全部", note: reason, isEmpty: false };
  }
  if (person.permission_count <= 0) return { text: "—", note: "", isEmpty: true };
  return {
    text: person.permission_count >= total ? "全部" : `${person.permission_count} 项`,
    note: person.permission_groups.map((group) => group.name).join("、"),
    isEmpty: false,
  };
};

/** 具有操作权限（含系统身份直接放行）的人 */
export const hasProjectPermission = (person: TProjectVisiblePerson) => person.passthrough || person.permission_count > 0;

/** 部门路径「研发中心 / 软件部」只显示最后一级 */
export const shortDepartment = (department: string | null | undefined) =>
  department ? (department.split("/").pop() ?? department).trim() : "";
