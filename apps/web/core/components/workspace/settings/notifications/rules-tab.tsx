/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TNotifyRule, TNotifyRuleMode, TNotifyRulesResponse } from "@/types/notify";
import { NotifyRuleEditModal } from "./rule-edit-modal";

type Props = {
  data: TNotifyRulesResponse | undefined;
  onSave: (rule: TNotifyRule, roles: Record<string, TNotifyRuleMode>) => Promise<void>;
};

const GRID = "grid grid-cols-[128px_minmax(0,1.1fr)_minmax(0,1.25fr)_104px_52px] items-center gap-x-4 px-5";
const GRID_WITH_OBJECT =
  "grid grid-cols-[88px_112px_minmax(0,1fr)_minmax(0,1.15fr)_104px_52px] items-center gap-x-4 px-5";

function ParamCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-subtle px-4 py-3.5">
      <div className="text-13 whitespace-nowrap text-tertiary">{label}</div>
      <div className="text-16 leading-snug font-semibold whitespace-nowrap text-primary tabular-nums">{value}</div>
    </div>
  );
}

/** 一格里的收件角色：没有人用「—」 */
function RoleChips({ rule, mode }: { rule: TNotifyRule; mode: "instant" | "digest" }) {
  const roles = rule.roles.filter((item) => item.mode === mode);
  if (roles.length === 0) return <span className="text-tertiary">—</span>;
  return (
    <span className="flex flex-wrap gap-1.5 py-2.5">
      {roles.map((item) => (
        <span
          key={item.role}
          className={cn(
            "inline-flex h-[26px] items-center rounded-md px-2 text-13 whitespace-nowrap",
            mode === "instant" ? "bg-accent-subtle text-accent-primary" : "bg-layer-1 text-secondary"
          )}
        >
          {item.label}
        </span>
      ))}
    </span>
  );
}

/**
 * 工作区设置 › 通知 › 通知规则：按业务分组列出每个事件发给哪些角色、即时还是进每日摘要。
 * 规则有系统默认值，这里改过的只对本工作区生效；参数（合并间隔等）只读。
 */
export function NotifyRulesTab({ data, onSave }: Props) {
  const [group, setGroup] = useState<string | null>(null);
  const [editing, setEditing] = useState<TNotifyRule | null>(null);

  if (!data)
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="72px" />
        <Loader.Item height="34px" width="60%" />
        <Loader.Item height="320px" />
      </Loader>
    );

  const activeGroup = group ?? data.groups[0]?.key ?? "";
  const groupLabel = (key: string) => data.groups.find((item) => item.key === key)?.label ?? "";
  const rules = data.rules.filter((rule) => rule.group === activeGroup);
  const hasObject = rules.some((rule) => rule.object);
  const grid = hasObject ? GRID_WITH_OBJECT : GRID;
  const modifiedCount = rules.filter((rule) => rule.modified).length;
  const ruleTitle = (rule: TNotifyRule) =>
    [groupLabel(rule.group), rule.object, rule.label].filter(Boolean).join(" · ");

  const handleSubmit = async (rule: TNotifyRule, roles: Record<string, TNotifyRuleMode>) => {
    await onSave(rule, roles);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "通知规则已保存" });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ParamCard label="即时邮件合并间隔" value={`${data.params.merge_minutes} 分钟`} />
        <ParamCard label="每人每日即时邮件上限" value={`${data.params.daily_instant_cap} 封`} />
        <ParamCard label="每日摘要发送时间" value={data.params.digest_schedule} />
        <ParamCard label="待办提醒" value={`第 ${data.params.remind_on_days.join("、")} 天`} />
      </div>

      <div className="flex flex-wrap gap-2">
        {data.groups.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={activeGroup === item.key}
            className={cn(
              "inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3.5 text-14 whitespace-nowrap",
              activeGroup === item.key
                ? "border-accent-subtle bg-accent-subtle font-medium text-accent-primary"
                : "border-subtle text-secondary hover:bg-layer-1-hover"
            )}
            onClick={() => setGroup(item.key)}
          >
            {item.label}
            <span className="text-12 tabular-nums">{item.count}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[900px]">
          <div className={cn(grid, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            {hasObject && <span>对象</span>}
            <span>事件</span>
            <span>即时邮件</span>
            <span>每日摘要</span>
            <span className="text-right">日均即时邮件</span>
            <span className="text-right">操作</span>
          </div>
          {rules.map((rule) => (
            <div key={rule.event} className={cn(grid, "min-h-[58px] border-b border-subtle text-14 last:border-b-0")}>
              {hasObject && <span className="text-secondary">{rule.object}</span>}
              <span className="font-medium text-primary">
                {rule.label}
                {rule.modified && (
                  <span className="ml-2 inline-flex h-5 items-center rounded-md bg-warning-subtle px-1.5 align-middle text-12 font-medium text-warning-primary">
                    已修改
                  </span>
                )}
              </span>
              <RoleChips rule={rule} mode="instant" />
              <RoleChips rule={rule} mode="digest" />
              <span className={cn("text-right tabular-nums", rule.daily_instant > 0 ? "text-primary" : "text-tertiary")}>
                {rule.daily_instant > 0 ? `${rule.daily_instant} 封` : "—"}
              </span>
              <span className="text-right">
                <button type="button" className="text-14 text-accent-primary hover:underline" onClick={() => setEditing(rule)}>
                  编辑
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="px-1 text-13 text-tertiary">
        共 {rules.length} 条{modifiedCount > 0 ? `，${modifiedCount} 条已修改` : ""}
        <span className="ml-4">日均即时邮件按近 30 天数据估算</span>
      </p>

      <NotifyRuleEditModal
        rule={editing}
        title={editing ? ruleTitle(editing) : ""}
        onClose={() => setEditing(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
