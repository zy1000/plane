import type { TFlatFilterExpression } from "../../list/rich-filters/types";

/**
 * 裁剪表详情（矩阵与明细共用）的筛选属性：
 * 阶段、类型落在行上；产品落在列上；结果、裁剪原因、评审状态落在格子上。
 */
export const DETAIL_FILTER_PROPERTY_KEYS = ["stage", "kind", "product", "result", "reason", "review_status"] as const;

export type TDetailFilterProperty = (typeof DETAIL_FILTER_PROPERTY_KEYS)[number];

export type TDetailFilterExpression = TFlatFilterExpression<TDetailFilterProperty>;

/** 「结果」的两个取值 */
export const DETAIL_RESULT_KEEP = "keep";
export const DETAIL_RESULT_CUT = "cut";

/** 「裁剪原因」的两个取值：只对裁掉的格子有意义，保留的格子两样都不算 */
export const DETAIL_REASON_FILLED = "filled";
export const DETAIL_REASON_MISSING = "missing";
