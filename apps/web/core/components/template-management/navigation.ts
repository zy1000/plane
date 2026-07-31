import type { LucideIcon } from "lucide-react";
import { Library, ListChecks, ListTodo, Workflow } from "lucide-react";

export type TTemplateManagementTabKey = "requirements" | "libraries" | "work-items" | "workflow";

export type TTemplateManagementNavigationItem = {
  key: TTemplateManagementTabKey;
  icon: LucideIcon;
  i18nKey: string;
};

export const TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS: TTemplateManagementNavigationItem[] = [
  {
    key: "requirements",
    icon: ListChecks,
    i18nKey: "workspace_templates.navigation.requirements",
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

export const getTemplateManagementTabPath = (workspaceSlug: string, tabKey: TTemplateManagementTabKey) =>
  `/${workspaceSlug}/templates/${tabKey}`;

export const getTemplateManagementNavigationItem = (tabKey: TTemplateManagementTabKey) =>
  TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS.find((item) => item.key === tabKey) ?? TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS[0];
