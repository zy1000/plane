"use client";

import React from "react";
import { Clock3, MessageSquareIcon, UserRoundCheck } from "lucide-react";
import type { ReviewCaseListItem } from "@/services/qa/review.service";
import { QuickFilterDropdown, type QuickFilterItem } from "../quick-filter-dropdown";

export type ReviewCaseFilterKey =
  | "all"
  | "pending"
  | "pass"
  | "fail"
  | "re_review"
  | "mine_todo"
  | "mine_done"
  | "has_suggestion";

type FilterDefinition = Omit<QuickFilterItem, "count" | "key"> & {
  key: ReviewCaseFilterKey;
};

export type ReviewCaseFilterItem = Omit<QuickFilterItem, "key"> & {
  key: ReviewCaseFilterKey;
};

const FILTERS: FilterDefinition[] = [
  { key: "all", label: "全部" },
  { key: "mine_todo", label: "待我评审", Icon: Clock3 },
  { key: "mine_done", label: "我已评审", Icon: UserRoundCheck },
  { key: "pending", label: "待评审", dotColor: "#8c8c8c" },
  { key: "pass", label: "通过", dotColor: "#52c41a" },
  { key: "fail", label: "不通过", dotColor: "#f5222d" },
  { key: "re_review", label: "重新提审", dotColor: "#faad14" },
  { key: "has_suggestion", label: "有建议", Icon: MessageSquareIcon },
];

// 「待我评审 / 我已评审」由服务端按当前用户算好放在 item.mine 里,前端不再拿全量评审人 id 比对
const MATCHERS: Record<ReviewCaseFilterKey, (item: ReviewCaseListItem) => boolean> = {
  all: () => true,
  pending: (item) => {
    const result = String(item.result || "");
    return result === "未评审" || result === "评审中";
  },
  pass: (item) => String(item.result || "") === "通过",
  fail: (item) => String(item.result || "") === "不通过",
  re_review: (item) => String(item.result || "") === "重新提审",
  mine_todo: (item) => item.mine === "todo",
  mine_done: (item) => item.mine === "done",
  has_suggestion: (item) => Number(item.suggestion_count || 0) > 0,
};

export const useReviewCaseFilter = (cases: ReviewCaseListItem[]) => {
  const [activeKey, setActiveKey] = React.useState<ReviewCaseFilterKey>("all");

  const filters = React.useMemo<ReviewCaseFilterItem[]>(() => {
    // 列表可达几千条,八个筛选项只扫一遍,不要每项各扫一遍全量
    const counts = {} as Record<ReviewCaseFilterKey, number>;
    for (const filter of FILTERS) counts[filter.key] = 0;
    for (const item of cases) {
      for (const filter of FILTERS) {
        if (MATCHERS[filter.key](item)) counts[filter.key] += 1;
      }
    }
    return FILTERS.map((filter) => ({ ...filter, count: counts[filter.key] }));
  }, [cases]);

  const filteredCases = React.useMemo(() => {
    const matcher = MATCHERS[activeKey] ?? MATCHERS.all;
    return cases.filter((item) => matcher(item));
  }, [activeKey, cases]);

  return {
    activeKey,
    setActiveKey,
    filters,
    filteredCases,
    isFiltering: activeKey !== "all",
  };
};

type ReviewCaseFilterBarProps = {
  filters: ReviewCaseFilterItem[];
  activeKey: ReviewCaseFilterKey;
  onChange: (key: ReviewCaseFilterKey) => void;
};

export const ReviewCaseFilterBar: React.FC<ReviewCaseFilterBarProps> = ({ filters, activeKey, onChange }) => {
  return (
    <QuickFilterDropdown
      items={filters}
      activeKey={activeKey}
      onChange={(key) => onChange(key as ReviewCaseFilterKey)}
    />
  );
};
