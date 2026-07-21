import { ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useProductsContext } from "../context";
import { ProductSettingsHeader } from "./header";
import type { TProductSettingsKey } from "./navigation";

const PLACEHOLDER_ICONS = {
  members: UserRound,
  teams: UsersRound,
  permissions: ShieldCheck,
} satisfies Record<Exclude<TProductSettingsKey, "general">, typeof UserRound>;

export const ProductSettingsPlaceholder = observer(function ProductSettingsPlaceholder({
  settingsKey,
}: {
  settingsKey: Exclude<TProductSettingsKey, "general">;
}) {
  const { t } = useTranslation();
  const { productId } = useParams();
  const { products } = useProductsContext();
  const product = products.find(({ id }) => id === productId);
  const Icon = PLACEHOLDER_ICONS[settingsKey];
  const title = t(`workspace_products.settings.navigation.${settingsKey}`);

  return (
    <SettingsContentWrapper header={<ProductSettingsHeader settingsKey={settingsKey} />}>
      <PageHead title={product ? `${title} - ${product.name}` : title} />
      <div className="flex min-h-[480px] items-center justify-center">
        <div className="flex max-w-sm flex-col items-center px-6 text-center">
          <div className="grid size-12 place-items-center rounded-xl border border-subtle bg-layer-1 text-tertiary shadow-xs">
            <Icon className="size-5" strokeWidth={1.6} />
          </div>
          <h1 className="mt-4 text-body-md-medium text-primary">
            {t("workspace_products.settings.placeholder.title", { section: title })}
          </h1>
          <p className="mt-1.5 text-body-sm-regular leading-5 text-tertiary">
            {t("workspace_products.settings.placeholder.description")}
          </p>
        </div>
      </div>
    </SettingsContentWrapper>
  );
});
