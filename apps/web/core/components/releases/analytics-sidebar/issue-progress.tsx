/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { AlertCircle } from "lucide-react";
import { Disclosure, Transition } from "@headlessui/react";
import { EEstimateSystem } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ChevronUpIcon, ChevronDownIcon } from "@plane/propel/icons";
import type { TModuleDistribution, TModuleEstimateDistribution, TReleasePlotType } from "@plane/types";
import { CustomSelect, Spinner } from "@plane/ui";
import { getDate } from "@plane/utils";
import ProgressChart from "@/components/core/sidebar/progress-chart";
import { ModuleProgressStats } from "@/components/modules";
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useRelease } from "@/hooks/store/use-release";

type TReleaseAnalyticsProgress = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
};

const releaseBurnDownChartOptions = [
  { value: "burndown", i18n_label: "issues" },
  { value: "points", i18n_label: "points" },
] as const;

export const ReleaseAnalyticsProgress = observer(function ReleaseAnalyticsProgress(props: TReleaseAnalyticsProgress) {
  const { workspaceSlug, projectId, releaseId } = props;
  const { t } = useTranslation();
  const { areEstimateEnabledByProjectId, currentActiveEstimateId, estimateById } = useProjectEstimates();
  const { getPlotTypeByReleaseId, setPlotType, getReleaseById, fetchReleaseDetails, fetchArchivedReleaseDetails } =
    useRelease();
  const [loader, setLoader] = useState(false);

  const releaseDetails = getReleaseById(releaseId);
  const plotType: TReleasePlotType = getPlotTypeByReleaseId(releaseId);
  const isCurrentProjectEstimateEnabled = projectId && areEstimateEnabledByProjectId(projectId) ? true : false;
  const estimateDetails =
    isCurrentProjectEstimateEnabled && currentActiveEstimateId && estimateById(currentActiveEstimateId);
  const isCurrentEstimateTypeIsPoints = estimateDetails && estimateDetails?.type === EEstimateSystem.POINTS;
  const completedIssues = releaseDetails?.completed_issues || 0;
  const totalIssues = releaseDetails?.total_issues || 0;
  const completedEstimatePoints = releaseDetails?.completed_estimate_points || 0;
  const totalEstimatePoints = releaseDetails?.total_estimate_points || 0;
  const progressHeaderPercentage = releaseDetails
    ? plotType === "points"
      ? completedEstimatePoints != 0 && totalEstimatePoints != 0
        ? Math.round((completedEstimatePoints / totalEstimatePoints) * 100)
        : 0
      : completedIssues != 0 && totalIssues != 0
        ? Math.round((completedIssues / totalIssues) * 100)
        : 0
    : 0;
  const chartDistributionData =
    plotType === "points" ? releaseDetails?.estimate_distribution : releaseDetails?.distribution || undefined;
  const completionChartDistributionData = chartDistributionData?.completion_chart || undefined;
  const groupedIssues = useMemo(
    () => ({
      backlog: plotType === "points" ? releaseDetails?.backlog_estimate_points || 0 : releaseDetails?.backlog_issues || 0,
      unstarted:
        plotType === "points" ? releaseDetails?.unstarted_estimate_points || 0 : releaseDetails?.unstarted_issues || 0,
      started: plotType === "points" ? releaseDetails?.started_estimate_points || 0 : releaseDetails?.started_issues || 0,
      completed:
        plotType === "points" ? releaseDetails?.completed_estimate_points || 0 : releaseDetails?.completed_issues || 0,
      cancelled:
        plotType === "points" ? releaseDetails?.cancelled_estimate_points || 0 : releaseDetails?.cancelled_issues || 0,
    }),
    [plotType, releaseDetails]
  );
  const releaseStartDate = getDate(releaseDetails?.start_date);
  const releaseEndDate = getDate(releaseDetails?.target_date);
  const isReleaseStartDateValid = releaseStartDate && releaseStartDate <= new Date();
  const isReleaseEndDateValid = releaseStartDate && releaseEndDate && releaseEndDate >= releaseStartDate;
  const isReleaseDateValid = isReleaseStartDateValid && isReleaseEndDateValid;
  const isArchived = !!releaseDetails?.archived_at;

  const onChange = async (value: TReleasePlotType) => {
    setPlotType(releaseId, value);
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setLoader(true);
      if (isArchived) {
        await fetchArchivedReleaseDetails(workspaceSlug, projectId, releaseId);
      } else {
        await fetchReleaseDetails(workspaceSlug, projectId, releaseId);
      }
      setLoader(false);
    } catch (_error) {
      setLoader(false);
      setPlotType(releaseId, plotType);
    }
  };

  if (!releaseDetails) return <></>;

  const distributionForStats = chartDistributionData as TModuleDistribution | TModuleEstimateDistribution | undefined;

  return (
    <div className="space-y-4 border-t border-subtle px-3 py-4">
      <Disclosure defaultOpen={isReleaseDateValid ? true : false}>
        {({ open }) => (
          <div className="space-y-6">
            {isReleaseDateValid ? (
              <div className="relative flex w-full items-center justify-between gap-2">
                <Disclosure.Button className="relative flex w-full items-center gap-2">
                  <div className="text-13 font-medium text-secondary">{t("progress")}</div>
                  {progressHeaderPercentage > 0 && (
                    <div className="bg-amber-500/20 text-amber-500 flex h-5 w-9 items-center justify-center rounded-sm text-11 font-medium">{`${progressHeaderPercentage}%`}</div>
                  )}
                </Disclosure.Button>
                {isCurrentEstimateTypeIsPoints && (
                  <>
                    <div>
                      <CustomSelect
                        value={plotType}
                        label={
                          <span>
                            {t(releaseBurnDownChartOptions.find((v) => v.value === plotType)?.i18n_label || "none")}
                          </span>
                        }
                        onChange={onChange}
                        maxHeight="lg"
                      >
                        {releaseBurnDownChartOptions.map((item) => (
                          <CustomSelect.Option key={item.value} value={item.value}>
                            {t(item.i18n_label)}
                          </CustomSelect.Option>
                        ))}
                      </CustomSelect>
                    </div>
                    {loader && <Spinner className="h-3 w-3" />}
                  </>
                )}
                <Disclosure.Button className="ml-auto">
                  {open ? (
                    <ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>
            ) : (
              <div className="relative flex w-full items-center justify-between gap-2">
                <div className="text-13 font-medium text-secondary">Progress</div>
                <div className="flex items-center gap-1">
                  <AlertCircle height={14} width={14} className="text-secondary" />
                  <span className="text-11 text-secondary italic">
                    {releaseDetails?.start_date && releaseDetails?.target_date
                      ? t("project_module.empty_state.sidebar.in_active")
                      : t("project_module.empty_state.sidebar.invalid_date")}
                  </span>
                </div>
              </div>
            )}

            <Transition show={open}>
              <Disclosure.Panel className="space-y-4">
                <div>
                  {releaseStartDate && releaseEndDate && completionChartDistributionData && (
                    <Fragment>
                      {plotType === "points" ? (
                        <ProgressChart
                          distribution={completionChartDistributionData}
                          totalIssues={totalEstimatePoints}
                          plotTitle={"points"}
                        />
                      ) : (
                        <ProgressChart
                          distribution={completionChartDistributionData}
                          totalIssues={totalIssues}
                          plotTitle={"work items"}
                        />
                      )}
                    </Fragment>
                  )}
                </div>

                {chartDistributionData && (
                  <div className="w-full border-t border-subtle pt-5">
                    <ModuleProgressStats
                      distribution={distributionForStats}
                      groupedIssues={groupedIssues}
                      handleFiltersUpdate={() => {}}
                      isEditable={false}
                      moduleId={releaseId}
                      noBackground={false}
                      plotType={plotType}
                      roundedTab={false}
                      selectedFilters={{
                        assignees: undefined,
                        labels: undefined,
                        stateGroups: undefined,
                      }}
                      size="xs"
                      totalIssuesCount={plotType === "points" ? totalEstimatePoints || 0 : totalIssues || 0}
                    />
                  </div>
                )}
              </Disclosure.Panel>
            </Transition>
          </div>
        )}
      </Disclosure>
    </div>
  );
});
