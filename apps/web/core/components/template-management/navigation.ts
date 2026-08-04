import type { LucideIcon } from "lucide-react";
import { Library, ListChecks, ListTodo, Workflow } from "lucide-react";

export type TTemplateManagementTabKey = "requirement-types" | "libraries" | "work-items" | "workflow";

export type TTemplateManagementNavigationItem = {
  key: TTemplateManagementTabKey;
  icon: LucideIcon;
  i18nKey: string;
};

export const TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS: TTemplateManagementNavigationItem[] = [
  {
    key: "requirement-types",
    icon: ListChecks,
    i18nKey: "workspace_templates.navigation.requirement_types",
  },
  {
    key: "libraries",
    icon: Library,
    i18nKey: "workspace_templates.navigation.libraries",
  },
  {
    key: "work-items",
    icon: ListTodo,
    i18nKey: "workspace_templates.navigation.work_items",
  },
  {
    key: "workflow",
    icon: Workflow,
    i18nKey: "workspace_templates.navigation.workflow",
  },
];

/** tab key 就是路径段，改 key 即改路由 */
export const getTemplateManagementTabPath = (workspaceSlug: string, tabKey: TTemplateManagementTabKey) =>
  `/${workspaceSlug}/templates/${tabKey}`;

/** 需求类型详情页；把散在各处的路由字面量收敛到这里 */
export const getRequirementTypePath = (workspaceSlug: string, requirementTypeId?: string) =>
  requirementTypeId
    ? `/${workspaceSlug}/templates/requirement-types/${requirementTypeId}`
    : `/${workspaceSlug}/templates/requirement-types`;

export const getTemplateManagementNavigationItem = (tabKey: TTemplateManagementTabKey) =>
  TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS.find((item) => item.key === tabKey) ?? TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS[0];
