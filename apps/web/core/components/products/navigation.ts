import type { LucideIcon } from "lucide-react";
import { FolderKanban, ListChecks, Rocket } from "lucide-react";

export type TProductTabKey = "dashboard" | "requirements" | "projects" | "releases";

export type TProductNavigationItem = {
  key: TProductTabKey;
  icon: LucideIcon;
  i18nKey: string;
  managerOnly: boolean;
};

export const PRODUCT_NAVIGATION_ITEMS: TProductNavigationItem[] = [
  {
    key: "requirements",
    icon: ListChecks,
    i18nKey: "workspace_products.navigation.requirements",
    managerOnly: false,
  },
  {
    key: "projects",
    icon: FolderKanban,
    i18nKey: "workspace_products.navigation.projects",
    managerOnly: false,
  },
  {
    key: "releases",
    icon: Rocket,
    i18nKey: "workspace_products.navigation.releases",
    managerOnly: false,
  },
];

export const getProductTabPath = (workspaceSlug: string, productId: string, tabKey: TProductTabKey) =>
  `/${workspaceSlug}/products/${productId}/${tabKey}`;

export const getProductNavigationItem = (tabKey: TProductTabKey) =>
  PRODUCT_NAVIGATION_ITEMS.find((item) => item.key === tabKey) ?? PRODUCT_NAVIGATION_ITEMS[0];
