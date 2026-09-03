/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import type { TTranslationStore } from "@plane/i18n";
import { getDate } from "@plane/utils";
import type { TFormVariant } from "@/components/common/form-section";
import type { TProject } from "@/plane-web/types/projects";
import { ProjectCodeField, ProjectDateField, ProjectDictionaryField, ProjectMemberField } from "./fields";
import type { TProjectDictionaries } from "./use-project-dictionaries";

export type TProjectSharedFieldsProps = {
  control: Control<TProject>;
  variant: TFormVariant;
  disabled?: boolean;
  /** 创建弹窗传 getTabIndex(...).getIndex；设置页不传 */
  getIndex?: (key: string) => number | undefined;
  dictionaries: TProjectDictionaries;
  /** 设置页传当前项目，字典未加载时用 *_detail.label 兜住显示 */
  project?: Partial<TProject> | null;
  /**
   * 设置页传当前项目 id：负责人只能从项目成员里选（后端 PATCH 不会把负责人补成项目成员，
   * 权限层却按负责人给全量权限，选个非成员会出现「有权限没成员行」的项目）。创建时项目还不存在，不传。
   */
  projectId?: string;
};

/**
 * 完成日期不早于开始日期。minDate 挡住日历里的选择；用户先选完成日期再把开始日期改晚时靠这里兜。
 * 创建弹窗（分组布局）与设置页（平铺）各自拼日期字段，校验共用这一处。
 */
export const validateEndDate =
  (startDate: Date | undefined, t: TTranslationStore["t"]) =>
  (value: string | null | undefined): true | string => {
    const end = getDate(value);
    return startDate && end && end < startDate ? t("workspace_projects.validation.end_before_start") : true;
  };

/**
 * 创建弹窗与设置页共用的中段字段，按两列网格的顺序平铺：
 * 项目代号 | 项目类型 / 负责人 | 研发产品经理 / 所属BU | 项目状态 / 开始日期 | 完成日期。
 * 本身不带网格容器，作为父级 grid 的直接子元素使用；
 * 名称 / 项目 ID / 描述 / 可见性两处差异较大（identifier 自动同步 vs 唯一性检查、TextArea vs 富文本），由各自表单拼装。
 */
export function ProjectSharedFields(props: TProjectSharedFieldsProps) {
  const { control, variant, disabled, getIndex, dictionaries, project, projectId } = props;
  const { t } = useTranslation();
  const base = { control, variant, disabled };
  const startDate = getDate(useWatch({ control, name: "start_date" }));
  const endDate = getDate(useWatch({ control, name: "end_date" }));
  return (
    <>
      <ProjectCodeField {...base} dictionaries={dictionaries} tabIndex={getIndex?.("code")} />
      <ProjectDictionaryField
        {...base}
        name="project_type"
        required
        dictionaries={dictionaries}
        fallbackItem={project?.project_type_detail}
        tabIndex={getIndex?.("project_type")}
      />
      <ProjectMemberField {...base} name="project_lead" required projectId={projectId} tabIndex={getIndex?.("lead")} />
      <ProjectMemberField {...base} name="product_manager" required tabIndex={getIndex?.("product_manager")} />
      <ProjectDictionaryField
        {...base}
        name="business_unit"
        required={false}
        dictionaries={dictionaries}
        fallbackItem={project?.business_unit_detail}
        tabIndex={getIndex?.("business_unit")}
      />
      <ProjectDictionaryField
        {...base}
        name="status"
        required
        dictionaries={dictionaries}
        fallbackItem={project?.status_detail}
        tabIndex={getIndex?.("status")}
      />
      <ProjectDateField {...base} name="start_date" required maxDate={endDate} tabIndex={getIndex?.("start_date")} />
      <ProjectDateField
        {...base}
        name="end_date"
        required
        minDate={startDate}
        validate={validateEndDate(startDate, t)}
        tabIndex={getIndex?.("end_date")}
      />
    </>
  );
}
