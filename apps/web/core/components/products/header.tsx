import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PackageOpen, Plus, Search } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EUserWorkspaceRoles } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { useUserPermissions } from "@/hooks/store/user";
import { useProductsContext } from "./context";

export const ProductsHeader = observer(function ProductsHeader() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { workspaceInfoBySlug, hasAllWorkspacePermissions } = useUserPermissions();
  const { searchQuery, setSearchQuery, openProductModal } = useProductsContext();
  const slug = workspaceSlug?.toString() ?? "";
  const workspaceInfo = workspaceInfoBySlug(slug);
  const canCreate =
    workspaceInfo?.role === EUserWorkspaceRoles.ADMIN ||
    workspaceInfo?.role === EUserWorkspaceRoles.MEMBER ||
    hasAllWorkspacePermissions(slug);

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t("workspace_products.title")}
                icon={<PackageOpen className="size-4 text-secondary" />}
              />
            }
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        <label className="relative block w-36 sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("workspace_products.search_placeholder")}
            className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
          />
        </label>
        {canCreate && (
          <Button variant="primary" size="lg" onClick={() => openProductModal("create")}>
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">{t("workspace_products.create_product")}</span>
          </Button>
        )}
      </Header.RightItem>
    </Header>
  );
});
