import type { LucideIcon } from "lucide-react";
import { FlaskConical, Library } from "lucide-react";

export type TTemplateManagementTabKey = "libraries" | "test-cases";

export type TTemplateManagementNavigationItem = {
  key: TTemplateManagementTabKey;
  icon: LucideIcon;
  i18nKey: string;
};

export const TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS: TTemplateManagementNavigationItem[] = [
  {
    key: "libraries",
    icon: Library,
    i18nKey: "workspace_templates.navigation.libraries",
  },
  {
    key: "test-cases",
    icon: FlaskConical,
    i18nKey: "workspace_templates.navigation.test_cases",
  },
];

/** tab key 就是路径段，改 key 即改路由 */
export const getTemplateManagementTabPath = (workspaceSlug: string, tabKey: TTemplateManagementTabKey) =>
  `/${workspaceSlug}/templates/${tabKey}`;
