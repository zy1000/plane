import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, FlaskConical, Layers, Library, Rows2, Tags, Workflow } from "lucide-react";
import {
  WORKSPACE_CASE_TEMPLATE_READ_PERMISSION_KEYS,
  WORKSPACE_DEV_MODE_READ_PERMISSION_KEYS,
  WORKSPACE_REQUIREMENT_LIBRARY_READ_PERMISSION_KEYS,
  WORKSPACE_REVIEW_TEMPLATE_READ_PERMISSION_KEYS,
} from "@plane/constants";

export type TTemplateManagementTabKey =
  | "libraries"
  | "product"
  | "test-cases"
  | "reviews"
  | "issue-types"
  | "issue-fields"
  | "dev-modes";

export type TTemplateManagementNavigationItem = {
  key: TTemplateManagementTabKey;
  icon: LucideIcon;
  /** 有 i18n key 用 key；新加的页签直接写中文名 */
  i18nKey?: string;
  label?: string;
  /** 持有其中任一工作区 key 才显示这个 tab */
  permissionKeys: string[];
};

export const TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS: TTemplateManagementNavigationItem[] = [
  {
    key: "libraries",
    icon: Library,
    i18nKey: "workspace_templates.navigation.libraries",
    permissionKeys: WORKSPACE_REQUIREMENT_LIBRARY_READ_PERMISSION_KEYS,
  },
  {
    // 紧挨「标准需求库」：库的第一层模块由所选分类统一维护，读写口径与库相同
    key: "product",
    icon: Tags,
    i18nKey: "workspace_templates.navigation.product_categories",
    permissionKeys: WORKSPACE_REQUIREMENT_LIBRARY_READ_PERMISSION_KEYS,
  },
  {
    key: "test-cases",
    icon: FlaskConical,
    i18nKey: "workspace_templates.navigation.test_cases",
    permissionKeys: WORKSPACE_CASE_TEMPLATE_READ_PERMISSION_KEYS,
  },
  {
    key: "reviews",
    icon: ClipboardCheck,
    i18nKey: "workspace_templates.navigation.reviews",
    permissionKeys: WORKSPACE_REVIEW_TEMPLATE_READ_PERMISSION_KEYS,
  },
  {
    // 工作项类型库：所有研发模式共用，模式只关联其中一部分；读写口径同研发模式
    key: "issue-types",
    icon: Layers,
    label: "工作项类型",
    permissionKeys: WORKSPACE_DEV_MODE_READ_PERMISSION_KEYS,
  },
  {
    key: "issue-fields",
    icon: Rows2,
    label: "通用字段库",
    permissionKeys: WORKSPACE_DEV_MODE_READ_PERMISSION_KEYS,
  },
  {
    // 紧挨「评审」：模式的阶段配置直接引用评审树上的节点，维护两者的是同一批人
    key: "dev-modes",
    icon: Workflow,
    i18nKey: "workspace_templates.navigation.dev_modes",
    permissionKeys: WORKSPACE_DEV_MODE_READ_PERMISSION_KEYS,
  },
];

/** tab key 就是路径段，改 key 即改路由 */
export const getTemplateManagementTabPath = (workspaceSlug: string, tabKey: TTemplateManagementTabKey) =>
  `/${workspaceSlug}/templates/${tabKey}`;
