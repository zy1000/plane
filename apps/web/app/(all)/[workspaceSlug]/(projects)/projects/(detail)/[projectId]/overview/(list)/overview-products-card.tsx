import type { FC } from "react";
import { observer } from "mobx-react";
import { Package } from "lucide-react";
import { Link } from "react-router";
import {
  PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY,
  PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import { REQUIREMENT_STATUSES } from "@plane/types";
import type { TProductProject } from "@plane/types";
import { Avatar, Loader } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import {
  getCompletionRate,
  ProductProjectStatusBar,
  REQUIREMENT_STATUS_BAR_COLOR,
} from "@/components/products/projects/product-project-status-bar";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { OverviewCard } from "./overview-card";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_96px_48px_150px_60px_28px] items-center gap-3.5";

const ProductRow: FC<{ link: TProductProject; href: string }> = ({ link, href }) => {
  const { t } = useTranslation();
  const stage = link.product_stage_detail;
  const lead = link.product_project_lead_detail;

  return (
    <Link to={href} className={cn(ROW_GRID, "group border-t border-subtle py-3")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 flex-shrink-0 place-items-center rounded-lg bg-layer-1">
          {link.product_logo_props?.in_use ? (
            <Logo logo={link.product_logo_props} size={16} />
          ) : (
            <Package className="size-4 text-tertiary" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-13 font-semibold text-primary transition-colors group-hover:text-accent-primary">
            {link.product_name}
          </p>
          <p className="mt-0.5 flex min-w-0 gap-2 text-11 text-tertiary">
            {link.product_code && (
              <span className="truncate">
                {t("project_overview.products.code")}{" "}
                <span className="rounded bg-layer-1 px-1 text-secondary">{link.product_code}</span>
              </span>
            )}
            {link.product_identifier && (
              <span className="truncate">
                {t("project_overview.products.identifier")}{" "}
                <span className="rounded bg-layer-1 px-1 text-secondary">{link.product_identifier}</span>
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="min-w-0">
        {stage ? (
          <DictionaryValueTag label={stage.label} color={resolveDictionaryItemColor(stage)} />
        ) : (
          <span className="text-12 text-placeholder">—</span>
        )}
      </div>
      <span className="text-13 font-semibold tabular-nums text-primary">{link.requirement_count}</span>
      <div className="min-w-0">
        <ProductProjectStatusBar statusCounts={link.status_counts} total={link.requirement_count} />
      </div>
      <Tooltip tooltipContent={t("project_products.completion_hint")}>
        <span className="text-right text-13 font-semibold tabular-nums text-primary">
          {getCompletionRate(link.status_counts, link.requirement_count)}
          <span className="ml-0.5 text-11 font-normal text-tertiary">%</span>
        </span>
      </Tooltip>
      <div className="flex justify-end">
        {lead ? (
          <Avatar name={lead.display_name} src={getFileURL(lead.avatar_url ?? "")} size={24} shape="circle" />
        ) : (
          <span className="text-12 text-placeholder">—</span>
        )}
      </div>
    </Link>
  );
};

const ProductsLegend: FC = () => {
  const { t } = useTranslation();
  return (
    <div className="mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-subtle pt-3 text-11 text-tertiary">
      {REQUIREMENT_STATUSES.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: REQUIREMENT_STATUS_BAR_COLOR[status] }} />
          {t(`requirement_fields.statuses.${status}`)}
        </span>
      ))}
      <span className="ml-auto">{t("project_overview.products.formula")}</span>
    </div>
  );
};

/** 概览「关联产品」卡：每个产品在本项目里引了多少需求、做到哪、谁负责 */
export const OverviewProductsCard: FC<Props> = observer(({ workspaceSlug, projectId }) => {
  const { t } = useTranslation();
  const router = useAppRouter();
  const { allowProjectPermissionKeys } = useUserPermissions();
  // 与项目「产品」页同一组 key：列表放行 view / manage 任一，管理入口只认 manage
  const canView = allowProjectPermissionKeys(
    [PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY, PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );
  const canManage = allowProjectPermissionKeys([PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY], workspaceSlug, projectId);
  const { links, isLoading, error } = useProjectProducts({
    workspaceSlug: canView ? workspaceSlug : undefined,
    projectId: canView ? projectId : undefined,
  });

  const productsHref = `/${workspaceSlug}/projects/${projectId}/products`;
  const requirementsHref = (productId: string) =>
    `/${workspaceSlug}/projects/${projectId}/requirements?product=${productId}`;

  const renderBody = () => {
    if (!canView) {
      return <p className="py-6 text-center text-12 text-placeholder">{t("project_overview.products.no_permission")}</p>;
    }
    if (isLoading) {
      return (
        <Loader className="space-y-2 pt-1">
          {Array.from({ length: 3 }, (_, index) => (
            <Loader.Item key={index} height="44px" />
          ))}
        </Loader>
      );
    }
    if (error) {
      return (
        <div className="py-6 text-center">
          <p className="text-13 font-medium text-primary">{t("project_overview.products.error")}</p>
          <p className="mt-1 text-12 text-secondary">{error}</p>
        </div>
      );
    }
    if (links.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-layer-1 text-tertiary">
            <Package className="size-5" strokeWidth={1.6} />
          </span>
          <p className="text-13 font-semibold text-primary">{t("project_overview.products.empty_title")}</p>
          <p className="max-w-[300px] text-12 leading-5 text-tertiary">
            {t("project_overview.products.empty_description")}
          </p>
          {canManage && (
            <Button variant="primary" size="sm" className="mt-1.5" onClick={() => router.push(productsHref)}>
              {t("project_overview.products.link")}
            </Button>
          )}
        </div>
      );
    }
    return (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn(ROW_GRID, "pb-2 text-11 font-medium text-tertiary")}>
            <span>{t("project_overview.products.columns.product")}</span>
            <span>{t("project_overview.products.columns.stage")}</span>
            <span>{t("project_overview.products.columns.requirements")}</span>
            <span>{t("project_overview.products.columns.status")}</span>
            <span className="text-right">{t("project_overview.products.columns.completion")}</span>
            <span />
          </div>
          {links.map((link) => (
            <ProductRow key={link.id} link={link} href={requirementsHref(link.product)} />
          ))}
        </div>
        <ProductsLegend />
      </>
    );
  };

  return (
    <OverviewCard
      title={t("project_overview.products.title")}
      icon={Package}
      meta={canView && !isLoading && !error ? String(links.length) : undefined}
      action={
        canView ? (
          <Link to={productsHref} className="text-12 font-medium text-accent-primary hover:underline">
            {canManage ? t("project_overview.products.manage") : t("project_overview.products.view_all")} →
          </Link>
        ) : undefined
      }
      className="h-full"
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">{renderBody()}</div>
    </OverviewCard>
  );
});
