/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Info } from "lucide-react";
import { NETWORK_CHOICES, PROJECT_PRODUCT_TYPE_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// plane imports
import { Button } from "@plane/propel/button";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { LockIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { EFileAssetType } from "@plane/types";
import type { IProject, IWorkspace, TProjectProductType } from "@plane/types";
import { CustomSelect, Input } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { CoverImage } from "@/components/common/cover-image";
import { ImagePickerPopover } from "@/components/core/image-picker-popover";
import { TimezoneSelect } from "@/components/global";
// helpers
import { handleCoverImageChange } from "@/helpers/cover-image.helper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { usePlatformOS } from "@/hooks/use-platform-os";
// services
import { ProjectService } from "@/services/project";
// local imports
import { ProjectNetworkIcon } from "./project-network-icon";
import { ProjectDescriptionFormEditor } from "./project-description-form-editor";

export interface IProjectDetailsForm {
  project: IProject;
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
}
const projectService = new ProjectService();

export function ProjectDetailsForm(props: IProjectDetailsForm) {
  const { project, workspaceSlug, projectId, isAdmin } = props;
  const { t } = useTranslation();
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // store hooks
  const { updateProject } = useProject();
  const { isMobile } = usePlatformOS();

  // form info
  const {
    handleSubmit,
    watch,
    control,
    setValue,
    setError,
    reset,
    formState: { errors },
    getValues,
  } = useForm<IProject>({
    defaultValues: {
      ...project,
      workspace: (project.workspace as IWorkspace).id,
    },
  });
  // derived values
  const currentNetwork = NETWORK_CHOICES.find((n) => n.key === project?.network);
  const coverImage = watch("cover_image_url");

  useEffect(() => {
    if (project && projectId !== getValues("id")) {
      reset({
        ...project,
        workspace: (project.workspace as IWorkspace).id,
      });
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

  const handleUpdateChange = async (payload: Partial<IProject>) => {
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
        try {
          // Handle the new error format where codes are nested in arrays under field names
          const errorData = err ?? {};

          const nameError = errorData.name?.includes("PROJECT_NAME_ALREADY_EXIST");
          const identifierError = errorData?.identifier?.includes("PROJECT_IDENTIFIER_ALREADY_EXIST");

          if (nameError || identifierError) {
            if (nameError) {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: t("toast.error"),
                message: t("project_name_already_taken"),
              });
            }

            if (identifierError) {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: t("toast.error"),
                message: t("project_identifier_already_taken"),
              });
            }
          } else {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: t("toast.error"),
              message: t("something_went_wrong"),
            });
          }
        } catch (error) {
          // Fallback error handling if the error processing fails
          console.error("Error processing API error:", error);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: t("something_went_wrong"),
          });
        }
      });
  };

  const onSubmit = async (formData: IProject) => {
    if (!workspaceSlug) return;
    setIsLoading(true);
    const payload: Partial<IProject> = {
      name: formData.name,
      network: formData.network,
      identifier: formData.identifier,
      description_html: formData.description_html ?? "<p></p>",
      logo_props: formData.logo_props,
      timezone: formData.timezone,
      pms_project_name: formData.pms_project_name?.trim() || null,
      estimated_hours: formData.estimated_hours,
      product_type: formData.product_type ?? null,
    };

    // Handle cover image changes
    try {
      const coverImagePayload = await handleCoverImageChange(project.cover_image_url, formData.cover_image_url, {
        workspaceSlug: workspaceSlug.toString(),
        entityIdentifier: project.id,
        entityType: EFileAssetType.PROJECT_COVER,
        isUserAsset: false,
      });

      if (coverImagePayload) {
        Object.assign(payload, coverImagePayload);
      }
    } catch (error) {
      console.error("Error handling cover image:", error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error instanceof Error ? error.message : "Failed to process cover image",
      });
      setIsLoading(false);
      return;
    }

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
      <div className="relative h-44 w-full">
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <CoverImage src={coverImage} alt="Project cover image" className="h-44 w-full rounded-md" />
        <div className="absolute bottom-4 z-5 flex w-full items-end justify-between gap-3 px-4">
          <div className="flex flex-grow gap-3 truncate">
            <Controller
              control={control}
              name="logo_props"
              render={({ field: { value, onChange } }) => (
                <EmojiPicker
                  iconType="material"
                  closeOnSelect={false}
                  isOpen={isOpen}
                  handleToggle={(val: boolean) => setIsOpen(val)}
                  className="flex items-center justify-center"
                  buttonClassName="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-lg bg-white/10"
                  label={<Logo logo={value} size={28} />}
                  // TODO: fix types
                  onChange={(val: any) => {
                    let logoValue = {};

                    if (val?.type === "emoji")
                      logoValue = {
                        value: val.value,
                      };
                    else if (val?.type === "icon") logoValue = val.value;

                    onChange({
                      in_use: val?.type,
                      [val?.type]: logoValue,
                    });
                    setIsOpen(false);
                  }}
                  defaultIconColor={value?.in_use && value.in_use === "icon" ? value?.icon?.color : undefined}
                  defaultOpen={
                    value.in_use && value.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON
                  }
                  disabled={!isAdmin}
                />
              )}
            />
            <div className="flex flex-col gap-1 truncate text-on-color">
              <span className="truncate text-16 font-semibold">{watch("name")}</span>
              <span className="flex items-center gap-2 text-13">
                <span>{watch("identifier")} .</span>
                <span className="flex items-center gap-1.5">
                  {project.network === 0 && <LockIcon className="h-2.5 w-2.5 text-on-color" />}
                  {currentNetwork && t(currentNetwork?.i18n_label)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-shrink-0 justify-center">
            <div>
              <Controller
                control={control}
                name="cover_image_url"
                render={({ field: { value, onChange } }) => (
                  <ImagePickerPopover
                    label={t("change_cover")}
                    control={control}
                    onChange={onChange}
                    value={value ?? null}
                    disabled={!isAdmin}
                    projectId={project.id}
                  />
                )}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h4 className="text-13">{t("common.project_name")}</h4>
          <Controller
            control={control}
            name="name"
            rules={{
              required: t("name_is_required"),
              maxLength: {
                value: 255,
                message: "Project name should be less than 255 characters",
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
                className="rounded-md !p-3 font-medium"
                placeholder={t("common.project_name")}
                disabled={!isAdmin}
              />
            )}
          />
          <span className="text-11 text-danger-primary">{errors?.name?.message}</span>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-13">项目描述</h4>
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
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <h4 className="text-13">Project ID</h4>
            <div className="relative">
              <Controller
                control={control}
                name="identifier"
                rules={{
                  required: t("project_id_is_required"),
                  validate: (value) => /^[ÇŞĞIİÖÜA-Z0-9]+$/.test(value.toUpperCase()) || t("project_id_allowed_char"),
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
                    className="w-full font-medium"
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
                <Info className="absolute top-2.5 right-2 h-4 w-4 text-placeholder" />
              </Tooltip>
            </div>
            <span className="text-11 text-danger-primary">
              <>{errors?.identifier?.message}</>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-13">{t("workspace_projects.network.label")}</h4>
            <Controller
              name="network"
              control={control}
              render={({ field: { value, onChange } }) => {
                const selectedNetwork = NETWORK_CHOICES.find((n) => n.key === value);
                return (
                  <CustomSelect
                    value={value}
                    onChange={onChange}
                    label={
                      <div className="flex items-center gap-1">
                        {selectedNetwork ? (
                          <>
                            <ProjectNetworkIcon iconKey={selectedNetwork.iconKey} className="h-3.5 w-3.5" />
                            {t(selectedNetwork.i18n_label)}
                          </>
                        ) : (
                          <span className="text-placeholder">{t("select_network")}</span>
                        )}
                      </div>
                    }
                    buttonClassName="!border-subtle !shadow-none font-medium rounded-md"
                    input
                    disabled={!isAdmin}
                    // optionsClassName="w-full"
                  >
                    {NETWORK_CHOICES.map((network) => (
                      <CustomSelect.Option key={network.key} value={network.key}>
                        <div className="flex items-start gap-2">
                          <ProjectNetworkIcon iconKey={network.iconKey} className="h-3.5 w-3.5" />
                          <div className="-mt-1">
                            <p>{t(network.i18n_label)}</p>
                            <p className="text-11 text-placeholder">{t(network.description)}</p>
                          </div>
                        </div>
                      </CustomSelect.Option>
                    ))}
                  </CustomSelect>
                );
              }}
            />
          </div>
          <div className="flex flex-col gap-1 self-start">
            <h4 className="text-13">产品类型</h4>
            <Controller
              name="product_type"
              control={control}
              render={({ field: { value, onChange } }) => (
                <CustomSelect
                  value={value ?? ""}
                  onChange={(val: string) => {
                    onChange(val === "" ? null : (val as TProjectProductType));
                  }}
                  label={
                    value ? (
                      <span>{value}</span>
                    ) : (
                      <span className="text-placeholder">请选择产品类型</span>
                    )
                  }
                  buttonClassName="!border-subtle !shadow-none font-medium rounded-md"
                  input
                  disabled={!isAdmin}
                >
                  <CustomSelect.Option value="">未设置</CustomSelect.Option>
                  {PROJECT_PRODUCT_TYPE_OPTIONS.map((option) => (
                    <CustomSelect.Option key={option} value={option}>
                      {option}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            />
          </div>
          <div className="col-span-1 flex flex-col gap-1">
            <h4 className="text-13">{t("common.project_timezone")}</h4>
            <Controller
              name="timezone"
              control={control}
              rules={{ required: t("project_settings.general.please_select_a_timezone") }}
              render={({ field: { value, onChange } }) => (
                <>
                  <TimezoneSelect
                    value={value}
                    onChange={(value: string) => {
                      onChange(value);
                    }}
                    error={Boolean(errors.timezone)}
                    disabled={!isAdmin}
                  />
                </>
              )}
            />
            {errors.timezone && <span className="text-11 text-danger-primary">{errors.timezone.message}</span>}
          </div>
          <div className="col-span-1 flex flex-col gap-1">
            <h4 className="text-13">PMS项目名称</h4>
            <Controller
              control={control}
              name="pms_project_name"
              rules={{
                maxLength: {
                  value: 255,
                  message: "PMS项目名称不能超过 255 个字符",
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
                  className="font-medium"
                  placeholder="PMS项目名称"
                  disabled={!isAdmin}
                />
              )}
            />
            {errors.pms_project_name && (
              <span className="text-11 text-danger-primary">{errors.pms_project_name.message}</span>
            )}
          </div>
          <div className="col-span-1 flex flex-col gap-1">
            <h4 className="text-13">{t("common.project_estimated_hours")}</h4>
            <Controller
              name="estimated_hours"
              control={control}
              rules={{
                min: { value: 0, message: t("project_settings.general.estimated_hours_min") },
                validate: (v) => {
                  if (v === null || v === undefined || v === "") return true;
                  const n = Number(v);
                  if (!Number.isFinite(n)) return t("project_settings.general.estimated_hours_invalid");
                  if (Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) {
                    return t("project_settings.general.estimated_hours_half_step");
                  }
                  return true;
                },
              }}
              render={({ field: { value, onChange, ref } }) => (
                <Input
                  id="estimated_hours"
                  name="estimated_hours"
                  type="number"
                  ref={ref}
                  value={value ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange(v === "" ? null : Number(v));
                  }}
                  min={0}
                  step={0.5}
                  hasError={Boolean(errors.estimated_hours)}
                  className="font-medium"
                  placeholder={t("common.project_estimated_hours_placeholder")}
                  disabled={!isAdmin}
                />
              )}
            />
            {errors.estimated_hours && (
              <span className="text-11 text-danger-primary">{errors.estimated_hours.message}</span>
            )}
          </div>
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
