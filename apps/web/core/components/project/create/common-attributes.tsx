/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChangeEvent } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "@plane/propel/icons";
// plane imports
import { ETabIndices, PROJECT_GRADE_OPTIONS, PROJECT_PRODUCT_TYPE_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// ui
import { Tooltip } from "@plane/propel/tooltip";
import { CustomSelect, Input, TextArea } from "@plane/ui";
import { cn, projectIdentifierSanitizer, getTabIndex } from "@plane/utils";
// plane utils
// helpers
// components
import { ProjectGradeBadge } from "@/components/project/common/project-grade-badge";
// plane-web types
import type { TProject } from "@/plane-web/types/projects";
import type { TProjectGrade, TProjectProductType } from "@plane/types";

type Props = {
  setValue: UseFormSetValue<TProject>;
  isMobile: boolean;
  shouldAutoSyncIdentifier: boolean;
  setShouldAutoSyncIdentifier: (value: boolean) => void;
  handleFormOnChange?: () => void;
};

function ProjectCommonAttributes(props: Props) {
  const { setValue, isMobile, shouldAutoSyncIdentifier, setShouldAutoSyncIdentifier, handleFormOnChange } = props;
  const {
    formState: { errors },
    control,
  } = useFormContext<TProject>();
  const gradeError = errors.grade?.message;
  const productTypeError = errors.product_type?.message;

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  const { t } = useTranslation();

  const handleNameChange =
    (onChange: (event: ChangeEvent<HTMLInputElement>) => void) => (e: ChangeEvent<HTMLInputElement>) => {
      if (!shouldAutoSyncIdentifier) {
        onChange(e);
        return;
      }
      if (e.target.value === "") setValue("identifier", "");
      else setValue("identifier", projectIdentifierSanitizer(e.target.value).substring(0, 10));
      onChange(e);
      handleFormOnChange?.();
    };

  const handleIdentifierChange = (onChange: (value: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const alphanumericValue = projectIdentifierSanitizer(value);
    setShouldAutoSyncIdentifier(false);
    onChange(alphanumericValue);
    handleFormOnChange?.();
  };
  return (
    <div className="grid grid-cols-1 gap-x-2 gap-y-3 md:grid-cols-3">
      <div className="md:col-span-3">
        <Controller
          control={control}
          name="name"
          rules={{
            required: t("name_is_required"),
            maxLength: {
              value: 255,
              message: t("title_should_be_less_than_255_characters"),
            },
          }}
          render={({ field: { value, onChange } }) => (
            <Input
              id="name"
              name="name"
              type="text"
              value={value}
              onChange={handleNameChange(onChange)}
              hasError={Boolean(errors.name)}
              placeholder={t("project_name")}
              className="focus:border-blue-400 h-[38px] min-h-[38px] w-full !py-0 text-13 leading-5"
              tabIndex={getIndex("name")}
            />
          )}
        />
        <span className="text-11 text-danger-primary">{errors?.name?.message}</span>
      </div>
      <div className="md:col-span-1">
        <Controller
          control={control}
          name="grade"
          rules={{ required: t("project_grade_required") }}
          render={({ field: { value, onChange } }) => {
            const selected = value ?? null;
            return (
              <CustomSelect
                value={selected ?? ""}
                onChange={(val: string) => {
                  onChange(val as TProjectGrade);
                  handleFormOnChange?.();
                }}
                label={
                  selected ? (
                    <span className="flex items-center gap-1.5">
                      <ProjectGradeBadge grade={selected} />
                    </span>
                  ) : (
                    <span className="text-placeholder text-13">{t("select_project_grade")}</span>
                  )
                }
                buttonClassName={cn(
                  /** 与名称、项目 ID 输入框同一行高 38px */
                  "!border-subtle-1 !shadow-none flex !h-[38px] !min-h-[38px] !max-h-[38px] w-full shrink-0 items-center rounded-md border-[0.5px] px-3 !py-0 text-left text-13 font-normal leading-5 focus:outline-none focus:border-blue-400",
                  gradeError && "!border-danger-strong"
                )}
                input
                tabIndex={getIndex("grade")}
              >
                {PROJECT_GRADE_OPTIONS.map((opt) => (
                  <CustomSelect.Option key={opt} value={opt}>
                    <ProjectGradeBadge grade={opt} />
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            );
          }}
        />
        <span className="text-11 text-danger-primary">{gradeError}</span>
      </div>
      <div className="md:col-span-1">
        <Controller
          control={control}
          name="product_type"
          rules={{ required: "请选择产品类型" }}
          render={({ field: { value, onChange } }) => {
            const selected = value ?? null;
            return (
              <CustomSelect
                value={selected ?? ""}
                onChange={(val: string) => {
                  onChange(val as TProjectProductType);
                  handleFormOnChange?.();
                }}
                label={
                  selected ? (
                    <span className="text-13">{selected}</span>
                  ) : (
                    <span className="text-placeholder text-13">请选择产品类型</span>
                  )
                }
                buttonClassName={cn(
                  "!border-subtle-1 !shadow-none flex !h-[38px] !min-h-[38px] !max-h-[38px] w-full shrink-0 items-center rounded-md border-[0.5px] px-3 !py-0 text-left text-13 font-normal leading-5 focus:outline-none focus:border-blue-400",
                  productTypeError && "!border-danger-strong"
                )}
                input
                tabIndex={getIndex("product_type")}
              >
                {PROJECT_PRODUCT_TYPE_OPTIONS.map((opt) => (
                  <CustomSelect.Option key={opt} value={opt}>
                    {opt}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            );
          }}
        />
        <span className="text-11 text-danger-primary">{productTypeError}</span>
      </div>
      <div className="relative md:col-span-1">
        <Controller
          control={control}
          name="identifier"
          rules={{
            required: t("project_id_is_required"),
            // allow only alphanumeric & non-latin characters
            validate: (value) =>
              /^[ÇŞĞIİÖÜA-Z0-9]+$/.test(value.toUpperCase()) || t("only_alphanumeric_non_latin_characters_allowed"),
            minLength: {
              value: 1,
              message: t("project_id_min_char"),
            },
            maxLength: {
              value: 10,
              message: t("project_id_max_char"),
            },
          }}
          render={({ field: { value, onChange } }) => (
            <Input
              id="identifier"
              name="identifier"
              type="text"
              value={value}
              onChange={handleIdentifierChange(onChange)}
              hasError={Boolean(errors.identifier)}
              placeholder={t("project_id")}
              className={cn(
                "focus:border-blue-400 h-[38px] min-h-[38px] w-full !py-0 pr-7 text-13 leading-5",
                {
                  uppercase: value,
                }
              )}
              tabIndex={getIndex("identifier")}
            />
          )}
        />
        <Tooltip
          isMobile={isMobile}
          tooltipContent={t("project_id_tooltip_content")}
          className="text-13"
          position="right-start"
        >
          <InfoIcon className="absolute top-1/2 right-2 h-3 w-3 -translate-y-1/2 text-placeholder" />
        </Tooltip>
        <span className="text-11 text-danger-primary">{errors?.identifier?.message}</span>
      </div>
      <div className="md:col-span-3">
        <Controller
          name="description"
          control={control}
          render={({ field: { value, onChange } }) => (
            <TextArea
              id="description"
              name="description"
              value={value}
              placeholder={t("description")}
              onChange={(e) => {
                onChange(e);
                handleFormOnChange?.();
              }}
              className="focus:border-blue-400 !h-24 text-13"
              hasError={Boolean(errors?.description)}
              tabIndex={getIndex("description")}
            />
          )}
        />
      </div>
    </div>
  );
}

export default ProjectCommonAttributes;
