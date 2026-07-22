import { observer } from "mobx-react";
import { Link, useLocation } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TabNavigationItem, TabNavigationList } from "@plane/propel/tab-navigation";
import { Header, Row } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
// local imports
import { getTemplateManagementTabPath, TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS } from "./navigation";

type TTemplateManagementTopNavigationProps = {
  workspaceSlug: string;
};

export const TemplateManagementTopNavigation = observer(function TemplateManagementTopNavigation(
  props: TTemplateManagementTopNavigationProps
) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { sidebarCollapsed } = useAppTheme();

  return (
    <div className="z-20">
      <Row className="flex h-header w-full items-center gap-2 border-b border-subtle bg-surface-1">
        <Header className={cn("h-full", { "pl-1.5": !sidebarCollapsed })}>
          <Header.LeftItem className="flex h-full w-full max-w-full items-center gap-2">
            <div className="flex size-full items-center gap-3 overflow-hidden">
              <Link
                to={getTemplateManagementTabPath(workspaceSlug, "requirements")}
                className="shrink-0 text-13 font-medium text-primary"
              >
                {t("workspace_templates.title")}
              </Link>

              <div className="h-5 w-px shrink-0 border-l border-subtle" />

              <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
                <TabNavigationList className="h-full">
                  {TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS.map((item) => {
                    const href = getTemplateManagementTabPath(workspaceSlug, item.key);
                    const isActive = pathname === href || pathname === `${href}/`;

                    return (
                      <Link key={item.key} to={href} className="flex h-full items-center">
                        <TabNavigationItem isActive={isActive}>
                          <span>{t(item.i18nKey)}</span>
                        </TabNavigationItem>
                      </Link>
                    );
                  })}
                </TabNavigationList>
              </div>
            </div>
          </Header.LeftItem>
        </Header>
      </Row>
    </div>
  );
});
