import type { ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite, TDataDictionaryItemLite, TProduct } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL, renderFormattedDate, sanitizeHTML } from "@plane/utils";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import { ProductOverviewCard } from "./overview-card";

const DATE_FORMAT = "yyyy-MM-dd";

function Placeholder({ children }: { children: ReactNode }) {
  return <span className="font-normal text-tertiary">{children}</span>;
}

function Person({ user, fallback }: { user: IUserLite | null; fallback: string }) {
  if (!user) return <Placeholder>{fallback}</Placeholder>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate">{user.display_name}</span>
    </span>
  );
}

function DictionaryValue({ item, fallback }: { item: TDataDictionaryItemLite | null; fallback: string }) {
  if (!item) return <Placeholder>{fallback}</Placeholder>;
  return <DictionaryValueTag label={item.label} color={resolveDictionaryItemColor(item)} size="md" />;
}

/** 右栏「产品信息」：页头没放的属性全在这里，缺的值显示「未设置」 */
export function ProductOverviewInfoCard({ product }: { product: TProduct }) {
  const { t } = useTranslation();
  const notSet = t("workspace_products.fields.not_set");
  const notClosed = t("workspace_products.overview.info.not_closed");
  const description = product.description_html ? sanitizeHTML(product.description_html).trim() : "";
  const levels = [
    { key: "hardware", label: t("workspace_products.fields.hardware_level_short"), item: product.hardware_level_detail },
    { key: "structure", label: t("workspace_products.fields.structure_level_short"), item: product.structure_level_detail },
    { key: "software", label: t("workspace_products.fields.software_level_short"), item: product.software_level_detail },
  ];
  const hasLevels = levels.some((level) => level.item);

  const rows: { key: string; label: string; value: ReactNode }[] = [
    {
      key: "stage",
      label: t("workspace_products.fields.stage"),
      value: <DictionaryValue item={product.stage_detail} fallback={notSet} />,
    },
    {
      key: "model_number",
      label: t("workspace_products.fields.model_number"),
      value: product.model_number || <Placeholder>{notSet}</Placeholder>,
    },
    {
      key: "external_model",
      label: t("workspace_products.fields.external_model"),
      value: product.external_model || <Placeholder>{notSet}</Placeholder>,
    },
    {
      key: "project_lead",
      label: t("workspace_products.fields.project_lead"),
      value: <Person user={product.project_lead_detail} fallback={notSet} />,
    },
    {
      key: "test_lead",
      label: t("workspace_products.fields.test_lead"),
      value: <Person user={product.test_lead_detail} fallback={notSet} />,
    },
    {
      key: "start_date",
      label: t("workspace_products.fields.start_date"),
      value: renderFormattedDate(product.start_date, DATE_FORMAT) ?? <Placeholder>{notSet}</Placeholder>,
    },
    {
      key: "o_phase_close_date",
      label: t("workspace_products.fields.o_phase_close_date_short"),
      value: renderFormattedDate(product.o_phase_close_date, DATE_FORMAT) ?? <Placeholder>{notClosed}</Placeholder>,
    },
    {
      key: "v_phase_close_date",
      label: t("workspace_products.fields.v_phase_close_date_short"),
      value: renderFormattedDate(product.v_phase_close_date, DATE_FORMAT) ?? <Placeholder>{notClosed}</Placeholder>,
    },
    {
      key: "levels",
      label: t("workspace_products.extended.levels"),
      value: hasLevels ? (
        <span className="flex flex-wrap gap-1">
          {levels.map((level) => (
            <span
              key={level.key}
              className="inline-flex h-6 items-center gap-1 rounded bg-layer-1 px-1.5 text-12 font-normal whitespace-nowrap text-secondary"
            >
              {level.label}
              <span className="font-semibold text-primary">{level.item?.label ?? "—"}</span>
            </span>
          ))}
        </span>
      ) : (
        <Placeholder>{notSet}</Placeholder>
      ),
    },
  ];

  return (
    <ProductOverviewCard title={t("workspace_products.overview.info.title")}>
      <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-3 gap-y-3.5 px-4 py-4 text-13">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="text-tertiary">{row.label}</dt>
            <dd className="flex min-w-0 items-center font-medium text-primary">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 border-t border-subtle px-4 py-4">
        <span className="text-13 text-tertiary">{t("workspace_products.fields.description")}</span>
        <p className="text-13 leading-relaxed break-words whitespace-pre-line text-primary">
          {description || <Placeholder>{t("workspace_products.fields.no_description")}</Placeholder>}
        </p>
      </div>
      {product.created_at && (
        <div className="border-t border-subtle px-4 py-3.5 text-12 text-tertiary">
          {t("workspace_products.overview.info.created_at", {
            date: renderFormattedDate(product.created_at, DATE_FORMAT) ?? "",
          })}
        </div>
      )}
    </ProductOverviewCard>
  );
}
