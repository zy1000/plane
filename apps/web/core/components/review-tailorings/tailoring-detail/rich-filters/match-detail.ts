import type { TFilterConditionNodeForDisplay, TFilterValue, TReviewTailoringItem } from "@plane/types";
import { asStrings, matchOption } from "../../list/rich-filters/match-tailoring";
import type { TMatrixGroup } from "../tailoring-matrix-model";
import type { TDetailFilterProperty } from "./types";
import { DETAIL_REASON_FILLED, DETAIL_REASON_MISSING, DETAIL_RESULT_CUT, DETAIL_RESULT_KEEP } from "./types";

export type TDetailCondition = TFilterConditionNodeForDisplay<TDetailFilterProperty, TFilterValue>;

const ROW_PROPERTIES: TDetailFilterProperty[] = ["stage", "kind"];
const CELL_PROPERTIES: TDetailFilterProperty[] = ["result", "reason", "review_status"];

/** 格子在某个格子级属性上的取值；不适用时是空串（不命中任何选项） */
const cellValue = (item: TReviewTailoringItem, property: TDetailFilterProperty) => {
  if (property === "result") return item.selected ? DETAIL_RESULT_KEEP : DETAIL_RESULT_CUT;
  if (property === "reason") {
    if (item.selected) return "";
    return item.reason.trim() ? DETAIL_REASON_FILLED : DETAIL_REASON_MISSING;
  }
  return item.stage_review_id ? (item.stage_review_status ?? "") : "";
};

export type TDetailMatcher = {
  /** 有生效的条件或搜索词；都没有时调用方可以直接用原数据 */
  isActive: boolean;
  /** 行级：阶段、类型 + 编号 / 名称搜索 */
  matchRow: (stageId: string, kind: string, standardCode: string, title: string) => boolean;
  /** 列级：产品 */
  matchProduct: (productId: string) => boolean;
  hasCellConditions: boolean;
  /** 格子级：结果、裁剪原因、评审状态，同一个格子要同时满足 */
  matchCell: (item: TReviewTailoringItem) => boolean;
};

/**
 * 把筛选行的条件（全部 AND）和搜索词编成三层判定。还没选值的条件不参与。
 *
 * 分层是给矩阵用的：行级条件筛行、产品条件收列、格子级条件要求「这一行在看得见的
 * 产品里至少有一格同时满足」。明细一行就是一格，三层直接连乘（`itemMatches`）。
 */
export const buildDetailMatcher = (conditions: TDetailCondition[], keyword: string): TDetailMatcher => {
  const active = conditions
    .map((condition) => ({ ...condition, selected: asStrings(condition.value) }))
    .filter((condition) => condition.selected.length > 0);
  const rowConditions = active.filter((condition) => ROW_PROPERTIES.includes(condition.property));
  const productConditions = active.filter((condition) => condition.property === "product");
  const cellConditions = active.filter((condition) => CELL_PROPERTIES.includes(condition.property));
  const needle = keyword.trim().toLowerCase();

  return {
    isActive: active.length > 0 || needle.length > 0,
    matchRow: (stageId, kind, standardCode, title) =>
      rowConditions.every((condition) =>
        matchOption(condition.property === "stage" ? stageId : kind, condition.operator, condition.selected)
      ) &&
      (!needle || standardCode.toLowerCase().includes(needle) || title.toLowerCase().includes(needle)),
    matchProduct: (productId) =>
      productConditions.every((condition) => matchOption(productId, condition.operator, condition.selected)),
    hasCellConditions: cellConditions.length > 0,
    matchCell: (item) =>
      cellConditions.every((condition) =>
        matchOption(cellValue(item, condition.property), condition.operator, condition.selected)
      ),
  };
};

/** 明细的一行（= 一个格子）是否命中 */
export const itemMatches = (item: TReviewTailoringItem, matcher: TDetailMatcher) =>
  matcher.matchRow(item.stage_id, item.kind, item.standard_code, item.title) &&
  matcher.matchProduct(item.product_id) &&
  matcher.matchCell(item);

/**
 * 按条件收窄矩阵的每一段。命中的行原样留下，不再把父评审拉回来 ——「类型 = 评审活动」时
 * 再冒出一行评审就违背了条件。没有行留下的段整段不画。
 */
export const filterMatrixGroups = (
  groups: TMatrixGroup[],
  matcher: TDetailMatcher,
  productIds: string[]
): TMatrixGroup[] => {
  if (!matcher.isActive) return groups;
  return groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter(
        (row) =>
          matcher.matchRow(group.stageId, row.kind, row.standardCode, row.title) &&
          (!matcher.hasCellConditions ||
            productIds.some((productId) => {
              const cell = row.cells.get(productId);
              return Boolean(cell) && matcher.matchCell(cell!);
            }))
      ),
    }))
    .filter((group) => group.rows.length > 0);
};
