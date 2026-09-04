/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IProject, IWorkspace } from "@plane/types";
import { Input } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import {
  FORM_VARIANT_STYLES,
  FormFieldShell,
  FormWarningBanner,
  getFormGridClassName,
} from "@/components/common/form-section";
import { TimezoneSelect } from "@/components/global";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web types
import type { TProject } from "@/plane-web/types/projects";
// services
import { ProjectService } from "@/services/project";
// local imports
import {
  ProjectLogoField,
  ProjectNetworkField,
  ProjectSharedFields,
  applyProjectServerErrors,
  getMissingProjectRequiredFields,
  getProjectFieldLabelKey,
  normalizeUserId,
  useProjectDictionaries,
} from "./form-fields";
import { ProjectDescriptionFormEditor } from "./project-description-form-editor";

export interface IProjectDetailsForm {
  project: IProject;
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
}
const projectService = new ProjectService();

/** store 里 project_lead 可能是对象（详情接口）也可能是 id（列表接口 / PATCH 响应），进表单前归一 */
const toFormValues = (project: IProject): TProject => ({
  ...project,
  workspace: (project.workspace as IWorkspace).id,
  project_lead: normalizeUserId(project.project_lead),
});

export function ProjectDetailsForm(props: IProjectDetailsForm) {
  const { project, workspaceSlug, projectId, isAdmin } = props;
  const { t } = useTranslation();
  // states
  const [isLoading, setIsLoading] = useState(false);
  // store hooks
  const { updateProject } = useProject();
  const { isMobile } = usePlatformOS();
  // 一次拉全量字典给所属BU / 项目状态 / 项目类型共用；无编辑权限不请求
  const dictionaries = useProjectDictionaries(workspaceSlug, isAdmin);

  // form info
  const {
    handleSubmit,
    control,
    setValue,
    setError,
    reset,
    formState: { errors },
    getValues,
  } = useForm<TProject>({
    defaultValues: toFormValues(project),
  });
  // derived values
  const styles = FORM_VARIANT_STYLES.settings;
  const grid = getFormGridClassName("settings");
  const sectionProps = { control, variant: "settings" as const, disabled: !isAdmin };
  // 0348 之前的存量项目缺必填字段，顶部横幅提示；RHF 的 rules 会在保存时拦截
  const missingRequiredFields = useMemo(() => getMissingProjectRequiredFields(project), [project]);

  useEffect(() => {
    if (project && projectId !== getValues("id")) {
      reset(toFormValues(project));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, projectId]);

  // handlers
  const handleIdentifierChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    const alphanumericValue = value.replace(/[^a-zA-Z0-9]/g, "");
    const formattedValue = alphanumericValue.toUpperCase();
    setValue("identifier", formattedValue);
  };

  const handleUpdateChange = async (payload: Partial<TProject>) => {
    if (!workspaceSlug || !project) return;
    return updateProject(workspaceSlug.toString(), project.id, payload)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("project_settings.general.toast.success"),
        });
      })
      .catch((err) => {
        // 字段级错误（名称 / 项目 ID / 代号重复、字典值无效…）行内展示；其余 toast
        if (applyProjectServerErrors(err ?? {}, setError, t)) return;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: t("something_went_wrong"),
        });
      });
  };

  const onSubmit = async (formData: TProject) => {
    if (!workspaceSlug) return;
    setIsLoading(true);
    const payload: Partial<TProject> = {
      name: formData.name,
      network: formData.network,
      identifier: formData.identifier,
      description_html: formData.description_html ?? "<p></p>",
      logo_props: formData.logo_props,
      timezone: formData.timezone,
      pms_project_name: formData.pms_project_name?.trim() || null,
      // 0348 扩展字段：必填项都挂了 rules，走到这里不会是 null；business_unit 选填允许 null
      code: formData.code?.trim() ?? "",
      business_unit: formData.business_unit ?? null,
      product_manager: normalizeUserId(formData.product_manager),
      status: formData.status ?? null,
      project_type: formData.project_type ?? null,
      product_type: formData.product_type ?? null,
      start_date: formData.start_date ?? null,
      end_date: formData.end_date ?? null,
      project_lead: normalizeUserId(formData.project_lead),
    };

    if (project.identifier !== formData.identifier)
      await projectService
        .checkProjectIdentifierAvailability(workspaceSlug, payload.identifier ?? "")
        .then(async (res) => {
          if (res.exists) setError("identifier", { message: t("common.identifier_already_exists") });
          else await handleUpdateChange(payload);
        });
    else await handleUpdateChange(payload);
    setTimeout(() => {
      setIsLoading(false);
    }, 300);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="mt-8 space-y-8">
        {isAdmin && missingRequiredFields.length > 0 && (
          <FormWarningBanner>
            {t("workspace_projects.validation.legacy_incomplete", {
              fields: missingRequiredFields.map((key) => t(getProjectFieldLabelKey(key))).join("、"),
            })}
          </FormWarningBanner>
        )}

        <div className={grid}>
          <FormFieldShell
            label={t("workspace_projects.fields.name")}
            required
            editable={isAdmin}
            error={errors.name?.message}
            styles={styles}
          >
            <div className="flex items-center gap-2">
              <ProjectLogoField control={control} disabled={!isAdmin} />
              <Controller
                control={control}
                name="name"
                rules={{
                  required: t("name_is_required"),
                  maxLength: {
                    value: 255,
                    message: t("workspace_projects.validation.max_length", {
                      field: t("workspace_projects.fields.name"),
                      max: 255,
                    }),
                  },
                }}
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    ref={ref}
                    value={value}
                    onChange={onChange}
                    hasError={Boolean(errors.name)}
                    className={cn(styles.input, "min-w-0 flex-1 font-medium")}
                    placeholder={t("common.project_name")}
                    disabled={!isAdmin}
                  />
                )}
              />
            </div>
          </FormFieldShell>
          <FormFieldShell
            label={t("workspace_projects.fields.identifier")}
            required
            editable={isAdmin}
            error={errors.identifier?.message}
            styles={styles}
          >
            <div className="relative">
              <Controller
                control={control}
                name="identifier"
                rules={{
                  required: t("project_id_is_required"),
                  validate: (value) =>
                    /^[ÇŞĞIİÖÜA-Z0-9]+$/.test(value.toUpperCase()) || t("project_id_allowed_char"),
                  minLength: {
                    value: 1,
                    message: t("project_id_min_char"),
                  },
                  maxLength: {
                    value: 10,
                    message: t("project_id_max_char"),
                  },
                }}
                render={({ field: { value, ref } }) => (
                  <Input
                    id="identifier"
                    name="identifier"
                    type="text"
                    value={value}
                    onChange={handleIdentifierChange}
                    ref={ref}
                    hasError={Boolean(errors.identifier)}
                    placeholder={t("project_settings.general.enter_project_id")}
                    className={cn(styles.input, "pr-8 font-medium")}
                    disabled={!isAdmin}
                  />
                )}
              />
              <Tooltip
                isMobile={isMobile}
                tooltipContent={t("project_id_tooltip_content")}
                className="text-13"
                position="right-start"
              >
                <Info className="absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-placeholder" />
              </Tooltip>
            </div>
          </FormFieldShell>
          <ProjectSharedFields {...sectionProps} dictionaries={dictionaries} project={project} projectId={projectId} />
          <FormFieldShell
            className="md:col-span-2"
            label={t("workspace_projects.fields.description")}
            required={false}
            editable={isAdmin}
            styles={styles}
          >
            <Controller
              name="description_html"
              control={control}
              render={({ field: { value, onChange } }) => (
                <ProjectDescriptionFormEditor
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  value={value}
                  onChange={onChange}
                  disabled={!isAdmin}
                  placeholder={t("project_description_placeholder")}
                />
              )}
            />
          </FormFieldShell>
          <ProjectNetworkField {...sectionProps} />
          <FormFieldShell
            label={t("workspace_projects.fields.pms_project_name")}
            required={false}
            editable={isAdmin}
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
                    field: t("workspace_projects.fields.pms_project_name"),
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
                  placeholder={t("workspace_projects.fields.pms_project_name")}
                  disabled={!isAdmin}
                />
              )}
            />
          </FormFieldShell>
          <FormFieldShell
            label={t("workspace_projects.fields.timezone")}
            required
            editable={isAdmin}
            error={errors.timezone?.message}
            styles={styles}
          >
            <Controller
              name="timezone"
              control={control}
              rules={{ required: t("project_settings.general.please_select_a_timezone") }}
              render={({ field: { value, onChange } }) => (
                <TimezoneSelect
                  value={value}
                  onChange={(value: string) => {
                    onChange(value);
                  }}
                  error={Boolean(errors.timezone)}
                  buttonClassName={styles.select}
                  disabled={!isAdmin}
                />
              )}
            />
          </FormFieldShell>
        </div>

        <div className="flex items-center justify-between py-2">
          <>
            <Button variant="primary" size="lg" type="submit" loading={isLoading} disabled={!isAdmin}>
              {isLoading ? t("updating") : t("common.update_project")}
            </Button>
            <span className="text-13 text-placeholder italic">
              {t("common.created_on")} {renderFormattedDate(project?.created_at)}
            </span>
          </>
        </div>
      </div>
    </form>
  );
}
