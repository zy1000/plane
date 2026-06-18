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

const normalizeIds = (ids?: string[]) => (Array.isArray(ids) ? ids.map((id) => String(id)) : []);

const createMatchers = (
  userId: string
): Record<ReviewCaseFilterKey, (item: ReviewCaseListItem) => boolean> => ({
  all: () => true,
  pending: (item) => {
    const result = String(item.result || "");
    return result === "未评审" || result === "评审中";
  },
  pass: (item) => String(item.result || "") === "通过",
  fail: (item) => String(item.result || "") === "不通过",
  re_review: (item) => String(item.result || "") === "重新提审",
  mine_todo: (item) => {
    if (!userId) return false;
    const unreviewedIds = normalizeIds(item.unreviewed_assignees);
    return unreviewedIds.includes(userId);
  },
  mine_done: (item) => {
    if (!userId) return false;
    const reviewerIds = normalizeIds(item.assignees);
    if (!reviewerIds.includes(userId)) return false;
    const unreviewedIds = normalizeIds(item.unreviewed_assignees);
    return !unreviewedIds.includes(userId);
  },
  has_suggestion: (item) => Number(item.suggestion_count || 0) > 0,
});

export const useReviewCaseFilter = (cases: ReviewCaseListItem[], currentUserId?: string | null) => {
  const [activeKey, setActiveKey] = React.useState<ReviewCaseFilterKey>("all");
  const userId = currentUserId ? String(currentUserId) : "";

  const matchers = React.useMemo(() => createMatchers(userId), [userId]);

  const filters = React.useMemo<ReviewCaseFilterItem[]>(() => {
    return FILTERS.map((filter) => ({
      ...filter,
      count: cases.reduce((count, item) => (matchers[filter.key](item) ? count + 1 : count), 0),
    }));
  }, [cases, matchers]);

  const filteredCases = React.useMemo(() => {
    const matcher = matchers[activeKey] ?? matchers.all;
    return cases.filter((item) => matcher(item));
  }, [activeKey, cases, matchers]);

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
