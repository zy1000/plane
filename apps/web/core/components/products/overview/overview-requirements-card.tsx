import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { getButtonStyling } from "@plane/propel/button";
import { REQUIREMENT_STATUSES } from "@plane/types";
import type { TProductOverviewRequirements } from "@plane/types";
import { Loader } from "@plane/ui";
import { REQUIREMENT_STATUS_BAR_COLOR } from "../projects/product-project-status-bar";

type TProps = {
  summary: TProductOverviewRequirements | null | undefined;
  isLoading: boolean;
  /** 需求页地址；空态按钮与「待审批变更单」都从这里拼 */
  requirementsPath: string;
  canCreate: boolean;
  canImport: boolean;
};

type TTileTone = "danger" | "warning" | "neutral";

const TILE_VALUE_CLASS: Record<TTileTone, string> = {
  danger: "text-danger-primary",
  warning: "text-warning-primary",
  neutral: "text-primary",
};

function SummaryTile({ label, value, tone, to }: { label: string; value: number; tone: TTileTone; to?: string }) {
  // 0 一律灰掉：空产品四格全是 0，不该有颜色
  const valueClass = value > 0 ? TILE_VALUE_CLASS[tone] : "text-placeholder";
  const content = (
    <>
      <span className="text-12 text-tertiary">{label}</span>
      {/* 字号与颜色不进同一个 cn：tailwind-merge 会把它们当同组互斥 */}
      <span className={`text-24 leading-tight font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </>
  );
  const className =
    "flex flex-col justify-center gap-1.5 border-subtle px-5 py-4 [&:nth-child(-n+2)]:border-b [&:nth-child(odd)]:border-r";
  return to && value > 0 ? (
    <Link to={to} className={`${className} transition-colors hover:bg-layer-1`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** 需求概况：状态分布条 + 评审中 / 待审批变更单 / 已逾期 / 7 天内到期 */
export function ProductOverviewRequirementsCard({ summary, isLoading, requirementsPath, canCreate, canImport }: TProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Loader>
        <Loader.Item height="168px" />
      </Loader>
    );
  }

  const total = summary?.total ?? 0;
  const closed = summary?.status_counts.closed ?? 0;
  const items = REQUIREMENT_STATUSES.map((status) => ({
    key: status,
    label: t(`requirement_fields.statuses.${status}`),
    value: summary?.status_counts[status] ?? 0,
    color: REQUIREMENT_STATUS_BAR_COLOR[status],
  }));

  return (
    <section
      aria-label={t("workspace_products.overview.requirements.title")}
      className="flex min-w-0 flex-wrap overflow-hidden rounded-lg border border-subtle bg-surface-1"
    >
      <div className="flex min-w-0 flex-[999_1_380px] flex-col gap-3.5 px-5 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-14 font-semibold text-primary">{t("workspace_products.overview.requirements.title")}</h2>
          {closed > 0 && (
            <span className="text-12 text-tertiary">
              {t("workspace_products.overview.requirements.closed_meta", { count: closed })}
            </span>
          )}
        </div>

        {summary === null ? (
          <p className="text-13 text-tertiary">{t("workspace_products.overview.requirements.no_access")}</p>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-28 leading-none font-semibold tabular-nums text-primary">{total}</span>
              <span className="text-13 text-tertiary">{t("workspace_products.overview.requirements.unit")}</span>
            </div>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-sm bg-layer-2">
              {items
                .filter((item) => item.value > 0)
                .map((item) => (
                  <div
                    key={item.key}
                    title={`${item.label} ${item.value}`}
                    className="h-full rounded-xs"
                    style={{ flexGrow: item.value, backgroundColor: item.color }}
                  />
                ))}
            </div>
            {total > 0 ? (
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-12 text-secondary">
                {items.map((item) => (
                  <span key={item.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="size-2 rounded-xs" style={{ backgroundColor: item.color }} />
                    {item.label}
                    <span className="font-semibold tabular-nums text-primary">{item.value}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex-1 text-13 text-secondary">
                  {t("workspace_products.overview.requirements.empty")}
                </span>
                {canCreate && canImport && (
                  <Link to={`${requirementsPath}?action=import`} className={getButtonStyling("secondary", "xl")}>
                    {t("workspace_products.overview.requirements.import")}
                  </Link>
                )}
                {canCreate && (
                  <Link to={`${requirementsPath}?action=create`} className={getButtonStyling("primary", "xl")}>
                    {t("workspace_products.overview.requirements.create")}
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid flex-[1_1_280px] grid-cols-2 border-l border-subtle">
        <SummaryTile
          label={t("workspace_products.overview.requirements.in_review")}
          value={summary?.in_review_count ?? 0}
          tone="neutral"
        />
        <SummaryTile
          label={t("workspace_products.overview.requirements.pending_change_requests")}
          value={summary?.pending_change_request_count ?? 0}
          tone="neutral"
          to={`${requirementsPath}?tab=changes`}
        />
        <SummaryTile
          label={t("workspace_products.overview.requirements.overdue")}
          value={summary?.overdue_count ?? 0}
          tone="danger"
        />
        <SummaryTile
          label={t("workspace_products.overview.requirements.due_soon")}
          value={summary?.due_soon_count ?? 0}
          tone="warning"
        />
      </div>
    </section>
  );
}
