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
// components
import ProjectCommonAttributes from "@/components/project/create/common-attributes";
import ProjectCreateHeader from "@/components/project/create/header";
import ProjectCreateButtons from "@/components/project/create/project-create-buttons";
import { applyProjectServerErrors, useProjectDictionaries } from "@/components/project/form-fields";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web types
import type { TProject } from "@/plane-web/types/projects";
import { getProjectFormValues } from "./utils";

export type TCreateProjectFormProps = {
  setToFavorite?: boolean;
  workspaceSlug: string;
  onClose: () => void;
  handleNextStep: (projectId: string) => void;
  data?: Partial<TProject>;
  templateId?: string;
};

export const CreateProjectForm = observer(function CreateProjectForm(props: TCreateProjectFormProps) {
  const { setToFavorite, workspaceSlug, data, onClose, handleNextStep } = props;
  // store
  const { t } = useTranslation();
  const { addProjectToFavorites, createProject } = useProject();
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

    return createProject(workspaceSlug.toString(), formData)
      .then((res) => {
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
      {/* 头部固定、中间字段滚动、底部按钮固定（同产品创建弹窗） */}
      <div className="flex max-h-[min(88vh,52rem)] min-h-0 flex-col">
        <div className="shrink-0">
          <ProjectCreateHeader handleClose={handleClose} isMobile={isMobile} />
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-7">
            <div className="pt-6 pb-6">
              <ProjectCommonAttributes
                setValue={setValue}
                isMobile={isMobile}
                shouldAutoSyncIdentifier={shouldAutoSyncIdentifier}
                setShouldAutoSyncIdentifier={setShouldAutoSyncIdentifier}
                dictionaries={dictionaries}
              />
            </div>
          </div>
          <ProjectCreateButtons handleClose={handleClose} isMobile={isMobile} />
        </form>
      </div>
    </FormProvider>
  );
});
