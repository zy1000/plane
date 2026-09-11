import type { TReviewTailoringItem, TReviewTailoringProduct, TReviewTailoringRow } from "@plane/types";

/**
 * 矩阵的纯派生逻辑。全部是纯函数，方便在不挂载组件的情况下推演联动与锁定规则。
 */

/** 矩阵的一行 = 纵轴上的一个模板节点，横向铺开每个产品的格子 */
export type TMatrixRow = {
  templateId: string;
  stageId: string;
  title: string;
  kind: string;
  /** 评审活动挂在它所属的评审下，渲染时缩进一级 */
  isChild: boolean;
  sortOrder: number;
  /** product_id → 格子。只加了纵轴还没加产品时是空的 */
  cells: Map<string, TReviewTailoringItem>;
};

/**
 * 把纵轴的一段折成树，并把格子挂到对应的行上。
 *
 * 行来自 `detail.rows` 而**不是**从格子反推 —— 刚加完评审还没加产品的表一个格子都没有，
 * 反推的话整张表会看起来是空的。顺序取模板的 sort_order，并把评审活动排到它所属评审的
 * 正下方（后端按 sort_order 全局排序，父子在同一个序列里未必相邻）。没有父的活动（有些
 * 阶段没有汇总评审）留在顶层，与评审平级。
 */
const buildRows = (rows: TReviewTailoringRow[], cellsByTemplate: Map<string, TReviewTailoringItem[]>): TMatrixRow[] => {
  const present = new Set(rows.map((row) => row.template_id));

  const toRow = (row: TReviewTailoringRow, isChild: boolean): TMatrixRow => ({
    templateId: row.template_id,
    stageId: row.stage_id,
    title: row.title,
    kind: row.kind,
    isChild,
    sortOrder: row.sort_order,
    cells: new Map((cellsByTemplate.get(row.template_id) ?? []).map((cell) => [cell.product_id, cell])),
  });

  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const childrenByParent = new Map<string, TMatrixRow[]>();
  const roots: TMatrixRow[] = [];
  for (const row of ordered) {
    const parentId = row.parent_template_id;
    // 父不在本表里时按顶层处理，否则这一行会凭空消失
    if (!parentId || !present.has(parentId)) {
      roots.push(toRow(row, false));
      continue;
    }
    const bucket = childrenByParent.get(parentId) ?? [];
    bucket.push(toRow(row, true));
    childrenByParent.set(parentId, bucket);
  }

  return roots.flatMap((root) => [root, ...(childrenByParent.get(root.templateId) ?? [])]);
};

/** 纵轴的一段 = 一个阶段，段内是该阶段的模板树 */
export type TMatrixGroup = {
  stageId: string;
  stageLabel: string;
  sortOrder: number;
  rows: TMatrixRow[];
};

/**
 * 把纵轴先按阶段分段，再在每段内部折成树。
 *
 * 纵轴是人一个个加进来的，可能横跨好几个阶段 —— 分段之后每段就是「这个阶段要裁哪些评审」，
 * 读起来和模板库、阶段评审左栏是同一个顺序（按阶段字典值的 sort_order，同序再按标签）。
 */
export const buildMatrixGroups = (rows: TReviewTailoringRow[], items: TReviewTailoringItem[]): TMatrixGroup[] => {
  const cellsByTemplate = new Map<string, TReviewTailoringItem[]>();
  for (const item of items) {
    const bucket = cellsByTemplate.get(item.template_id);
    if (bucket) bucket.push(item);
    else cellsByTemplate.set(item.template_id, [item]);
  }

  const bucketByStage = new Map<string, { label: string; sortOrder: number; rows: TReviewTailoringRow[] }>();
  for (const row of rows) {
    const bucket = bucketByStage.get(row.stage_id);
    if (bucket) bucket.rows.push(row);
    else
      bucketByStage.set(row.stage_id, {
        label: row.stage_label,
        sortOrder: row.stage_sort_order,
        rows: [row],
      });
  }

  return [...bucketByStage.entries()]
    .map(([stageId, bucket]) => ({
      stageId,
      stageLabel: bucket.label,
      sortOrder: bucket.sortOrder,
      rows: buildRows(bucket.rows, cellsByTemplate),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.stageLabel.localeCompare(b.stageLabel));
};

/** 一段里有多少个格子勾上了，用于分组行上的计数 */
export const getGroupSelectionCount = (group: TMatrixGroup): { selected: number; total: number } => {
  let selected = 0;
  let total = 0;
  for (const row of group.rows) {
    for (const cell of row.cells.values()) {
      total += 1;
      if (cell.selected) selected += 1;
    }
  }
  return { selected, total };
};

/** 矩阵横轴：产品按后端给的顺序（identifier）排，这里只做一次浅拷贝防止调用方就地改 */
export const buildMatrixColumns = (products: TReviewTailoringProduct[]): TReviewTailoringProduct[] => [...products];

/**
 * 这个格子能不能改。
 *
 * 两种锁：已评审完成的不许被裁掉，停用模板不许新增勾选。
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
