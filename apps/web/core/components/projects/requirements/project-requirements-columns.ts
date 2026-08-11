/**
 * 项目需求网格的列定义与显隐偏好。
 *
 * 上一版把八个内置列 + 编号 + 产品 + 阶段 + 审批 + 类型全铺开，固定列宽合计 1800px，
 * 1440px 窗口下要横滚约 850px —— 而被推到屏幕外的恰好是最没用的两列（父项常年显示
 * 「未知需求」、需求类型已经升级成顶部分面）。这里改成「默认 8 列 + 用户可勾回」。
 *
 * 显隐偏好按项目存 localStorage，与产品网格的自定义字段显隐是同一套做法
 * （requirement-grid.tsx 的 hiddenFieldIds + storageKey）。
 */
import type { TRequirementBuiltinKey } from "@plane/types";

/** 网格里的一列。内置列直接复用 REQUIREMENT_BUILTIN_COLUMNS 的渲染器，其余是本页特有 */
export type TProjectRequirementColumnKey =
  | "display_id"
  | "product"
  | "stage"
  | "approval"
  | "requirement_type"
  | TRequirementBuiltinKey;

/**
 * 默认可见的列（标题是固定左列，不参与显隐，所以不在这里）。
 *
 * 「状态」刻意不在默认集里：它与「审批」语义高度重叠（已通过 / 已确认并排出现），
 * 仓库里本来就有 shouldShowRequirementStatus() 专门防这件事。真正需要看 status 的
 * 只有 implemented / obsolete 两个值，那两个值目前无人可写（见 RequirementItemStatus
 * 的注释），所以默认藏起来，需要的人自己勾回。
 */
export const DEFAULT_VISIBLE_COLUMNS: TProjectRequirementColumnKey[] = [
  "display_id",
  "product",
  "stage",
  "approval",
  "priority",
  "assignee_id",
  "target_date",
];

/** 可勾选的全部列，顺序即渲染顺序 */
export const TOGGLEABLE_COLUMNS: TProjectRequirementColumnKey[] = [
  "display_id",
  "product",
  "stage",
  "approval",
  "priority",
  "assignee_id",
  "target_date",
  "start_date",
  "status",
  "description_html",
  "parent_id",
  "requirement_type",
];

/** 本页特有列的表头文案；内置列走 REQUIREMENT_BUILTIN_COLUMNS 自己的 labelKey */
export const COLUMN_LABEL_KEYS: Partial<Record<TProjectRequirementColumnKey, string>> = {
  display_id: "requirements.identifier.column",
  product: "project_requirements.product_column",
  stage: "project_requirements.stage_column",
  approval: "requirement_approval.column",
  requirement_type: "requirement_detail.requirement_type",
};

export const getColumnStorageKey = (projectId: string) => `project-requirements-columns__${projectId}`;

/** 存进 localStorage 的是**隐藏**集合：将来新增列时默认可见，不必迁移老用户的偏好 */
export const readHiddenColumns = (projectId: string): TProjectRequirementColumnKey[] => {
  if (typeof window === "undefined") return defaultHiddenColumns();
  try {
    const raw = window.localStorage.getItem(getColumnStorageKey(projectId));
    if (!raw) return defaultHiddenColumns();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TProjectRequirementColumnKey[]) : defaultHiddenColumns();
  } catch {
    return defaultHiddenColumns();
  }
};

export const defaultHiddenColumns = (): TProjectRequirementColumnKey[] =>
  TOGGLEABLE_COLUMNS.filter((key) => !DEFAULT_VISIBLE_COLUMNS.includes(key));
