/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { CalendarClock, Inbox } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

/** 个人主页工作项 / 缺陷列表的列：编号 | 标题 | 状态 | 优先级 | 截止日期 | 项目 | 负责人 | 操作。列头与行共用 */
export const PROFILE_ISSUE_GRID_CLASS =
  "grid min-w-[900px] grid-cols-[168px_minmax(200px,1fr)_112px_88px_136px_104px_64px_24px] items-center gap-x-3 px-5";

export const ProfileIssueListHeader = observer(function ProfileIssueListHeader() {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        PROFILE_ISSUE_GRID_CLASS,
        "sticky top-0 z-[3] h-10 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary"
      )}
    >
      <span>{t("profile.list_columns.id")}</span>
      <span>{t("common.title")}</span>
      <span>{t("common.state")}</span>
      <span>{t("common.priority")}</span>
      <span>{t("profile.list_columns.due_date")}</span>
      <span>{t("common.project")}</span>
      <span>{t("common.assignees")}</span>
      <span />
    </div>
  );
});

/** 选中一个没有数据的分组时，列表区的空状态 */
export function ProfileIssueGroupEmpty({
  groupId,
  groupName,
  entityLabel,
}: {
  groupId: string;
  groupName: string;
  entityLabel: string;
}) {
  const { t } = useTranslation();
  const Icon = groupId === "overdue" ? CalendarClock : Inbox;
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 py-24">
      <div className="grid size-14 place-items-center rounded-2xl bg-layer-1 text-placeholder">
        <Icon className="size-6" strokeWidth={1.6} />
      </div>
      <p className="text-14 font-medium text-secondary">
        {t("profile.user_relation_empty", { group: groupName, entity: entityLabel })}
      </p>
    </div>
  );
}
