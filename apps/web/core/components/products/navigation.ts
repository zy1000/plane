import type { ComponentType } from "react";
import { ClipboardCheck, FolderKanban, PackageOpen, Rocket, Rss } from "lucide-react";
import { RequirementIcon, TestManagementIcon, WorkItemsIcon } from "@plane/propel/icons";

export type TProductTabKey =
  | "overview"
  | "requirements"
  | "work-items"
  | "projects"
  | "stage-reviews"
  | "releases"
  | "testhub"
  | "set-products";

export type TProductNavigationItem = {
  key: TProductTabKey;
  icon: ComponentType<{ className?: string }>;
  i18nKey: string;
  managerOnly: boolean;
};

export const PRODUCT_NAVIGATION_ITEMS: TProductNavigationItem[] = [
  {
    // 进产品默认落这里（2026-11 新增，与项目概览同名）
    key: "overview",
    icon: Rss,
    i18nKey: "workspace_products.navigation.overview",
    managerOnly: false,
  },
  {
    key: "requirements",
    icon: RequirementIcon,
    i18nKey: "workspace_products.navigation.requirements",
    managerOnly: false,
  },
  {
    // Issue.product 指向本产品的工作项（跨项目只读，2026-11 新增）
    key: "work-items",
    icon: WorkItemsIcon,
    i18nKey: "workspace_products.navigation.work_items",
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

/** 产品集独有的「产品」页签：集内产品的加入 / 移出 */
const PRODUCT_SET_PRODUCTS_ITEM: TProductNavigationItem = {
  key: "set-products",
  icon: PackageOpen,
  i18nKey: "workspace_product_sets.navigation.products",
  managerOnly: false,
};

/** 产品集沿用产品的页面，页签换成：概览 / 需求 / 工作项 / 测试 / 产品 / 项目 */
const PRODUCT_SET_TAB_KEYS: TProductTabKey[] = ["overview", "requirements", "work-items", "testhub", "set-products", "projects"];

export const PRODUCT_SET_NAVIGATION_ITEMS: TProductNavigationItem[] = PRODUCT_SET_TAB_KEYS.map(
  (key) => PRODUCT_NAVIGATION_ITEMS.find((item) => item.key === key) ?? PRODUCT_SET_PRODUCTS_ITEM
);

/** 有二级页的页签按前缀高亮 */
export const PRODUCT_PREFIX_ACTIVE_TABS: TProductTabKey[] = ["testhub"];

export const getProductTabPath = (workspaceSlug: string, productId: string, tabKey: TProductTabKey) =>
  `/${workspaceSlug}/products/${productId}/${tabKey}`;

export const getProductNavigationItem = (tabKey: TProductTabKey) =>
  PRODUCT_NAVIGATION_ITEMS.find((item) => item.key === tabKey) ?? PRODUCT_NAVIGATION_ITEMS[0];
