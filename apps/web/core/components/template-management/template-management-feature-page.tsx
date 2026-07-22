import { observer } from "mobx-react";
import { Construction } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
// local imports
import { getTemplateManagementNavigationItem } from "./navigation";
import type { TTemplateManagementTabKey } from "./navigation";

type TTemplateManagementFeaturePageProps = {
  tabKey: TTemplateManagementTabKey;
};

export const TemplateManagementFeaturePage = observer(function TemplateManagementFeaturePage(
  props: TTemplateManagementFeaturePageProps
) {
  const { tabKey } = props;
  const { t } = useTranslation();
  const navigationItem = getTemplateManagementNavigationItem(tabKey);
  const FeatureIcon = navigationItem.icon;
  const featureTitle = t(navigationItem.i18nKey);
  const moduleTitle = t("workspace_templates.title");

  return (
    <>
      <PageHead title={`${featureTitle} - ${moduleTitle}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={featureTitle}
                      icon={<FeatureIcon className="size-4 text-tertiary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <ContentWrapper>
        <div className="flex h-full min-h-80 items-center justify-center bg-surface-1 px-6 py-10">
          <div className="flex max-w-sm flex-col items-center text-center">
            <div className="relative mb-4 text-placeholder">
              <FeatureIcon className="size-14" strokeWidth={1.25} aria-hidden="true" />
              <span className="absolute -right-2 -bottom-1 grid size-6 place-items-center rounded-md border border-subtle bg-surface-1">
                <Construction className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              </span>
            </div>
            <h1 className="text-16 font-semibold text-primary">
              {t("workspace_templates.placeholder.title", { section: featureTitle })}
            </h1>
            <p className="mt-2 text-13 leading-5 text-secondary">{t("workspace_templates.placeholder.description")}</p>
          </div>
        </div>
      </ContentWrapper>
    </>
  );
});
