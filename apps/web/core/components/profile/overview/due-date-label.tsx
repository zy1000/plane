/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { getDate, renderFormattedDate } from "@plane/utils";

/** 待办列表行尾的到期日：逾期 / 今天到期 / 未排期 三态着色，工作项与需求列表共用 */
export function DueDateLabel({ targetDate }: { targetDate: string | null }) {
  const { t } = useTranslation();
  const dueDate = getDate(targetDate);

  if (!dueDate) {
    return <span className="text-placeholder">{t("profile.stats.assigned_lists.unscheduled")}</span>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const formatted = renderFormattedDate(dueDay, "yyyy/MM/dd");

  if (dueDay.getTime() < today.getTime()) {
    return (
      <span className="font-medium text-danger-primary">
        {t("profile.stats.assigned_lists.overdue_prefix")} {formatted}
      </span>
    );
  }
  if (dueDay.getTime() === today.getTime()) {
    return <span className="font-medium text-warning-primary">{t("profile.stats.assigned_lists.due_today")}</span>;
  }
  return <span className="text-secondary">{formatted}</span>;
}
