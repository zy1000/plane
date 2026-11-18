import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import type { TProductRelease } from "@plane/types";
import { Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { getReleaseStatusDetails } from "@/components/releases/release-status-config";
import { ProductOverviewCard, ProductOverviewCardEmpty, ProductOverviewCardLink } from "./overview-card";

/** 概览只列最近几张发布单（接口按创建时间倒序） */
const MAX_ROWS = 3;

type TProps = {
  workspaceSlug: string;
  releases: TProductRelease[];
  isLoading: boolean;
  releasesPath: string;
};

/** 发布：关联项目下最近的发布单，口径同产品「发布」页签（默认不筛） */
export function ProductOverviewReleasesCard({ workspaceSlug, releases, isLoading, releasesPath }: TProps) {
  const { t } = useTranslation();
  const rows = releases.slice(0, MAX_ROWS);

  return (
    <ProductOverviewCard
      title={t("workspace_products.overview.releases.title")}
      count={isLoading ? null : releases.length}
      className="flex-[1_1_300px]"
      action={
        releases.length > 0 && (
          <ProductOverviewCardLink to={releasesPath}>{t("workspace_products.overview.releases.all")}</ProductOverviewCardLink>
        )
      }
    >
      {isLoading ? (
        <Loader className="space-y-2 p-4">
          <Loader.Item height="40px" />
          <Loader.Item height="40px" />
        </Loader>
      ) : rows.length === 0 ? (
        <ProductOverviewCardEmpty className="min-h-36">{t("workspace_products.overview.releases.empty")}</ProductOverviewCardEmpty>
      ) : (
        <div>
          {rows.map((release) => {
            const status = getReleaseStatusDetails(release.status);
            return (
              <Link
                key={release.id}
                to={`/${workspaceSlug}/projects/${release.project_id}/releases/${release.id}/overview`}
                className="flex h-14 items-center gap-3 border-b border-subtle px-4 transition-colors last:border-b-0 hover:bg-layer-1"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-13 font-medium text-primary">{release.name}</span>
                  <span className="truncate text-12 text-tertiary">{release.project_detail?.name}</span>
                </span>
                <span
                  className={`inline-flex h-5.5 shrink-0 items-center rounded-md px-2 text-12 font-medium ${status.bgColor} ${status.textColor}`}
                >
                  {status.label}
                </span>
                <span className="w-12 shrink-0 text-right text-12 text-tertiary tabular-nums">
                  {renderFormattedDate(release.target_date, "MM-dd") ?? "—"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </ProductOverviewCard>
  );
}
