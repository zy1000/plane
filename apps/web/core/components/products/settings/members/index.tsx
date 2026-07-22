import { observer } from "mobx-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useProductsContext } from "../../context";
import { ProductSettingsHeader } from "../header";
import { ProductMemberList } from "./member-list";

export const ProductMembersSettings = observer(function ProductMembersSettings() {
  const { workspaceSlug, productId } = useParams();
  const { t } = useTranslation();
  const { products } = useProductsContext();
  const product = products.find((item) => item.id === productId);

  if (!workspaceSlug || !productId) return null;

  return (
    <SettingsContentWrapper header={<ProductSettingsHeader settingsKey="members" />} hugging>
      <PageHead
        title={`${t("workspace_products.settings.navigation.members")}${product?.name ? ` - ${product.name}` : ""}`}
      />
      <SettingsHeading
        title={t("workspace_products.settings.members.page_title")}
        description={t("workspace_products.settings.members.description")}
      />
      <div className="mt-8">
        <ProductMemberList productId={productId} workspaceSlug={workspaceSlug} />
      </div>
    </SettingsContentWrapper>
  );
});
