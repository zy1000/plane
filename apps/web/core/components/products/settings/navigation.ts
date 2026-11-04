export type TProductSettingsKey = "general" | "teams";

export const PRODUCT_SETTINGS_RETURN_TO_PARAM = "returnTo";

/**
 * 产品设置只剩两页：常规（写操作按 workspace.product.* 禁用）、研发团队（只读，读各关联项目的研发矩阵）。
 * 产品成员 / 产品角色已下线：产品内容按关联项目的项目权限判。
 */
export const PRODUCT_SETTINGS_ITEMS: Array<{
  key: TProductSettingsKey;
  href: string;
  i18nKey: string;
}> = [
  { key: "general", href: "", i18nKey: "workspace_products.settings.navigation.general" },
  { key: "teams", href: "/teams", i18nKey: "workspace_products.settings.navigation.teams" },
];

export const getProductSettingsPath = (
  workspaceSlug: string,
  productId: string,
  settingsKey: TProductSettingsKey = "general"
) => {
  const item = PRODUCT_SETTINGS_ITEMS.find(({ key }) => key === settingsKey) ?? PRODUCT_SETTINGS_ITEMS[0];
  return `/${workspaceSlug}/settings/products/${productId}${item.href}/`;
};

export const buildProductSettingsPath = (params: {
  currentPath?: string;
  productId: string;
  workspaceSlug: string;
}) => {
  const { currentPath, productId, workspaceSlug } = params;
  const settingsPath = getProductSettingsPath(workspaceSlug, productId);
  if (!currentPath) return settingsPath;

  const searchParams = new URLSearchParams({
    [PRODUCT_SETTINGS_RETURN_TO_PARAM]: currentPath,
  });
  return `${settingsPath}?${searchParams.toString()}`;
};

export const getProductSettingsReturnPath = (params: {
  productId: string;
  returnTo: string | null;
  workspaceSlug: string;
}) => {
  const { productId, returnTo, workspaceSlug } = params;
  const fallbackPath = `/${workspaceSlug}/products/${productId}/requirements`;
  if (!returnTo) return fallbackPath;

  const workspacePathPrefix = `/${workspaceSlug}/`;
  const productSettingsPathPrefix = `/${workspaceSlug}/settings/products/`;
  if (!returnTo.startsWith(workspacePathPrefix) || returnTo.startsWith(productSettingsPathPrefix)) return fallbackPath;

  return returnTo;
};

export const getProductSettingsActivePath = (pathname: string) => {
  const normalizedPathname = pathname.replace(/\/+$/, "");
  const activeItem = PRODUCT_SETTINGS_ITEMS.find(({ href }) => {
    if (!href) return /\/settings\/products\/[^/]+$/.test(normalizedPathname);
    return normalizedPathname.endsWith(href);
  });
  return activeItem?.i18nKey ?? PRODUCT_SETTINGS_ITEMS[0].i18nKey;
};
