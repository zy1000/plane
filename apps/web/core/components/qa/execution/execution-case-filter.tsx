"use client";

import React from "react";
import { Clock3, UserRoundCheck } from "lucide-react";
import { QuickFilterDropdown, type QuickFilterItem } from "../quick-filter-dropdown";

const RESULT_SORT_ORDER = ["未执行", "成功", "失败", "阻塞", "无效"];

const COLOR_NAME_TO_HEX: Record<string, string> = {
  green: "#52c41a",
  red: "#f5222d",
  gold: "#faad14",
  gray: "#8c8c8c",
  blue: "#1677ff",
};

type ExecutionCaseFilterTarget = {
  result: string;
  assignee?: string | number | null;
};

const orderStatuses = (statuses: string[]): string[] => {
  const uniq = Array.from(
    new Set(
      statuses
        .map((status) => String(status || "").trim())
        .filter((status) => Boolean(status))
    )
  );
  const preferred = RESULT_SORT_ORDER.filter((status) => uniq.includes(status));
  const rest = uniq.filter((status) => !RESULT_SORT_ORDER.includes(status));
  return [...preferred, ...rest];
};

const toDotColor = (colorName?: string) => {
  const key = String(colorName || "").toLowerCase();
  return COLOR_NAME_TO_HEX[key] || "#8c8c8c";
};

const isPendingExecution = (result: string) => String(result || "") === "未执行";
const normalizeUserId = (id?: string | number | null) => (id === null || id === undefined ? "" : String(id));

export const useExecutionCaseFilter = <T extends ExecutionCaseFilterTarget>(
  cases: T[],
  planCaseResult?: Record<string, string>,
  currentUserId?: string | number | null
) => {
  const [activeKey, setActiveKey] = React.useState<string>("all");
  const userId = normalizeUserId(currentUserId);

  const statuses = React.useMemo(() => orderStatuses(Object.keys(planCaseResult ?? {})), [planCaseResult]);

  const items = React.useMemo<QuickFilterItem[]>(() => {
    const mineTodoCount = cases.reduce((count, item) => {
      const isMine = userId && normalizeUserId(item.assignee) === userId;
      if (!isMine) return count;
      return isPendingExecution(String(item.result || "")) ? count + 1 : count;
    }, 0);
    const mineDoneCount = cases.reduce((count, item) => {
      const isMine = userId && normalizeUserId(item.assignee) === userId;
      if (!isMine) return count;
      return isPendingExecution(String(item.result || "")) ? count : count + 1;
    }, 0);

    return [
      { key: "all", label: "全部", count: cases.length },
      { key: "mine_todo", label: "待我执行", Icon: Clock3, count: mineTodoCount },
      { key: "mine_done", label: "我已执行", Icon: UserRoundCheck, count: mineDoneCount },
      ...statuses.map((status) => ({
        key: status,
        label: status,
        dotColor: toDotColor(planCaseResult?.[status]),
        count: cases.reduce((count, item) => (String(item.result || "") === status ? count + 1 : count), 0),
      })),
    ];
  }, [cases, statuses, planCaseResult, userId]);

  React.useEffect(() => {
    if (activeKey === "all") return;
    if (!items.some((item) => item.key === activeKey)) {
      setActiveKey("all");
    }
  }, [activeKey, items]);

  const filteredCases = React.useMemo(() => {
    if (activeKey === "all") return cases;
    if (activeKey === "mine_todo") {
      if (!userId) return [];
      return cases.filter((item) => {
        const isMine = normalizeUserId(item.assignee) === userId;
        return isMine && isPendingExecution(String(item.result || ""));
      });
    }
    if (activeKey === "mine_done") {
      if (!userId) return [];
      return cases.filter((item) => {
        const isMine = normalizeUserId(item.assignee) === userId;
        return isMine && !isPendingExecution(String(item.result || ""));
      });
    }
    return cases.filter((item) => String(item.result || "") === activeKey);
  }, [activeKey, cases, userId]);

  return {
    activeKey,
    setActiveKey,
    items,
    filteredCases,
    isFiltering: activeKey !== "all",
  };
};

type ExecutionCaseFilterBarProps = {
  items: QuickFilterItem[];
  activeKey: string;
  onChange: (key: string) => void;
};

export const ExecutionCaseFilterBar: React.FC<ExecutionCaseFilterBarProps> = ({ items, activeKey, onChange }) => {
  return <QuickFilterDropdown items={items} activeKey={activeKey} onChange={onChange} />;
};
