/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PieChart } from "@plane/propel/charts/pie-chart";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { IUserProfileProjectSegregation } from "@plane/types";
import { Card, ECardVariant, Loader } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";

type Props = {
  userProjectsData: IUserProfileProjectSegregation | undefined;
};

const PROJECT_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

export const ProfileProjectContribution = observer(function ProfileProjectContribution({ userProjectsData }: Props) {
  const { t } = useTranslation();
  const { getProjectById } = useProject();

  if (!userProjectsData) {
    return (
      <div className="flex flex-col space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.contribution.title")}</h3>
        <Loader className="h-[320px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      </div>
    );
  }

  if (!userProjectsData.can_view_project_contributions) return null;

  const projects = userProjectsData.project_data
    .filter((project) => project.completed_issues > 0)
    .sort((a, b) => b.completed_issues - a.completed_issues || a.id.localeCompare(b.id))
    .map((project, index) => ({
      id: project.id,
      key: project.id,
      name: getProjectById(project.id)?.name ?? project.id,
      value: project.completed_issues,
      color: PROJECT_COLORS[index % PROJECT_COLORS.length],
    }));
  const totalCompletedIssues = projects.reduce((total, project) => total + project.value, 0);

  return (
    <div className="flex flex-col space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.contribution.title")}</h3>
      <Card variant={ECardVariant.WITHOUT_SHADOW} className="min-h-[320px]">
        {projects.length > 0 ? (
          <div className="grid min-h-[288px] grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center">
            <div className="relative mx-auto h-[260px] w-full max-w-[320px]">
              <PieChart
                className="size-full"
                dataKey="value"
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                data={projects}
                cells={projects.map((project) => ({ key: project.key, fill: project.color }))}
                showTooltip
                tooltipLabel={t("profile.stats.contribution.tooltip_label")}
                paddingAngle={projects.length > 1 ? 4 : 0}
                cornerRadius={4}
                innerRadius="62%"
                showLabel={false}
                showActiveOuterRing={false}
              />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center">
                  <span className="text-28 leading-none font-semibold text-primary tabular-nums">
                    {totalCompletedIssues}
                  </span>
                  <span className="mt-1.5 text-11 text-placeholder">{t("profile.stats.contribution.total_label")}</span>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <p className="text-13 leading-5 text-secondary">{t("profile.stats.contribution.subtitle")}</p>
              <div className="max-h-[248px] space-y-3 overflow-y-auto pr-1">
                {projects.map((project) => {
                  const percentage = Math.round((project.value / totalCompletedIssues) * 100);

                  return (
                    <div key={project.id} className="flex items-center justify-between gap-4 text-13">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-xs" style={{ backgroundColor: project.color }} />
                        <span className="truncate text-primary">{project.name}</span>
                      </div>
                      <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
                        <span className="font-medium text-secondary">{project.value}</span>
                        <span className="w-9 text-right text-11 text-placeholder">{percentage}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[288px] place-items-center">
            <EmptyStateCompact
              assetKey="project"
              assetClassName="size-20"
              title={t("profile.stats.contribution.empty")}
            />
          </div>
        )}
      </Card>
    </div>
  );
});
