/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { differenceInCalendarDays } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
// plane imports
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TextArea } from "@plane/ui";
import { getDate, getTabIndex } from "@plane/utils";
// components
import { FORM_VARIANT_STYLES, getFormGridClassName } from "@/components/common/form-section";
import {
  ProjectCodeField,
  ProjectDateField,
  ProjectDictionaryField,
  ProjectMemberField,
  validateEndDate,
} from "@/components/project/form-fields";
import type { TProjectDictionaries } from "@/components/project/form-fields";
// plane-web types
import type { TProject } from "@/plane-web/types/projects";
import { ProjectCreateFieldGroup } from "./field-group";

type Props = {
  isMobile: boolean;
  dictionaries: TProjectDictionaries;
  handleFormOnChange?: () => void;
};

const VARIANT = "grouped-modal" as const;

/**
 * 创建弹窗的中段：四组字段，组名靠左、字段靠右两列。
 * 基本信息（代号 | 类型 / 所属BU | 状态）· 团队（负责人 | 研发产品经理）· 排期（开始 → 完成 + 工期）· 描述。
 * 名称 / 项目 ID / logo / 可见性在顶部身份区（header.tsx）。
 */
function ProjectCommonAttributes(props: Props) {
  const { isMobile, dictionaries, handleFormOnChange } = props;
  const {
    control,
    formState: { errors },
  } = useFormContext<TProject>();
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  const { t } = useTranslation();
  const styles = FORM_VARIANT_STYLES[VARIANT];
  const grid = getFormGridClassName(VARIANT);
  const base = { control, variant: VARIANT };

  const startDate = getDate(useWatch({ control, name: "start_date" }));
  const endDate = getDate(useWatch({ control, name: "end_date" }));
  // 起止都填了且没颠倒才算工期，首尾两天都算在内
  const durationDays =
    startDate && endDate && endDate >= startDate ? differenceInCalendarDays(endDate, startDate) + 1 : null;

  return (
    <div>
      <ProjectCreateFieldGroup title={t("workspace_projects.create.groups.basic")}>
        <div className={grid}>
          <ProjectCodeField {...base} dictionaries={dictionaries} tabIndex={getIndex("code")} />
          <ProjectDictionaryField
            {...base}
            name="project_type"
            required
            dictionaries={dictionaries}
            tabIndex={getIndex("project_type")}
          />
          <ProjectDictionaryField
            {...base}
            name="business_unit"
            required={false}
            dictionaries={dictionaries}
            tabIndex={getIndex("business_unit")}
          />
          <ProjectDictionaryField {...base} name="status" required dictionaries={dictionaries} tabIndex={getIndex("status")} />
        </div>
      </ProjectCreateFieldGroup>

      <ProjectCreateFieldGroup title={t("workspace_projects.create.groups.team")}>
        <div className={grid}>
          <ProjectMemberField {...base} name="project_lead" required tabIndex={getIndex("lead")} />
          <ProjectMemberField {...base} name="product_manager" required tabIndex={getIndex("product_manager")} />
        </div>
      </ProjectCreateFieldGroup>

      <ProjectCreateFieldGroup title={t("workspace_projects.create.groups.schedule")}>
        <div className="flex items-start gap-2.5">
          <ProjectDateField
            {...base}
            name="start_date"
            required
            labelHidden
            placeholder={t("workspace_projects.fields.start_date")}
            maxDate={endDate}
            className="min-w-0 flex-1"
            tabIndex={getIndex("start_date")}
          />
          <ArrowRight className="mt-[11px] size-4 shrink-0 text-tertiary" aria-hidden="true" />
          <ProjectDateField
            {...base}
            name="end_date"
            required
            labelHidden
            placeholder={t("workspace_projects.fields.end_date")}
            minDate={startDate}
            validate={validateEndDate(startDate, t)}
            className="min-w-0 flex-1"
            tabIndex={getIndex("end_date")}
          />
          {durationDays !== null ? (
            <span className="flex h-[38px] shrink-0 items-center rounded-lg bg-accent-subtle px-3 text-13 font-medium text-accent-primary tabular-nums">
              {t("workspace_projects.create.duration_days", { count: durationDays })}
            </span>
          ) : null}
        </div>
      </ProjectCreateFieldGroup>

      <ProjectCreateFieldGroup title={t("workspace_projects.create.groups.description")} optional>
        <Controller
          name="description"
          control={control}
          render={({ field: { value, onChange } }) => (
            <TextArea
              id="description"
              name="description"
              value={value}
              placeholder={t("workspace_projects.create.description_placeholder")}
              onChange={(e) => {
                onChange(e);
                handleFormOnChange?.();
              }}
              className="!h-24 rounded-lg border !border-subtle-1 text-14"
              hasError={Boolean(errors?.description)}
              tabIndex={getIndex("description")}
            />
          )}
        />
        {errors.description?.message ? <p className={styles.error}>{errors.description.message}</p> : null}
      </ProjectCreateFieldGroup>
    </div>
  );
}

export default ProjectCommonAttributes;
