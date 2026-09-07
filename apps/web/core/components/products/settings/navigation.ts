import { PRODUCT_MEMBER_MANAGE_PERMISSION_KEYS } from "@plane/constants";

export type TProductSettingsKey = "general" | "members" | "teams" | "permissions";

export const PRODUCT_SETTINGS_RETURN_TO_PARAM = "returnTo";

export const PRODUCT_SETTINGS_ITEMS: Array<{
  key: TProductSettingsKey;
  href: string;
  i18nKey: string;
  /** 给出时，持有其中任一 product.* key 才在侧栏显示；不给就是「能看见产品的人都能看」 */
  permissionKeys?: readonly string[];
}> = [
  // 常规 / 成员 / 权限三页对能看见产品的人只读开放，写操作在各页按 key 禁用
  { key: "general", href: "", i18nKey: "workspace_products.settings.navigation.general" },
  { key: "members", href: "/members", i18nKey: "workspace_products.settings.navigation.members" },
  {
    key: "teams",
    href: "/teams",
    i18nKey: "workspace_products.settings.navigation.teams",
    permissionKeys: PRODUCT_MEMBER_MANAGE_PERMISSION_KEYS,
  },
  { key: "permissions", href: "/permissions", i18nKey: "workspace_products.settings.navigation.permissions" },
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
