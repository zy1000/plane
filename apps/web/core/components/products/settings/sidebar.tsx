import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Settings, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { ScrollArea } from "@plane/propel/scrollarea";
import { cn } from "@plane/utils";
import { SettingsSidebarItem } from "@/components/settings/sidebar/item";
import { useAppRouter } from "@/hooks/use-app-router";
import { useProductsContext } from "../context";
import {
  getProductSettingsPath,
  getProductSettingsReturnPath,
  PRODUCT_SETTINGS_ITEMS,
  PRODUCT_SETTINGS_RETURN_TO_PARAM,
  type TProductSettingsKey,
} from "./navigation";

const PRODUCT_SETTINGS_ICONS = {
  general: Settings,
  members: UserRound,
  teams: UsersRound,
  permissions: ShieldCheck,
} satisfies Record<TProductSettingsKey, typeof Settings>;

type TProductSettingsSidebarProps = {
  className?: string;
  isMobile?: boolean;
  productId: string;
  workspaceSlug: string;
};

const ProductSettingsSidebarHeader = observer(function ProductSettingsSidebarHeader(
  props: Pick<TProductSettingsSidebarProps, "productId" | "workspaceSlug">
) {
  const { productId, workspaceSlug } = props;
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { products } = useProductsContext();
  const product = products.find(({ id }) => id === productId);
  const returnPath = getProductSettingsReturnPath({
    productId,
    returnTo: searchParams.get(PRODUCT_SETTINGS_RETURN_TO_PARAM),
    workspaceSlug,
  });

  if (!product) return null;

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-1 py-3 pr-5 pl-4 text-body-md-medium">
        <IconButton variant="ghost" size="base" icon={ArrowLeft} onClick={() => router.push(returnPath)} />
        <p>{t("workspace_products.settings.title")}</p>
      </div>
      <div className="mt-1.5 px-5 py-1">
        <p className="truncate text-body-sm-medium text-primary" title={product.name}>
          {product.name}
        </p>
        <p className="mt-1 truncate text-caption-md-regular text-tertiary">
          {t("workspace_products.settings.owner_summary", {
            name: product.owner_detail?.display_name ?? "-",
          })}
        </p>
      </div>
    </div>
  );
});

const ProductSettingsSidebarItems = (props: Pick<TProductSettingsSidebarProps, "productId" | "workspaceSlug">) => {
  const { productId, workspaceSlug } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const settingsSearch = searchParams.toString();
  const normalizedPathname = pathname.replace(/\/+$/, "");

  return (
    <div className="mt-4 flex flex-col px-3">
      {PRODUCT_SETTINGS_ITEMS.map((item) => {
        const itemHref = getProductSettingsPath(workspaceSlug, productId, item.key);
        const itemHrefWithSearch = settingsSearch ? `${itemHref}?${settingsSearch}` : itemHref;
        const isActive = normalizedPathname === itemHref.replace(/\/+$/, "");
        const Icon = PRODUCT_SETTINGS_ICONS[item.key];

        return (
          <SettingsSidebarItem
            key={item.key}
            as="link"
            href={itemHrefWithSearch}
            isActive={isActive}
            icon={Icon}
            label={t(item.i18nKey)}
          />
        );
      })}
    </div>
  );
};

export const ProductSettingsSidebar = observer(function ProductSettingsSidebar(props: TProductSettingsSidebarProps) {
  const { className, productId, workspaceSlug } = props;

  return (
    <ScrollArea
      scrollType="hover"
      orientation="vertical"
      size="sm"
      rootClassName={cn(
        "h-full w-[250px] shrink-0 animate-fade-in overflow-y-scroll border-r border-r-subtle bg-surface-1",
        className
      )}
      viewportClassName="pb-5"
    >
      <ProductSettingsSidebarHeader productId={productId} workspaceSlug={workspaceSlug} />
      <ProductSettingsSidebarItems productId={productId} workspaceSlug={workspaceSlug} />
    </ScrollArea>
  );
});
