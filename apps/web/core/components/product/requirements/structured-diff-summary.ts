const SCOPE_META: { key: string; label: string }[] = [
  { key: "schema", label: "字段" },
  { key: "root_row", label: "主记录" },
  { key: "child_row", label: "子记录" },
];

const CHANGE_META: { key: string; label: string }[] = [
  { key: "added", label: "新增" },
  { key: "modified", label: "修改" },
  { key: "moved", label: "移动" },
  { key: "removed", label: "删除" },
];

export type TStructuredDiffSummaryGroup = {
  scope: string;
  scopeLabel: string;
  /** 该范围下按变更类型汇总的可读文本，如「新增 2 · 修改 1」 */
  detail: string;
  total: number;
};

export type TStructuredDiffSummary = {
  total: number;
  groups: TStructuredDiffSummaryGroup[];
};

/**
 * 把后端 `structured_diff_summary`（键形如 `${scope}_${changeType}`）汇总成
 * 按范围分组、给人阅读的摘要，供评审面板展示「共 N 处变更 · 字段 新增 2…」。
 */
export function summarizeStructuredDiff(summary: Record<string, number> | undefined | null): TStructuredDiffSummary {
  const counts = summary ?? {};
  let total = 0;
  const groups: TStructuredDiffSummaryGroup[] = [];

  for (const scope of SCOPE_META) {
    const parts: string[] = [];
    let scopeTotal = 0;
    for (const change of CHANGE_META) {
      const value = counts[`${scope.key}_${change.key}`] ?? 0;
      if (value <= 0) continue;
      parts.push(`${change.label} ${value}`);
      scopeTotal += value;
    }
    if (scopeTotal <= 0) continue;
    total += scopeTotal;
    groups.push({ scope: scope.key, scopeLabel: scope.label, detail: parts.join(" · "), total: scopeTotal });
  }

  return { total, groups };
}
