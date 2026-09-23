/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import { observer } from "mobx-react";
import { FormProvider, useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { DEFAULT_DEV_MODE_NAME } from "@plane/types";
import { clampProjectFeaturesToDevMode } from "@plane/utils";
// components
import ProjectCommonAttributes from "@/components/project/create/common-attributes";
import ProjectCreateHeader from "@/components/project/create/header";
import ProjectCreateButtons from "@/components/project/create/project-create-buttons";
import { applyProjectServerErrors, useProjectDictionaries } from "@/components/project/form-fields";
// hooks
import { useDevModes } from "@/hooks/store/use-dev-modes";
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
  /** 弹窗打开时聚焦名称输入框，避免 Headless UI 默认聚焦到 logo 按钮 */
  initialFocusRef?: MutableRefObject<HTMLInputElement | null>;
};

export const CreateProjectForm = observer(function CreateProjectForm(props: TCreateProjectFormProps) {
  const { setToFavorite, workspaceSlug, data, onClose, handleNextStep, initialFocusRef } = props;
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
  // 研发模式必选，列表回来之前下拉是加载态
  const { devModes, isLoading: isDevModesLoading } = useDevModes(workspaceSlug);

  useEffect(() => {
    if (!currentUserId || getValues("project_lead")) return;
    setValue("project_lead", currentUserId, { shouldValidate: true });
  }, [currentUserId, getValues, setValue]);

  // 默认选中混合模式（组件全开，等价于加模式之前的现状）。列表回来才知道它的 id，
  // 所以不能写死在 defaultValues 里。用户已经选过就不覆盖。
  useEffect(() => {
    if (isDevModesLoading || devModes.length === 0 || getValues("dev_mode")) return;
    const fallback = devModes.find((devMode) => devMode.is_system && devMode.name === DEFAULT_DEV_MODE_NAME);
    setValue("dev_mode", (fallback ?? devModes[0]).id);
  }, [devModes, isDevModesLoading, getValues, setValue]);

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
    // 默认值是「全部特性开启」，模式关掉的那些要先落 false，否则后端上限校验会 400
    clampProjectFeaturesToDevMode(formData, devModes.find((devMode) => devMode.id === formData.dev_mode)?.features);

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
      {/* 身份区固定、中间分组字段滚动、页脚固定；名称输入框在 form 内，回车即提交 */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[min(88vh,52rem)] min-h-0 flex-col">
        <ProjectCreateHeader
          handleClose={handleClose}
          isMobile={isMobile}
          shouldAutoSyncIdentifier={shouldAutoSyncIdentifier}
          setShouldAutoSyncIdentifier={setShouldAutoSyncIdentifier}
          nameInputRef={initialFocusRef}
        />
        <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-8">
          <ProjectCommonAttributes
            isMobile={isMobile}
            dictionaries={dictionaries}
            devModes={devModes}
            isDevModesLoading={isDevModesLoading}
          />
        </div>
        <ProjectCreateButtons handleClose={handleClose} isMobile={isMobile} />
      </form>
    </FormProvider>
  );
});
