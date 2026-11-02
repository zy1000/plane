import type { ComponentType } from "react";
import { ClipboardCheck, FolderKanban, Rocket } from "lucide-react";
import { RequirementIcon, TestManagementIcon } from "@plane/propel/icons";

export type TProductTabKey = "dashboard" | "requirements" | "projects" | "stage-reviews" | "releases" | "testhub";

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
    key: "stage-reviews",
    icon: ClipboardCheck,
    i18nKey: "workspace_products.navigation.stage_reviews",
    managerOnly: false,
  },
  {
    key: "releases",
    icon: Rocket,
    i18nKey: "workspace_products.navigation.releases",
    managerOnly: false,
  },
  {
    // 用例库 / 用例 / 用例评审（2026-11 从项目挪来）
    key: "testhub",
    icon: TestManagementIcon,
    i18nKey: "workspace_products.navigation.testhub",
    managerOnly: false,
  },
];

/** 有二级页的页签按前缀高亮 */
export const PRODUCT_PREFIX_ACTIVE_TABS: TProductTabKey[] = ["testhub"];

export const getProductTabPath = (workspaceSlug: string, productId: string, tabKey: TProductTabKey) =>
  `/${workspaceSlug}/products/${productId}/${tabKey}`;

export const getProductNavigationItem = (tabKey: TProductTabKey) =>
  PRODUCT_NAVIGATION_ITEMS.find((item) => item.key === tabKey) ?? PRODUCT_NAVIGATION_ITEMS[0];
