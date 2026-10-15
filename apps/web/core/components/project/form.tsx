/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { differenceInCalendarDays } from "date-fns";
import { Controller, useWatch } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
// plane imports
import type { IProject } from "@plane/types";
import { Input } from "@plane/ui";
import { cn, getDate } from "@plane/utils";
import {
  FORM_VARIANT_STYLES,
  FormFieldShell,
  FormWarningBanner,
  getFormGridClassName,
} from "@/components/common/form-section";
import { TimezoneSelect } from "@/components/global";
// local imports
import {
  ProjectCodeField,
  ProjectDateField,
  ProjectDevModeReadOnlyField,
  ProjectDictionaryField,
  ProjectMemberField,
  ProjectProductTypeField,
  getProjectDateFormatToken,
  getProjectFieldLabelKey,
  useProjectDictionaries,
  validateEndDate,
} from "./form-fields";
import type { TProjectFormFieldKey } from "./form-fields";
import { ProjectDescriptionFormEditor } from "./project-description-form-editor";
import {
  PROJECT_SETTINGS_FORM_ID,
  ProjectSettingsGroup,
  ProjectSettingsIdentity,
  ProjectSettingsSaveBar,
  useProjectSettingsForm,
} from "./settings/general";
import { GeneralProjectSettingsControlSection } from "./settings/control-section";

export interface IProjectDetailsForm {
  project: IProject;
  workspaceSlug: string;
  projectId: string;
}

const VARIANT = "grouped-settings" as const;

/**
 * 项目设置常规页（管理员）：顶部身份区，下面按 基本信息 / 团队 / 排期 / 描述 / 系统 分组，
 * 危险操作区在最后；有改动时底部浮出保存条。非管理员走 ProjectSettingsReadOnly。
 */
