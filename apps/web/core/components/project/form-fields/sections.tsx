/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import { getDate } from "@plane/utils";
import { FormSection, getFormGridClassName } from "@/components/common/form-section";
import type { TFormVariant } from "@/components/common/form-section";
import type { TProject } from "@/plane-web/types/projects";
import {
  ProjectDateField,
  ProjectDictionaryField,
  ProjectGradeField,
  ProjectMemberField,
  ProjectProductTypeField,
} from "./fields";
import type { TProjectDictionaries } from "./use-project-dictionaries";

/**
 * 创建弹窗与设置页完全一致的三个分区：分类 / 团队 / 计划。
 * 「基本信息」两处差异太大（identifier 自动同步 vs 唯一性检查、TextArea vs 富文本、PMS/时区只在设置页），由各自表单拼装。
 */

export type TProjectFormSectionProps = {
  control: Control<TProject>;
  variant: TFormVariant;
  disabled?: boolean;
  /** 创建弹窗传 getTabIndex(...).getIndex；设置页不传 */
  getIndex?: (key: string) => number | undefined;
};

type TClassificationSectionProps = TProjectFormSectionProps & {
  dictionaries: TProjectDictionaries;
  /** 设置页传当前项目，字典未加载时用 *_detail.label 兜住显示 */
  project?: Partial<TProject> | null;
  /** 创建时项目等级 / 产品类型必填；设置页保留「未设置」 */
  requireGradeAndProductType?: boolean;
};

export function ProjectClassificationSection(props: TClassificationSectionProps) {
  const { control, variant, disabled, getIndex, dictionaries, project, requireGradeAndProductType = false } = props;
  const { t } = useTranslation();
  const base = { control, variant, disabled };
  return (
    <FormSection title={t("workspace_projects.sections.classification")} divided={variant === "settings"}>
      <div className={getFormGridClassName(variant)}>
        <ProjectDictionaryField
          {...base}
          name="project_type"
          required
          dictionaries={dictionaries}
          fallbackItem={project?.project_type_detail}
          tabIndex={getIndex?.("project_type")}
        />
        <ProjectDictionaryField
          {...base}
          name="status"
          required
          dictionaries={dictionaries}
          fallbackItem={project?.status_detail}
          tabIndex={getIndex?.("status")}
        />
        <ProjectGradeField {...base} required={requireGradeAndProductType} tabIndex={getIndex?.("grade")} />
        <ProjectProductTypeField
          {...base}
          required={requireGradeAndProductType}
          tabIndex={getIndex?.("product_type")}
        />
      </div>
    </FormSection>
  );
}

type TTeamSectionProps = TProjectFormSectionProps & {
  /**
   * 设置页传当前项目 id：负责人只能从项目成员里选（后端 PATCH 不会把负责人补成项目成员，
   * 权限层却按负责人给全量权限，选个非成员会出现「有权限没成员行」的项目）。创建时项目还不存在，不传。
   */
  projectId?: string;
};

export function ProjectTeamSection(props: TTeamSectionProps) {
  const { control, variant, disabled, getIndex, projectId } = props;
  const { t } = useTranslation();
  const base = { control, variant, disabled };
  return (
    <FormSection title={t("workspace_projects.sections.team")} divided={variant === "settings"}>
      <div className={getFormGridClassName(variant)}>
        <ProjectMemberField
          {...base}
          name="project_lead"
          required
          projectId={projectId}
          tabIndex={getIndex?.("lead")}
        />
        <ProjectMemberField {...base} name="product_manager" required tabIndex={getIndex?.("product_manager")} />
      </div>
    </FormSection>
  );
}

export function ProjectPlanSection(props: TProjectFormSectionProps) {
  const { control, variant, disabled, getIndex } = props;
  const { t } = useTranslation();
  const base = { control, variant, disabled };
  const startDate = getDate(useWatch({ control, name: "start_date" }));
  const endDate = getDate(useWatch({ control, name: "end_date" }));
  return (
    <FormSection title={t("workspace_projects.sections.plan")} divided={variant === "settings"}>
      <div className={getFormGridClassName(variant)}>
        <ProjectDateField {...base} name="start_date" required maxDate={endDate} tabIndex={getIndex?.("start_date")} />
        <ProjectDateField
          {...base}
          name="end_date"
          required
          minDate={startDate}
          // minDate 挡住日历里的选择；用户先选完成日期再把开始日期改晚时靠这里兜
          validate={(value) => {
            const end = getDate(value);
            return startDate && end && end < startDate ? t("workspace_projects.validation.end_before_start") : true;
          }}
          tabIndex={getIndex?.("end_date")}
        />
      </div>
    </FormSection>
  );
}
