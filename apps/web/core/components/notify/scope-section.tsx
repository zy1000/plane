/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useNotifyScope } from "@/hooks/use-notify-subscribers";
import type { TNotifyScope, TNotifyScopeChip, TNotifyScopeEntityType } from "@/types/notify";

type Props = {
  workspaceSlug: string;
  projectId: string;
  entityType: TNotifyScopeEntityType;
  entityId: string;
  /** sidebar：发布 / 迭代侧栏里带上边线的一段；card：风险、评审右栏里的一张白卡片 */
  variant?: "sidebar" | "card";
  /** 随对象上人员变化的值，变了就重新取名单 */
  revision?: string;
};

function Chips({ chips }: { chips: TNotifyScopeChip[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.role}
          className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2 text-13 whitespace-nowrap text-secondary"
        >
          {chip.label}
          <span className="font-medium text-primary">
            {chip.users.length === 1 ? chip.users[0].display_name : `${chip.users.length} 人`}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * 名单排成一行：「即时邮件 …　每日摘要 …」。给自带标签列的属性区用（评审详情）——
 * 取数、标题、没有名单时整行不出都由调用方管。
 */
export function NotifyScopeInline({ scope }: { scope: TNotifyScope }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {scope.instant.length > 0 && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-13 text-tertiary">即时邮件</span>
          <Chips chips={scope.instant} />
        </span>
      )}
      {scope.digest.length > 0 && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-13 text-tertiary">每日摘要</span>
          <Chips chips={scope.digest} />
        </span>
      )}
    </div>
  );
}

/**
 * 「通知对象」：这个对象的邮件即时发给哪些角色、进哪些角色的每日摘要。只读，
 * 规则由系统内置，名单随对象上的负责人、成员、订阅人变化。
 */
export function NotifyScopeSection(props: Props) {
  const { workspaceSlug, projectId, entityType, entityId, variant = "sidebar", revision } = props;
  const { scope } = useNotifyScope(workspaceSlug, projectId, entityType, entityId, revision);
  if (!scope || (scope.instant.length === 0 && scope.digest.length === 0)) return null;

  const body = (
    <div className="flex flex-col gap-3 rounded-lg bg-layer-1 px-3.5 py-3">
      {scope.instant.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-13 text-tertiary">即时邮件</span>
          <Chips chips={scope.instant} />
        </div>
      )}
      {scope.digest.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-13 text-tertiary">每日摘要</span>
          <Chips chips={scope.digest} />
        </div>
      )}
    </div>
  );

  if (variant === "card")
    return (
      <section className="flex flex-col rounded-xl border border-subtle bg-surface-1 px-3.5 pt-0.5 pb-3.5">
        <h5 className="flex h-9.5 items-center text-13 font-semibold text-secondary">通知对象</h5>
        {body}
      </section>
    );
  return (
    <div className="flex w-full flex-col gap-2 border-t border-subtle px-1.5 py-5">
      <span className="p-1.5 text-13 font-medium text-secondary">通知对象</span>
      <div className="px-1.5">{body}</div>
    </div>
  );
}
