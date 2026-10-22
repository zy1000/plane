/**
 * 阶段表的列定义：表头与行共用同一个常量，避免两处手改后错位。
 *
 * 列：拖柄 / 序号 / 阶段（名称 + 编码）/ 评审节点（已勾 / 可勾）/ 工作量占比 / 标准周期 / 操作
 */
export const DEV_MODE_STAGE_ROW_GRID =
  "grid grid-cols-[18px_28px_minmax(120px,1fr)_112px_64px_68px_28px] items-center gap-2 px-3";

export const DEV_MODE_INPUT =
  "h-9 w-full rounded-md border border-subtle-1 bg-layer-2 px-3 text-13 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong";

export const DEV_MODE_I18N = "workspace_templates.dev_modes";
