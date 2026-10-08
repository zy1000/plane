/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import { observer } from "mobx-react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
// plane imports
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { DEFAULT_DEV_MODE_NAME } from "@plane/types";
import { clampProjectFeaturesToDevMode, getTabIndex } from "@plane/utils";
// components
import { ProjectCreateBasics } from "@/components/project/create/basics";
import ProjectCreateHeader from "@/components/project/create/header";
import ProjectCreateButtons from "@/components/project/create/project-create-buttons";
import { ProjectCreateProperties } from "@/components/project/create/properties";
import { applyProjectServerErrors, useProjectDictionaries } from "@/components/project/form-fields";
// hooks
import { useDevModes } from "@/hooks/store/use-dev-modes";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { ProjectTemplateSelect } from "@/plane-web/components/projects/create/template-select";
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

/** 创建必填的字段，页脚「必填 x / N」按这个数 */
const REQUIRED_KEYS = [
  "name",
  "identifier",
  "dev_mode",
  "code",
  "project_type",
  "product_type",
  "status",
  "project_lead",
  "product_manager",
  "start_date",
  "end_date",
] as const;

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
  const { control, getValues, handleSubmit, reset, setValue, setError } = methods;
  const { isMobile } = usePlatformOS();
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  // 一次拉全量字典给项目代号 / 项目类型 / 所属BU / 项目状态四个下拉共用
  const dictionaries = useProjectDictionaries(workspaceSlug);
  // 研发模式必选，列表回来之前下拉是加载态
  const { devModes, isLoading: isDevModesLoading } = useDevModes(workspaceSlug);

  // 页脚的必填进度：只看值有没有，校验错误另算
  const watched = useWatch({ control });
  const requiredFilled = REQUIRED_KEYS.filter((key) => {
    const value = watched[key];
    // project_lead 可能是 IUserLite 对象
    const normalized = typeof value === "object" && value !== null ? value.id : value;
    return typeof normalized === "string" ? normalized.trim() !== "" : Boolean(normalized);
  }).length;

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
      {/* 宽屏左右两栏各自滚动、页脚固定；窄屏上下堆叠整体一起滚。名称输入框在 form 内，回车即提交 */}
      <form onSubmit={handleSubmit(onSubmit)} className="relative flex h-[min(90vh,46.25rem)] min-h-0 flex-col">
        <div
          data-modal-wheel-scroll
          className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_28.5rem] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden"
        >
          <div
            data-modal-wheel-scroll
            className="vertical-scrollbar scrollbar-sm flex min-w-0 flex-col px-7 pt-7.5 pb-7 md:min-h-0 md:overflow-y-auto md:px-9"
          >
            <ProjectCreateHeader
              isMobile={isMobile}
              shouldAutoSyncIdentifier={shouldAutoSyncIdentifier}
              setShouldAutoSyncIdentifier={setShouldAutoSyncIdentifier}
              nameInputRef={initialFocusRef}
            />
            <div className="my-6 border-t border-subtle" />
            <ProjectCreateBasics
              isMobile={isMobile}
              dictionaries={dictionaries}
              devModes={devModes}
              isDevModesLoading={isDevModesLoading}
            />
          </div>
          <ProjectCreateProperties isMobile={isMobile} dictionaries={dictionaries} />
        </div>
        <ProjectCreateButtons
          handleClose={handleClose}
          isMobile={isMobile}
          requiredFilled={requiredFilled}
          requiredTotal={REQUIRED_KEYS.length}
        />
        <div className="absolute top-4 right-4 flex items-center gap-1">
          <ProjectTemplateSelect />
          <button
            type="button"
            onClick={handleClose}
            tabIndex={getIndex("close")}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      </form>
    </FormProvider>
  );
});