export function ProjectDetailsForm(props: IProjectDetailsForm) {
  const { project, workspaceSlug, projectId } = props;
  const { t, currentLocale } = useTranslation();
  // 一次拉全量字典给所属BU / 项目状态 / 项目类型共用
  const dictionaries = useProjectDictionaries(workspaceSlug, true);
  const { form, dirtyCount, isSaving, missingRequiredFields, editorVersion, discard, onSubmit } =
    useProjectSettingsForm({ project, workspaceSlug, projectId });
  const {
    control,
    formState: { errors },
  } = form;
  // derived values
  const styles = FORM_VARIANT_STYLES[VARIANT];
  const grid = getFormGridClassName(VARIANT);
  const base = { control, variant: VARIANT };
  const label = (key: TProjectFormFieldKey) => t(getProjectFieldLabelKey(key));
  const dateToken = getProjectDateFormatToken(currentLocale);
  const startDate = getDate(useWatch({ control, name: "start_date" }));
  const endDate = getDate(useWatch({ control, name: "end_date" }));
  // 起止都填了且没颠倒才算工期，首尾两天都算在内
  const durationDays =
    startDate && endDate && endDate >= startDate ? differenceInCalendarDays(endDate, startDate) + 1 : null;

  return (
    <div>
      <form id={PROJECT_SETTINGS_FORM_ID} onSubmit={onSubmit}>
        {missingRequiredFields.length > 0 && (
          <FormWarningBanner className="mb-6">
            {t("workspace_projects.validation.legacy_incomplete", {
              fields: missingRequiredFields.map((key) => t(getProjectFieldLabelKey(key))).join("、"),
            })}
          </FormWarningBanner>
        )}

        <ProjectSettingsIdentity project={project} control={control} errors={errors} />

        <div className="mt-8">
          <ProjectSettingsGroup title={t("project_settings.general.groups.basics")}>
            <div className={grid}>
              <ProjectCodeField {...base} dictionaries={dictionaries} />
              <ProjectDevModeReadOnlyField
                variant={VARIANT}
                devMode={project.dev_mode_detail}
                workspaceSlug={workspaceSlug}
              />
              <ProjectDictionaryField
                {...base}
                name="project_type"
                required
                dictionaries={dictionaries}
                fallbackItem={project.project_type_detail}
              />
              <ProjectProductTypeField {...base} required />
              <ProjectDictionaryField
                {...base}
                name="business_unit"
                required={false}
                dictionaries={dictionaries}
                fallbackItem={project.business_unit_detail}
              />
              <ProjectDictionaryField
                {...base}
                name="status"
                required
                dictionaries={dictionaries}
                fallbackItem={project.status_detail}
              />
            </div>
          </ProjectSettingsGroup>

          <ProjectSettingsGroup title={t("project_settings.general.groups.team")}>
            <div className={grid}>
              {/* 负责人只能从项目成员里选：后端 PATCH 不会把负责人补成项目成员，权限层却按负责人给全量权限 */}
              <ProjectMemberField {...base} name="project_lead" required projectId={projectId} />
              <ProjectMemberField {...base} name="product_manager" required />
            </div>
          </ProjectSettingsGroup>

          <ProjectSettingsGroup title={t("project_settings.general.groups.schedule")}>
            <div className={cn(grid, "md:grid-cols-3")}>
              <ProjectDateField {...base} name="start_date" required maxDate={endDate} formatToken={dateToken} />
              <ProjectDateField
                {...base}
                name="end_date"
                required
                minDate={startDate}
                validate={validateEndDate(startDate, t)}
                formatToken={dateToken}
              />
              <div className="min-w-0">
                <span className={styles.label}>{t("workspace_projects.fields.duration")}</span>
                <div className={cn(styles.control, "flex items-center")}>
                  {durationDays !== null ? (
                    <span className="inline-flex h-6.5 items-center rounded-md bg-accent-subtle px-2.5 text-13 font-semibold text-accent-primary tabular-nums">
                      {t("workspace_projects.create.duration_days", { count: durationDays })}
                    </span>
                  ) : (
                    <span className="text-14 text-placeholder">—</span>
                  )}
                </div>
              </div>
            </div>
          </ProjectSettingsGroup>

          <ProjectSettingsGroup title={t("project_settings.general.groups.description")}>
            <Controller
              name="description_html"
              control={control}
              render={({ field: { value, onChange } }) => (
                <ProjectDescriptionFormEditor
                  key={editorVersion}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  value={value}
                  onChange={onChange}
                  placeholder={t("project_description_placeholder")}
                  maxHeightClass="max-h-[320px] min-h-[128px]"
                />
              )}
            />
          </ProjectSettingsGroup>

          <ProjectSettingsGroup title={t("project_settings.general.groups.system")}>
            <div className={grid}>
              <FormFieldShell label={label("timezone")} required editable error={errors.timezone?.message} styles={styles}>
                <Controller
                  name="timezone"
                  control={control}
                  rules={{ required: t("project_settings.general.please_select_a_timezone") }}
                  render={({ field: { value, onChange } }) => (
                    <TimezoneSelect
                      value={value}
                      onChange={(next: string) => onChange(next)}
                      error={Boolean(errors.timezone)}
                      buttonClassName={styles.select}
                    />
                  )}
                />
              </FormFieldShell>
              <FormFieldShell
                label={label("pms_project_name")}
                required={false}
                editable
                error={errors.pms_project_name?.message}
                styles={styles}
              >
                <Controller
                  control={control}
                  name="pms_project_name"
                  rules={{
                    maxLength: {
                      value: 255,
                      message: t("workspace_projects.validation.max_length", {
                        field: label("pms_project_name"),
                        max: 255,
                      }),
                    },
                  }}
                  render={({ field: { value, onChange, ref } }) => (
                    <Input
                      id="pms_project_name"
                      name="pms_project_name"
                      type="text"
                      ref={ref}
                      value={value ?? ""}
                      onChange={onChange}
                      hasError={Boolean(errors.pms_project_name)}
                      className={styles.input}
                      placeholder={t("workspace_projects.fields.pms_project_name_placeholder")}
                    />
                  )}
                />
              </FormFieldShell>
            </div>
          </ProjectSettingsGroup>
        </div>
      </form>

      {/* 归档 / 删除带各自的弹窗，放在 <form> 外面，免得弹窗里的按钮触发提交 */}
      <GeneralProjectSettingsControlSection projectId={projectId} />

      {dirtyCount > 0 && <ProjectSettingsSaveBar count={dirtyCount} isSaving={isSaving} onDiscard={discard} />}
    </div>
  );
}
