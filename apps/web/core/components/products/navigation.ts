import type { ComponentType } from "react";
import { FolderKanban, Rocket } from "lucide-react";
import { RequirementIcon } from "@plane/propel/icons";

export type TProductTabKey = "dashboard" | "requirements" | "projects" | "releases";

export type TProductNavigationItem = {
  key: TProductTabKey;
  icon: ComponentType<{ className?: string }>;
  i18nKey: string;
  managerOnly: boolean;
};

export const PRODUCT_NAVIGATION_ITEMS: TProductNavigationItem[] = [
  {
    key: "requirements",
    icon: RequirementIcon,
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
