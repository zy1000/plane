/**
 * 阶段表的列定义：表头与行共用同一个常量，避免两处手改后错位。
 *
 * 列：勾选 / 拖柄 / 编号 / 阶段名称 / 编码 / 阶段类型 / 工作量占比 / 标准周期 / 操作
 */
export const DEV_MODE_STAGE_ROW_GRID =
  "grid grid-cols-[24px_18px_36px_minmax(140px,1fr)_64px_minmax(96px,132px)_84px_72px_64px] items-center gap-2 px-2.5";

export const DEV_MODE_ICON_BUTTON =
  "grid size-7 place-items-center rounded text-tertiary transition-colors hover:bg-layer-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-tertiary";

export const DEV_MODE_INPUT =
  "h-9 w-full rounded-md border border-subtle-1 bg-layer-2 px-3 text-13 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong";

export const DEV_MODE_I18N = "workspace_templates.dev_modes";
