/**
 * 文件模块「复制链接」的地址：生成它、认出它，并在当前页面里弹出预览。
 *
 * 系统里点到这种链接不新开标签页 —— 交给挂在工作区布局上的 FilestorePreviewHost 弹窗；
 * 系统外（聊天工具、邮件）点开才是那个独立预览页。
 */
export type TFilestorePreviewTarget = { workspaceSlug: string; projectId: string; assetId: string };

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const PREVIEW_PATH = new RegExp(`^/([^/]+)/projects/(${UUID})/filestore/preview/(${UUID})/?$`);

export const filestorePreviewPath = ({ workspaceSlug, projectId, assetId }: TFilestorePreviewTarget) =>
  `/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}/filestore/preview/${encodeURIComponent(assetId)}`;

/**
 * 只看路径不看域名：同一套系统在大网 / 小网各有一个访问地址，别人从另一个地址复制来的链接
 * 也要认 —— 照域名新开标签页，对方那个地址这边可能根本打不开。
 */
export const parseFilestorePreviewLink = (href: string): TFilestorePreviewTarget | null => {
  try {
    const matched = PREVIEW_PATH.exec(new URL(href, window.location.origin).pathname);
    if (!matched) return null;
    return { workspaceSlug: decodeURIComponent(matched[1]), projectId: matched[2], assetId: matched[3] };
  } catch {
    return null;
  }
};

const handlers = new Set<(target: TFilestorePreviewTarget) => void>();

/** 弹窗宿主（FilestorePreviewHost）登记自己；返回取消登记的函数 */
export const subscribeFilestorePreview = (handler: (target: TFilestorePreviewTarget) => void) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

/** 在当前页面弹出预览。没有宿主接（不在工作区布局里）时返回 false，调用方自己退回新开标签页 */
export const openFilestorePreview = (target: TFilestorePreviewTarget): boolean => {
  if (handlers.size === 0) return false;
  handlers.forEach((handler) => handler(target));
  return true;
};
