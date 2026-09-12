/**
 * 裁剪表的描述在界面上是纯文本框，后端存的是 HTML：写入时按行包成段落，读出时再拆回来。
 * 新建弹窗与详情页头部共用这一对，免得两边换行规则对不上。
 */

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const toDescriptionHtml = (text: string) =>
  text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export const descriptionHtmlToText = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .trim();
