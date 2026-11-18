import { useTranslation } from "@plane/i18n";
import type { TProductOverviewRequirements, TProductOverviewTest } from "@plane/types";
import { Loader } from "@plane/ui";
import { ProductOverviewCard, ProductOverviewCardLink } from "./overview-card";

type TProps = {
  test: TProductOverviewTest | undefined;
  /** 覆盖率跟着需求块走：没权限看需求时为 null */
  coverage: TProductOverviewRequirements["coverage"] | null | undefined;
  isLoading: boolean;
  testhubPath: string;
};

function Stat({ label, value }: { label: string; value: number | null | undefined }) {
  const hasValue = typeof value === "number";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="truncate text-12 text-tertiary">{label}</span>
      <span
        className={`text-20 leading-tight font-semibold tabular-nums ${hasValue && value > 0 ? "text-primary" : "text-placeholder"}`}
      >
        {hasValue ? value : "—"}
      </span>
    </div>
  );
}

/** 测试：只放几个数（用例 / 用例库 / 进行中的用例评审）+ 需求覆盖率，明细进「测试」页签 */
export function ProductOverviewTestCard({ test, coverage, isLoading, testhubPath }: TProps) {
  const { t } = useTranslation();
  const coverageTotal = coverage?.total ?? 0;
  const coverageRate = coverage && coverageTotal > 0 ? Math.round((coverage.covered_count / coverageTotal) * 100) : null;

  return (
    <ProductOverviewCard
      title={t("workspace_products.overview.test.title")}
      className="flex-[1_1_300px]"
      action={<ProductOverviewCardLink to={testhubPath}>{t("workspace_products.overview.test.enter")}</ProductOverviewCardLink>}
    >
      {isLoading ? (
        <Loader className="p-5">
          <Loader.Item height="104px" />
        </Loader>
      ) : (
        <div className="px-5 py-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t("workspace_products.overview.test.cases")} value={test?.case_count} />
            <Stat label={t("workspace_products.overview.test.repositories")} value={test?.repository_count} />
            <Stat label={t("workspace_products.overview.test.active_reviews")} value={test?.active_review_count} />
          </div>
          <div className="mt-5 flex flex-col gap-2 border-t border-subtle pt-4">
            <div className="flex items-baseline justify-between gap-3 text-12 text-secondary">
              <span>{t("workspace_products.overview.test.coverage")}</span>
              {coverageRate === null ? (
                <span className="text-placeholder">—</span>
              ) : (
                <span>
                  <span className="font-semibold tabular-nums text-primary">{coverageRate}%</span>
                  <span className="text-tertiary">
                    {" · "}
                    {t("workspace_products.overview.test.coverage_meta", {
                      covered: coverage?.covered_count ?? 0,
                      total: coverageTotal,
                    })}
                  </span>
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-layer-2">
              {coverageRate !== null && coverageRate > 0 && (
                <div className="h-full rounded-full bg-accent-primary" style={{ width: `${coverageRate}%` }} />
              )}
            </div>
          </div>
        </div>
      )}
    </ProductOverviewCard>
  );
}
