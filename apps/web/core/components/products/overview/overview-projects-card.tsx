import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { getButtonStyling } from "@plane/propel/button";
import type { TProductProject } from "@plane/types";
import { Avatar, Loader } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { getCompletionRate, ProductProjectStatusBar } from "../projects/product-project-status-bar";
import { ProductOverviewCard, ProductOverviewCardEmpty, ProductOverviewCardLink } from "./overview-card";

/** 概览里最多列几个项目，其余去「项目」页签 */
const MAX_ROWS = 5;

type TProps = {
  workspaceSlug: string;
  links: TProductProject[];
  isLoading: boolean;
  projectsPath: string;
  canLink: boolean;
};

/** 关联项目：列同产品「项目」页签（本产品需求数 / 需求状态 / 完成率），多一列项目负责人 */
export function ProductOverviewProjectsCard({ workspaceSlug, links, isLoading, projectsPath, canLink }: TProps) {
  const { t } = useTranslation();
  const rows = links.slice(0, MAX_ROWS);

  return (
    <ProductOverviewCard
      title={t("workspace_products.overview.projects.title")}
      count={isLoading ? null : links.length}
      action={
        links.length > 0 && (
          <ProductOverviewCardLink to={projectsPath}>{t("workspace_products.overview.projects.all")}</ProductOverviewCardLink>
        )
      }
    >
      {isLoading ? (
        <Loader className="space-y-2 p-4">
          <Loader.Item height="40px" />
          <Loader.Item height="40px" />
        </Loader>
      ) : rows.length === 0 ? (
        <ProductOverviewCardEmpty>
          <span>{t("workspace_products.overview.projects.empty")}</span>
          {canLink && (
            <Link to={`${projectsPath}?action=link`} className={getButtonStyling("secondary", "xl")}>
              {t("workspace_products.projects.link")}
            </Link>
          )}
        </ProductOverviewCardEmpty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-13">
            <thead>
              <tr className="border-b border-subtle text-left text-12 text-tertiary">
                <th className="h-9 px-4 font-medium">{t("workspace_products.overview.projects.project")}</th>
                <th className="h-9 px-3 font-medium">{t("workspace_products.overview.projects.lead")}</th>
                <th className="h-9 px-3 font-medium">{t("workspace_products.overview.projects.requirements")}</th>
                <th className="h-9 px-3 font-medium">{t("workspace_products.overview.projects.status")}</th>
                <th className="h-9 px-4 text-right font-medium">{t("workspace_products.projects.completion")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((link) => {
                const lead = link.project_lead_detail;
                return (
                  <tr key={link.id} className="border-b border-subtle last:border-b-0">
                    <td className="h-14 max-w-80 px-4">
                      <Link
                        to={`/${workspaceSlug}/projects/${link.project}/requirements`}
                        className="flex min-w-0 flex-col gap-0.5 hover:underline"
                      >
                        <span className="truncate font-medium text-primary">{link.project_detail?.name ?? "—"}</span>
                        <span className="truncate text-12 text-tertiary">{link.project_detail?.identifier}</span>
                      </Link>
                    </td>
                    <td className="h-14 px-3 whitespace-nowrap">
                      {lead ? (
                        <span className="inline-flex items-center gap-2 text-primary">
                          <Avatar
                            size="sm"
                            name={lead.display_name}
                            src={getFileURL(lead.avatar_url ?? "")}
                            showTooltip={false}
                          />
                          {lead.display_name}
                        </span>
                      ) : (
                        <span className="text-placeholder">—</span>
                      )}
                    </td>
                    <td className="h-14 px-3 tabular-nums text-primary">{link.requirement_count}</td>
                    <td className="h-14 w-48 px-3">
                      <ProductProjectStatusBar statusCounts={link.status_counts} total={link.requirement_count} />
                    </td>
                    <td className="h-14 px-4 text-right font-semibold tabular-nums text-primary">
                      {link.requirement_count ? `${getCompletionRate(link.status_counts, link.requirement_count)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ProductOverviewCard>
  );
}
