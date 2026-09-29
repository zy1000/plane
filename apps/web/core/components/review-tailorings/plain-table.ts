/**
 * 裁剪表各处表格共用的格子样式：灰底表头、横竖格线、单行 44px，不带底色与药丸。
 *
 * 表格本身用 `border-separate border-spacing-0`，sticky 的表头与首列才画得出格线。
 */
export const PLAIN_TABLE = "w-full border-separate border-spacing-0";

export const PLAIN_TH =
  "h-10 border-r border-b border-subtle bg-layer-1 px-3 text-left text-12 font-medium whitespace-nowrap text-tertiary last:border-r-0";

export const PLAIN_TD = "h-11 border-r border-b border-subtle px-3 text-13 text-primary last:border-r-0";

/** 行尾「操作」列里的文字按钮 */
export const PLAIN_ACTION = "text-13 whitespace-nowrap text-accent-primary hover:underline disabled:text-placeholder disabled:no-underline";

export const PLAIN_ACTION_DANGER = "text-13 whitespace-nowrap text-danger-primary hover:underline";

/** 「2026-09-24 16:20」：按本地时区，精确到分钟 */
export const formatMinute = (value: string) => value.slice(0, 16);
