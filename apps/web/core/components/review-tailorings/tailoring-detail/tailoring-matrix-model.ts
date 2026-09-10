import type { TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";

/**
 * 矩阵的纯派生逻辑。全部是纯函数，方便在不挂载组件的情况下推演联动与锁定规则。
 */

/** 矩阵的一行 = 模板树上的一个节点（评审或评审活动），横向铺开每个产品的格子 */
export type TMatrixRow = {
  templateId: string;
  title: string;
  kind: string;
  /** 评审活动挂在它所属的评审下，渲染时缩进一级 */
  isChild: boolean;
  sortOrder: number;
  /** product_id → 格子 */
  cells: Map<string, TReviewTailoringItem>;
};

/**
 * 把扁平的格子折成「行 = 模板节点，列 = 产品」。
 *
 * 纵轴顺序取模板的 sort_order，并把评审活动排到它所属评审的正下方 —— 后端按
 * sort_order 全局排序，父子在同一个序列里未必相邻。没有父的活动（有些阶段没有汇总
 * 评审）留在顶层，与评审平级。
 */
export const buildMatrixRows = (items: TReviewTailoringItem[]): TMatrixRow[] => {
  const rowByTemplate = new Map<string, TMatrixRow>();
  const parentOf = new Map<string, string | null>();

  for (const item of items) {
    parentOf.set(item.template_id, item.parent_template_id);
    let row = rowByTemplate.get(item.template_id);
    if (!row) {
      row = {
        templateId: item.template_id,
        title: item.title,
        kind: item.kind,
        isChild: Boolean(item.parent_template_id),
        sortOrder: item.template_sort_order,
        cells: new Map(),
      };
      rowByTemplate.set(item.template_id, row);
    }
    row.cells.set(item.product_id, item);
  }

  const rows = [...rowByTemplate.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  const childrenByParent = new Map<string, TMatrixRow[]>();
  const roots: TMatrixRow[] = [];
  for (const row of rows) {
    const parentId = parentOf.get(row.templateId);
    // 父不在本表里（模板被删/被停用后同步掉了）时按顶层处理，否则这一行会凭空消失
    if (!parentId || !rowByTemplate.has(parentId)) {
      roots.push({ ...row, isChild: false });
      continue;
    }
    const bucket = childrenByParent.get(parentId) ?? [];
    bucket.push(row);
    childrenByParent.set(parentId, bucket);
  }

  return roots.flatMap((root) => [root, ...(childrenByParent.get(root.templateId) ?? [])]);
};

/** 矩阵横轴：产品按后端给的顺序（identifier）排，这里只做一次浅拷贝防止调用方就地改 */
export const buildMatrixColumns = (products: TReviewTailoringProduct[]): TReviewTailoringProduct[] => [...products];

/**
 * 这个格子能不能改。
 *
 * 两种锁：已评审完成的不许被裁掉（后端提交时也会 409），停用模板不许新增勾选。
 * 返回 null 表示可改，否则是该显示的原因 key。
 */
export const getCellLockReason = (
  item: TReviewTailoringItem,
  nextSelected: boolean
): "locked_completed" | "locked_disabled" | null => {
  if (!nextSelected && item.stage_review_status === "completed") return "locked_completed";
  if (nextSelected && !item.template_is_active && !item.stage_review_id) return "locked_disabled";
  return null;
};

/** 未勾选但没写裁剪原因的格子。提交签批前要拦，明细表的「批量填写原因」也用它 */
export const collectMissingReasons = (items: TReviewTailoringItem[]): TReviewTailoringItem[] =>
  items.filter((item) => !item.selected && !item.reason.trim());

/** 一行里有多少个产品勾上了，用于渲染行级的半选态 */
export const getRowSelectionState = (row: TMatrixRow): "none" | "some" | "all" => {
  const cells = [...row.cells.values()];
  if (cells.length === 0) return "none";
  const selected = cells.filter((cell) => cell.selected).length;
  if (selected === 0) return "none";
  return selected === cells.length ? "all" : "some";
};
