/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { FormProvider, useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType } from "@plane/types";
// components
import ProjectCommonAttributes from "@/components/project/create/common-attributes";
import ProjectCreateHeader from "@/components/project/create/header";
import ProjectCreateButtons from "@/components/project/create/project-create-buttons";
import { applyProjectServerErrors, useProjectDictionaries } from "@/components/project/form-fields";
// hooks
import { getCoverImageType, uploadCoverImage } from "@/helpers/cover-image.helper";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web types
import type { TProject } from "@/plane-web/types/projects";
import { ProjectAttributes } from "./attributes";
import { getProjectFormValues } from "./utils";

export type TCreateProjectFormProps = {
  setToFavorite?: boolean;
  workspaceSlug: string;
  onClose: () => void;
  handleNextStep: (projectId: string) => void;
  data?: Partial<TProject>;
  templateId?: string;
  updateCoverImageStatus: (projectId: string, coverImage: string) => Promise<void>;
};

export const CreateProjectForm = observer(function CreateProjectForm(props: TCreateProjectFormProps) {
  const { setToFavorite, workspaceSlug, data, onClose, handleNextStep, updateCoverImageStatus } = props;
  // store
  const { t } = useTranslation();
  const { addProjectToFavorites, createProject, updateProject } = useProject();
  const { data: currentUser } = useUser();
  const currentUserId = currentUser?.id ?? null;
  const projectLeadId =
    typeof data?.project_lead === "string" ? data.project_lead : (data?.project_lead?.id ?? currentUserId);
  // states
  const [shouldAutoSyncIdentifier, setShouldAutoSyncIdentifier] = useState(true);
  const defaultValues = {
    ...getProjectFormValues(projectLeadId),
    ...data,
    project_lead: projectLeadId,
  };
  // form info
  const methods = useForm<TProject>({
    defaultValues,
    reValidateMode: "onChange",
  });
  const { getValues, handleSubmit, reset, setValue, setError } = methods;
  const { isMobile } = usePlatformOS();
  // 一次拉全量字典给所属BU / 项目状态 / 项目类型三个下拉共用
  const dictionaries = useProjectDictionaries(workspaceSlug);

  useEffect(() => {
    if (!currentUserId || getValues("project_lead")) return;
    setValue("project_lead", currentUserId, { shouldValidate: true });
  }, [currentUserId, getValues, setValue]);

  const handleAddToFavorites = (projectId: string) => {
    if (!workspaceSlug) return;

    addProjectToFavorites(workspaceSlug.toString(), projectId).catch(() => {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("failed_to_remove_project_from_favorites"),
      });
    });
  };

  const onSubmit = async (formData: Partial<TProject>) => {
    // Upper case identifier
    formData.identifier = formData.identifier?.toUpperCase();
    formData.code = formData.code?.trim();
    const coverImage = formData.cover_image_url;
    let uploadedAssetUrl: string | null = null;

    if (coverImage) {
      const imageType = getCoverImageType(coverImage);

      if (imageType === "local_static") {
        try {
          uploadedAssetUrl = await uploadCoverImage(coverImage, {
            workspaceSlug: workspaceSlug.toString(),
            entityIdentifier: "",
            entityType: EFileAssetType.PROJECT_COVER,
            isUserAsset: false,
          });
        } catch (error) {
          console.error("Error uploading cover image:", error);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: error instanceof Error ? error.message : "Failed to upload cover image",
          });
          return Promise.reject(error);
        }
      } else {
        formData.cover_image = coverImage;
        formData.cover_image_asset = null;
      }
    }

    return createProject(workspaceSlug.toString(), formData)
      .then(async (res) => {
        if (uploadedAssetUrl) {
          await updateCoverImageStatus(res.id, uploadedAssetUrl);
          await updateProject(workspaceSlug.toString(), res.id, { cover_image_url: uploadedAssetUrl });
        } else if (coverImage && coverImage.startsWith("http")) {
          await updateCoverImageStatus(res.id, coverImage);
          await updateProject(workspaceSlug.toString(), res.id, { cover_image_url: coverImage });
        }
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("project_created_successfully"),
        });

        if (setToFavorite) {
          handleAddToFavorites(res.id);
        }
        handleNextStep(res.id);
      })
      .catch((err) => {
        // 字段级错误（名称 / 项目 ID / 代号重复、字典值无效、必填缺失…）行内展示；其余 toast
        if (applyProjectServerErrors(err?.data ?? {}, setError, t)) return;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: t("something_went_wrong"),
        });
      });
  };

  const handleClose = () => {
    onClose();
    setShouldAutoSyncIdentifier(true);
    setTimeout(() => {
      reset(defaultValues);
    }, 300);
  };

  return (
    <FormProvider {...methods}>
      {/* 头部固定、中间分区滚动、底部按钮固定（同产品创建弹窗） */}
      <div className="flex max-h-[min(88vh,52rem)] min-h-0 flex-col">
        <div className="relative z-[1] shrink-0">
          <ProjectCreateHeader handleClose={handleClose} isMobile={isMobile} />
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-7">
            <div className="mt-10 space-y-7 pb-6">
              <ProjectCommonAttributes
                setValue={setValue}
                isMobile={isMobile}
                shouldAutoSyncIdentifier={shouldAutoSyncIdentifier}
                setShouldAutoSyncIdentifier={setShouldAutoSyncIdentifier}
                dictionaries={dictionaries}
              />
              <ProjectAttributes isMobile={isMobile} />
            </div>
          </div>
          <ProjectCreateButtons handleClose={handleClose} isMobile={isMobile} />
        </form>
      </div>
    </FormProvider>
  );
});
