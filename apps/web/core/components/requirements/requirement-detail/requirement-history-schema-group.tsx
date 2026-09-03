"use client";

/**
 * 需求类型级的字段结构变更，折成一条。
 *
 * 这一类条目会在该类型下**每一条需求**的历史里一模一样地出现，一次类型重构连着改七八次，
 * 逐条铺开会把真正的内容改动淹掉。所以相邻的并成一组、默认收起、整组三级色，
 * 文案点明它是类型级且不经评审 —— 否则读起来像是有人改了这一行。
 *
 * 展开后按天合并成一句话：「8月28日 新增 A · 修改 B、C · 删除 D」，不再逐次列符号 chip。
 */
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { summarizeSchemaByDay, type THistorySchemaGroup, type TSchemaDaySummary } from "./requirement-history-model";
import { formatHistoryDate, HistoryEntry, HistoryHeader, HistoryNote, HistoryPill } from "./requirement-history-timeline";

const OPERATIONS: { key: keyof Pick<TSchemaDaySummary, "created" | "updated" | "deleted">; labelKey: string; className: string }[] = [
  { key: "created", labelKey: "requirement_detail.history.schema.op_create", className: "text-success-primary" },
  { key: "updated", labelKey: "requirement_detail.history.schema.op_update", className: "text-secondary" },
  { key: "deleted", labelKey: "requirement_detail.history.schema.op_delete", className: "text-danger-primary" },
];

export const RequirementHistorySchemaGroup = ({
  group,
  isFirst,
  isLast,
  forceExpanded = false,
}: {
  group: THistorySchemaGroup;
  isFirst: boolean;
  isLast: boolean;
  /** 「结构变更」过滤态下直接铺开，不再给折叠按钮 */
  forceExpanded?: boolean;
}) => {
  const { t, currentLocale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const isExpanded = forceExpanded || isOpen;
  const count = group.entries.length;
  const actorName = group.entries.find((entry) => entry.actor_detail)?.actor_detail?.display_name;
  const fromDate = formatHistoryDate(group.from, currentLocale);
  const toDate = formatHistoryDate(group.to, currentLocale);
  const range = fromDate === toDate ? toDate : `${fromDate} – ${toDate}`;
  const days = useMemo(() => summarizeSchemaByDay(group.entries), [group.entries]);

  return (
    <HistoryEntry node={{ kind: "schema" }} isFirst={isFirst} isLast={isLast}>
      <HistoryHeader>
        <span className="text-body-xs-regular text-tertiary">
          {count === 1
            ? t("requirement_detail.history.schema.single", { name: group.typeName })
            : t("requirement_detail.history.schema.group", { name: group.typeName, count })}
        </span>
        {actorName && <HistoryPill tone="ghost">{actorName}</HistoryPill>}
        <span className="ml-auto shrink-0 text-caption-md-regular text-placeholder tabular-nums">{range}</span>
      </HistoryHeader>
      <HistoryNote tone="muted" indent={false}>
        <span>{t("requirement_detail.history.schema.scope")}</span>
        {!forceExpanded && (
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="inline-flex items-center gap-0.5 text-tertiary transition-colors hover:text-secondary"
          >
            {t(isExpanded ? "requirement_detail.history.schema.collapse" : "requirement_detail.history.schema.expand")}
            {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        )}
      </HistoryNote>
      {isExpanded && (
        // 整个列表是一个 grid，日期列按最宽的一个对齐；每天一行、一句话
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-body-xs-regular leading-5">
          {days.map((day) => {
            const parts = OPERATIONS.filter((operation) => day[operation.key].length > 0);
            return (
              <Fragment key={day.day}>
                <dt className="text-placeholder tabular-nums">{formatHistoryDate(day.day, currentLocale)}</dt>
                <dd className="m-0 min-w-0 break-words text-tertiary">
                  {parts.map((operation, index) => (
                    <Fragment key={operation.key}>
                      {index > 0 && <span className="px-1.5 text-placeholder">·</span>}
                      <span className={cn("font-medium", operation.className)}>{t(operation.labelKey)}</span>{" "}
                      <span className="text-secondary">{day[operation.key].join("、")}</span>
                    </Fragment>
                  ))}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      )}
    </HistoryEntry>
  );
};
