"use client";

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementPriority } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";

/**
 * 只读需求总览表（产品需求页「全部」、项目研发需求页「全部」、基线快照）共用的表头与格子内容。
 * 两页必须长得一样，格子的字号 / 颜色只在这里定，别在页面里另写一份。
 */

/** 表头列名：13px、tertiary */
export const RequirementListHeaderLabel = ({ label }: { label: string }) => (
  <span className="block min-w-0 truncate text-13 font-medium text-tertiary">{label}</span>
);

/** 编号按钮的文字样式 */
export const REQUIREMENT_LIST_DISPLAY_ID_CLASS =
  "min-w-0 flex-1 truncate text-left font-mono text-[12.5px] font-medium text-tertiary hover:text-accent-primary";

/** 优先级只给文字着色，不配图标；颜色走 priority token */
const PRIORITY_TEXT_CLASS: Record<TRequirementPriority, string> = {
  urgent: "text-priority-urgent",
  high: "text-priority-high",
  medium: "text-priority-medium",
  low: "text-priority-low",
  none: "text-placeholder",
};

export const RequirementListPriority = ({ priority }: { priority: TRequirementPriority | null | undefined }) => {
  const { t } = useTranslation();
  const key = priority ?? "none";
  return <span className={`text-13 ${PRIORITY_TEXT_CLASS[key] ?? "text-secondary"}`}>{t(key)}</span>;
};

export const RequirementListAssignee = observer(function RequirementListAssignee({
  memberId,
}: {
  memberId: string | null | undefined;
}) {
  const { getUserDetails } = useMember();
  if (!memberId) return <span className="text-placeholder">—</span>;
  const member = getUserDetails(memberId);
  const name = member?.display_name ?? memberId;
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <Avatar size={22} name={name} src={getFileURL(member?.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate text-13 text-secondary">{name}</span>
    </span>
  );
});

/** 模块：灰底小胶囊 */
export const RequirementListModule = ({ name }: { name: string | null | undefined }) =>
  name ? (
    <span
      className="inline-flex h-[22px] max-w-full items-center rounded bg-layer-1 px-[7px] text-12 text-secondary"
      title={name}
    >
      <span className="truncate">{name}</span>
    </span>
  ) : (
    <span className="text-placeholder">—</span>
  );
