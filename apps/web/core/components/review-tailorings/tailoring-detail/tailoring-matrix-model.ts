import type { TReviewTailoringItem, TReviewTailoringProduct, TReviewTailoringRow } from "@plane/types";

/**
 * 矩阵的纯派生逻辑。全部是纯函数，方便在不挂载组件的情况下推演联动与锁定规则。
 */

/** 矩阵的一行 = 模式阶段 × 模板节点，横向铺开每个产品的格子 */
export type TMatrixRow = {
  /**
   * 行的身份是 `${stageId}:${templateId}`，不是单独的 templateId。
   *
   * 同一个模板节点在项目模式的两个同类型阶段下（o-1、o-2）各占一行，各自独立勾选，
   * 光靠 templateId 认不出是哪一行 —— React key、格子索引、批量选中都要用这个键。
   */
  rowKey: string;
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

/** 行键：阶段 + 节点。父子查找仍按 templateId，因为那是在同一段（同一阶段）内部做的 */
export const rowKeyOf = (stageId: string, templateId: string) => `${stageId}:${templateId}`;

/**
 * 把纵轴的一段折成树，并把格子挂到对应的行上。
 *
 * 行来自 `detail.rows` 而**不是**从格子反推 —— 刚加完评审还没加产品的表一个格子都没有，
 * 反推的话整张表会看起来是空的。顺序取模板的 sort_order，并把评审活动排到它所属评审的
 * 正下方（后端按 sort_order 全局排序，父子在同一个序列里未必相邻）。没有父的活动（有些
 * 阶段没有汇总评审）留在顶层，与评审平级。
 */
const buildRows = (rows: TReviewTailoringRow[], cellsByRowKey: Map<string, TReviewTailoringItem[]>): TMatrixRow[] => {
  const present = new Set(rows.map((row) => row.template_id));

  const toRow = (row: TReviewTailoringRow, isChild: boolean): TMatrixRow => ({
    rowKey: rowKeyOf(row.stage_id, row.template_id),
    templateId: row.template_id,
    stageId: row.stage_id,
    title: row.title,
    kind: row.kind,
    isChild,
    sortOrder: row.sort_order,
    cells: new Map(
      (cellsByRowKey.get(rowKeyOf(row.stage_id, row.template_id)) ?? []).map((cell) => [cell.product_id, cell])
    ),
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
 * 读起来和阶段评审左栏是同一个顺序（按项目研发模式里阶段的 sort_order，同序再按名字）。
 * 同一类型的两个阶段（o-1、o-2）各自成段，段内可以出现同一个模板节点。
 */
export const buildMatrixGroups = (rows: TReviewTailoringRow[], items: TReviewTailoringItem[]): TMatrixGroup[] => {
  const cellsByRowKey = new Map<string, TReviewTailoringItem[]>();
  for (const item of items) {
    const key = rowKeyOf(item.stage_id, item.template_id);
    const bucket = cellsByRowKey.get(key);
    if (bucket) bucket.push(item);
    else cellsByRowKey.set(key, [item]);
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
      rows: buildRows(bucket.rows, cellsByRowKey),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.stageLabel.localeCompare(b.stageLabel));
};

export type TCellCounts = { kept: number; cut: number; missing: number };

/** 一批格子里保留、裁剪（含缺原因）、缺原因各几格。产品列头、阶段行、行首小计共用 */
export const countCells = (cells: Iterable<TReviewTailoringItem>): TCellCounts => {
  const counts: TCellCounts = { kept: 0, cut: 0, missing: 0 };
  for (const cell of cells) {
    if (cell.selected) {
      counts.kept += 1;
      continue;
    }
    counts.cut += 1;
    if (!cell.reason.trim()) counts.missing += 1;
  }
  return counts;
};

const CHILD_TITLE_JOINERS = ["-", "－", "–", "—"];

/**
 * 评审活动的标题往往带着父评审的全名当前缀（「I阶段评审-需求评审（软件&整机）」），
 * 在树里重复一遍既占宽又会把真正的名字截掉。拆出前缀交给渲染层画淡，数据不动。
 */
export const splitChildTitle = (parentTitle: string | undefined, title: string): { prefix: string; rest: string } => {
  if (parentTitle) {
    for (const joiner of CHILD_TITLE_JOINERS) {
      const prefix = `${parentTitle}${joiner}`;
      if (title.startsWith(prefix) && title.length > prefix.length) return { prefix, rest: title.slice(prefix.length) };
    }
  }
  return { prefix: "", rest: title };
};

/** 矩阵横轴：产品按后端给的顺序（identifier）排，这里只做一次浅拷贝防止调用方就地改 */
export const buildMatrixColumns = (products: TReviewTailoringProduct[]): TReviewTailoringProduct[] => [...products];

/**
 * 这个格子能不能改。
 *
 * 只剩一种锁：停用模板不许新增勾选。已评审的评审可以裁掉（定稿后唯一的纠错出口），
 * 由格子与提交弹窗提示会删除记录。返回 null 表示可改，否则是该显示的原因 key。
 */
export const getCellLockReason = (item: TReviewTailoringItem, nextSelected: boolean): "locked_disabled" | null => {
  if (nextSelected && !item.template_is_active && !item.stage_review_id) return "locked_disabled";
  return null;
};

/** 段内全部格子（整段批量保留 / 裁剪）。传多段进来就是整表，传 productId 就是整列 */
export const collectGroupCells = (groups: TMatrixGroup[], productId?: string): TReviewTailoringItem[] => {
  const cells: TReviewTailoringItem[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (productId) {
        const cell = row.cells.get(productId);
        if (cell) cells.push(cell);
      } else {
        cells.push(...row.cells.values());
      }
    }
  }
  return cells;
};

/**
 * 头部三格数字、签批面板与提交弹窗的摘要都从这里取，读的是**本地格子**（含未保存的改动），
 * 所以勾一下头部就跟着变。
 *
 * 「生效后」的两个数与后端 `_apply_effective` 同一口径：勾上但还没生成评审的格子会新建，
 * 取消勾选但已生成评审的格子会删掉。
 */
export type TTailoringStats = {
  total: number;
  selected: number;
  cut: number;
  missing: number;
  toCreate: number;
  toDelete: number;
  /** 要删的里面已评审的条数：签批生效后连同轨迹、评论、附件一起删，提交时要提醒 */
  toDeleteCompleted: number;
  generated: number;
};

/** 取消勾选了一个已评审的格子：签批生效时这条评审会被删掉 */
export const isCompletedCut = (item: TReviewTailoringItem) =>
  !item.selected && Boolean(item.stage_review_id) && item.stage_review_status === "completed";

export const getTailoringStats = (items: TReviewTailoringItem[]): TTailoringStats => {
  const stats: TTailoringStats = {
    total: 0,
    selected: 0,
    cut: 0,
    missing: 0,
    toCreate: 0,
    toDelete: 0,
    toDeleteCompleted: 0,
    generated: 0,
  };
  for (const item of items) {
    stats.total += 1;
    if (item.stage_review_id) stats.generated += 1;
    if (item.selected) {
      stats.selected += 1;
      if (!item.stage_review_id) stats.toCreate += 1;
      continue;
    }
    stats.cut += 1;
    if (!item.reason.trim()) stats.missing += 1;
    if (item.stage_review_id) stats.toDelete += 1;
    if (isCompletedCut(item)) stats.toDeleteCompleted += 1;
  }
  return stats;
};

/** 矩阵的快速筛选：只看缺原因（可编辑时）/ 只看裁掉的（只读时） */
export type TMatrixFilter = "all" | "missing" | "cut";

const cellMatches = (cell: TReviewTailoringItem, filter: TMatrixFilter) => {
  if (filter === "missing") return !cell.selected && !cell.reason.trim();
  if (filter === "cut") return !cell.selected;
  return true;
};

/**
 * 按筛选收窄每一段的行。子行命中时把它的父行也留下 —— 否则活动会脱离所属评审孤零零地挂着。
 * 没有行留下的段整段不画。
 */
export const filterMatrixGroups = (groups: TMatrixGroup[], filter: TMatrixFilter): TMatrixGroup[] => {
  if (filter === "all") return groups;
  return groups
    .map((group) => {
      const keep = new Set<number>();
      let lastRootIndex = -1;
      group.rows.forEach((row, index) => {
        if (!row.isChild) lastRootIndex = index;
        if (![...row.cells.values()].some((cell) => cellMatches(cell, filter))) return;
        keep.add(index);
        if (row.isChild && lastRootIndex >= 0) keep.add(lastRootIndex);
      });
      return { ...group, rows: group.rows.filter((_, index) => keep.has(index)) };
    })
    .filter((group) => group.rows.length > 0);
};

/** 一个顶层评审下挂了几个活动（行首的「N 个活动」） */
export const countChildren = (rows: TMatrixRow[], index: number): number => {
  let count = 0;
  for (let cursor = index + 1; cursor < rows.length && rows[cursor].isChild; cursor += 1) count += 1;
  return count;
};
