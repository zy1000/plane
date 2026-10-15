/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { differenceInCalendarDays } from "date-fns";
import { observer } from "mobx-react";
import { CalendarDays, Clock3, Hash } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IProject, IUserLite } from "@plane/types";
import { cn, getDate, renderFormattedDate } from "@plane/utils";
// components
import { ReadonlyPeopleValue } from "@/components/common/form-modal";
import {
  DevModeValue,
  getProjectDateFormatToken,
  getProjectFieldLabelKey,
  normalizeUserId,
} from "@/components/project/form-fields";
import type { TProjectFormFieldKey } from "@/components/project/form-fields";
import { ProjectDescriptionFormEditor } from "@/components/project/project-description-form-editor";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local imports
import { ProjectSettingsGroup } from "./field-group";
import { ProjectSettingsIdentityReadOnly } from "./identity";

type Props = {
  project: IProject;
  workspaceSlug: string;
  projectId: string;
};

const GRID_CLASS = "grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2";

/** 只读的一格：字段名 + 一行取值，不画输入框，底部一条细线 */
function ReadOnlyField(props: { label: string; children: ReactNode; className?: string }) {
  const { label, children, className } = props;
  return (
    <div className={cn("min-w-0", className)}>
      <span className="mb-1 block text-13 leading-5 font-medium text-secondary">{label}</span>
      <div className="flex h-10.5 min-w-0 items-center gap-2 border-b border-subtle text-14 text-primary">{children}</div>
    </div>
  );
}

const Text = ({ value }: { value: string | null | undefined }) =>
  value ? <span className="truncate">{value}</span> : <span className="text-placeholder">—</span>;

/**
 * 非管理员看到的项目设置常规页：同一套分组，取值只读，没有保存条和危险操作区。
 */
export const ProjectSettingsReadOnly = observer(function ProjectSettingsReadOnly(props: Props) {
  const { project, workspaceSlug, projectId } = props;
  const { t, currentLocale } = useTranslation();
  const { getUserDetails } = useMember();

  const label = (key: TProjectFormFieldKey) => t(getProjectFieldLabelKey(key));
  const dateToken = getProjectDateFormatToken(currentLocale);
  const usersOf = (id: string | null | undefined): IUserLite[] => {
    const user = id ? getUserDetails(id) : undefined;
    return user ? [user] : [];
  };

  const startDate = getDate(project.start_date);
  const endDate = getDate(project.end_date);
  const durationDays =
    startDate && endDate && endDate >= startDate ? differenceInCalendarDays(endDate, startDate) + 1 : null;

  return (
    <div>
      <ProjectSettingsIdentityReadOnly project={project} />
      <div className="mt-8">
        <ProjectSettingsGroup title={t("project_settings.general.groups.basics")}>
          <div className={GRID_CLASS}>
            <ReadOnlyField label={label("code")}>
              <Hash className="size-4 shrink-0 text-placeholder" aria-hidden="true" />
              <Text value={project.code} />
            </ReadOnlyField>
            <ReadOnlyField label={label("dev_mode")}>
              <DevModeValue devMode={project.dev_mode_detail} />
            </ReadOnlyField>
            <ReadOnlyField label={label("project_type")}>
              <Text value={project.project_type_detail?.label} />
            </ReadOnlyField>
            <ReadOnlyField label={label("product_type")}>
              <Text value={project.product_type} />
            </ReadOnlyField>
            <ReadOnlyField label={label("business_unit")}>
              <Text value={project.business_unit_detail?.label} />
            </ReadOnlyField>
            <ReadOnlyField label={label("status")}>
              <Text value={project.status_detail?.label} />
            </ReadOnlyField>
          </div>
        </ProjectSettingsGroup>

        <ProjectSettingsGroup title={t("project_settings.general.groups.team")}>
          <div className={GRID_CLASS}>
            <ReadOnlyField label={label("project_lead")}>
              <ReadonlyPeopleValue users={usersOf(normalizeUserId(project.project_lead))} />
            </ReadOnlyField>
            <ReadOnlyField label={label("product_manager")}>
              <ReadonlyPeopleValue users={usersOf(project.product_manager)} />
            </ReadOnlyField>
          </div>
        </ProjectSettingsGroup>

        <ProjectSettingsGroup title={t("project_settings.general.groups.schedule")}>
          <div className={cn(GRID_CLASS, "md:grid-cols-3")}>
            <ReadOnlyField label={label("start_date")}>
              <CalendarDays className="size-4 shrink-0 text-placeholder" aria-hidden="true" />
              <Text value={renderFormattedDate(project.start_date, dateToken)} />
            </ReadOnlyField>
            <ReadOnlyField label={label("end_date")}>
              <CalendarDays className="size-4 shrink-0 text-placeholder" aria-hidden="true" />
              <Text value={renderFormattedDate(project.end_date, dateToken)} />
            </ReadOnlyField>
            <ReadOnlyField label={t("workspace_projects.fields.duration")}>
              {durationDays !== null ? (
                <span className="inline-flex h-6.5 items-center rounded-md bg-accent-subtle px-2.5 text-13 font-semibold text-accent-primary tabular-nums">
                  {t("workspace_projects.create.duration_days", { count: durationDays })}
                </span>
              ) : (
                <span className="text-placeholder">—</span>
              )}
            </ReadOnlyField>
          </div>
        </ProjectSettingsGroup>

        <ProjectSettingsGroup title={t("project_settings.general.groups.description")}>
          <ProjectDescriptionFormEditor
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            value={project.description_html}
            onChange={() => {}}
            disabled
            placeholder=""
          />
        </ProjectSettingsGroup>

        <ProjectSettingsGroup title={t("project_settings.general.groups.system")}>
          <div className={GRID_CLASS}>
            <ReadOnlyField label={label("timezone")}>
              <Clock3 className="size-4 shrink-0 text-placeholder" aria-hidden="true" />
              <Text value={project.timezone} />
            </ReadOnlyField>
            <ReadOnlyField label={label("pms_project_name")}>
              <Text value={project.pms_project_name} />
            </ReadOnlyField>
          </div>
        </ProjectSettingsGroup>
      </div>
    </div>
  );
});
