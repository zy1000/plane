import { Settings, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import type { TProductSettingsKey } from "./navigation";

const PRODUCT_SETTINGS_HEADER_DETAILS = {
  general: { icon: Settings, i18nKey: "workspace_products.settings.navigation.general" },
  members: { icon: UserRound, i18nKey: "workspace_products.settings.navigation.members" },
  teams: { icon: UsersRound, i18nKey: "workspace_products.settings.navigation.teams" },
  permissions: { icon: ShieldCheck, i18nKey: "workspace_products.settings.navigation.permissions" },
} satisfies Record<TProductSettingsKey, { icon: typeof Settings; i18nKey: string }>;

export function ProductSettingsHeader({ settingsKey }: { settingsKey: TProductSettingsKey }) {
  const { t } = useTranslation();
  const { icon: Icon, i18nKey } = PRODUCT_SETTINGS_HEADER_DETAILS[settingsKey];

  return (
    <SettingsPageHeader
      leftItem={
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label={t(i18nKey)} icon={<Icon className="size-4 text-tertiary" />} isLast />}
            isLast
          />
        </Breadcrumbs>
      }
    />
  );
}
