/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProject, IWorkspace } from "@plane/types";
// components
import {
  applyProjectServerErrors,
  getMissingProjectRequiredFields,
  normalizeUserId,
} from "@/components/project/form-fields";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web types
import type { TProject } from "@/plane-web/types/projects";
// services
import { ProjectService } from "@/services/project";

const projectService = new ProjectService();

/** store 里 project_lead 可能是对象（详情接口）也可能是 id（列表接口 / PATCH 响应），进表单前归一 */
const toFormValues = (project: IProject): TProject => ({
  ...project,
  workspace: (project.workspace as IWorkspace).id,
  project_lead: normalizeUserId(project.project_lead),
});

type Params = {
  project: IProject;
  workspaceSlug: string;
  projectId: string;
};

/**
 * 项目设置常规页的表单状态：改了几处（驱动底部保存条）、放弃、提交（项目 ID 查重 + 字段级服务端错误）。
 * 保存成功后以当前值重设默认值，保存条收起；放弃时让非受控的描述编辑器重挂回到原值。
 */
export function useProjectSettingsForm(params: Params) {
  const { project, workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { updateProject } = useProject();
  const [isSaving, setIsSaving] = useState(false);
  // 描述编辑器是非受控的（只吃 initialValue），放弃 / 换项目时靠 key 让它重挂
  const [editorVersion, setEditorVersion] = useState(0);

  const form = useForm<TProject>({ defaultValues: toFormValues(project) });
  const {
    handleSubmit,
    reset,
    setError,
    getValues,
    formState: { dirtyFields },
  } = form;

  // 0348 之前的存量项目缺必填字段，顶部横幅提示；RHF 的 rules 会在保存时拦截
  const missingRequiredFields = useMemo(() => getMissingProjectRequiredFields(project), [project]);
  // RHF 只保留真正改过的字段（改回原值会移除），所以 key 数就是「N 处修改」
  const dirtyCount = Object.keys(dirtyFields).length;

  useEffect(() => {
    if (project && projectId !== getValues("id")) {
      reset(toFormValues(project));
      setEditorVersion((version) => version + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, projectId]);

  const discard = () => {
    reset();
    setEditorVersion((version) => version + 1);
  };

  const save = async (formData: TProject) => {
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

    if (project.identifier !== formData.identifier) {
      const { exists } = await projectService.checkProjectIdentifierAvailability(workspaceSlug, payload.identifier ?? "");
      if (exists) {
        setError("identifier", { message: t("common.identifier_already_exists") });
        return;
      }
    }

    try {
      await updateProject(workspaceSlug, project.id, payload);
      // 以刚保存的值为新的默认值：保存条收起，再改才算新的修改
      reset(formData);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("project_settings.general.toast.success"),
      });
    } catch (err) {
      // 字段级错误（名称 / 项目 ID / 代号重复、字典值无效…）行内展示；其余 toast
      if (applyProjectServerErrors(err ?? {}, setError, t)) return;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("something_went_wrong"),
      });
    }
  };

  const onSubmit = handleSubmit(async (formData) => {
    setIsSaving(true);
    try {
      await save(formData);
    } finally {
      setIsSaving(false);
    }
  });

  return { form, dirtyCount, isSaving, missingRequiredFields, editorVersion, discard, onSubmit };
}
