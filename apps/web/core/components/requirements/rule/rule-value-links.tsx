import { openFilestorePreview, parseFilestorePreviewLink } from "@/components/filestore/filestore-preview-link";

/**
 * 「动态取值」里的网址显示成可点的链接。只认 http(s) 开头的一段 ASCII：中文里网址后面常常
 * 直接跟着汉字或全角标点（「见http://a.com/x页面」），把它们算进网址就点不开了。
 */

const URL_SOURCE = "https?:\\/\\/[^\\s<>\"'\\u0080-\\uffff]+";
/** 句子末尾的标点不算网址的一部分 */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

type TLinkPart = { text: string; href?: string };

export const splitRuleValueLinks = (text: string): TLinkPart[] => {
  const parts: TLinkPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(URL_SOURCE, "g"))) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: url, href: url });
    cursor = start + url.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
};

export const hasRuleValueLink = (text: string) => new RegExp(URL_SOURCE).test(text);

/**
 * 一段取值文字，其中的网址可点：文件模块「复制链接」的地址在当前页面弹出预览，其余新标签页打开
 * （按住 Ctrl / ⌘ 点一律新标签页）。
 *
 * 点击自己接管而不是交给 <a> 的默认行为：它会出现在「点了就打开下拉 / 进入编辑 / 打开抽屉」
 * 的格子里，链接上的点击不能再冒到外层；外层是 <button> 时浏览器也不保证触发默认跳转。
 */
export const RuleValueLinkedText = ({ text }: { text: string }) => (
  <>
    {splitRuleValueLinks(text).map((part, index) =>
      part.href ? (
        <a
          key={index}
          href={part.href}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const preview = event.ctrlKey || event.metaKey ? null : parseFilestorePreviewLink(part.href ?? "");
            if (preview && openFilestorePreview(preview)) return;
            window.open(part.href, "_blank", "noopener,noreferrer");
          }}
          className="text-accent-primary hover:underline"
        >
          {part.text}
        </a>
      ) : (
        part.text
      )
    )}
  </>
);
