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
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// ui
import { Tooltip } from "@plane/propel/tooltip";
import { Input, TextArea } from "@plane/ui";
import { cn, projectIdentifierSanitizer, getTabIndex } from "@plane/utils";
// components
import { FORM_VARIANT_STYLES, FormFieldShell, FormSection, getFormGridClassName } from "@/components/common/form-section";
import {
  ProjectClassificationSection,
  ProjectCodeField,
  ProjectDictionaryField,
  ProjectNetworkField,
} from "@/components/project/form-fields";
import type { TProjectDictionaries } from "@/components/project/form-fields";
// plane-web types
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  setValue: UseFormSetValue<TProject>;
  isMobile: boolean;
  shouldAutoSyncIdentifier: boolean;
  setShouldAutoSyncIdentifier: (value: boolean) => void;
  dictionaries: TProjectDictionaries;
  handleFormOnChange?: () => void;
};

/** 创建弹窗的「基本信息」+「分类」两个分区；「团队」「计划」在 plane-web 的 ProjectAttributes */
function ProjectCommonAttributes(props: Props) {
  const { setValue, isMobile, shouldAutoSyncIdentifier, setShouldAutoSyncIdentifier, dictionaries, handleFormOnChange } =
    props;
  const {
    formState: { errors },
    control,
  } = useFormContext<TProject>();

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  const { t } = useTranslation();
  const styles = FORM_VARIANT_STYLES.modal;
  const grid = getFormGridClassName("modal");

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
    <>
      <FormSection title={t("workspace_projects.sections.basic")}>
        <div className={grid}>
          <FormFieldShell
            className="md:col-span-2"
            label={t("workspace_projects.fields.name")}
            required
            editable
            error={errors.name?.message}
            styles={styles}
          >
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
              render={({ field: { value, onChange, ref } }) => (
                <Input
                  id="name"
                  name="name"
                  type="text"
                  ref={ref}
                  value={value}
                  onChange={handleNameChange(onChange)}
                  hasError={Boolean(errors.name)}
                  placeholder={t("project_name")}
                  className={styles.input}
                  tabIndex={getIndex("name")}
                />
              )}
            />
          </FormFieldShell>
          <FormFieldShell
            label={t("workspace_projects.fields.identifier")}
            required
            editable
            error={errors.identifier?.message}
            styles={styles}
          >
            <div className="relative">
              <Controller
                control={control}
                name="identifier"
                rules={{
                  required: t("project_id_is_required"),
                  // allow only alphanumeric & non-latin characters
                  validate: (value) =>
                    /^[ÇŞĞIİÖÜA-Z0-9]+$/.test(value.toUpperCase()) ||
                    t("only_alphanumeric_non_latin_characters_allowed"),
                  minLength: {
                    value: 1,
                    message: t("project_id_min_char"),
                  },
                  maxLength: {
                    value: 10,
                    message: t("project_id_max_char"),
                  },
                }}
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id="identifier"
                    name="identifier"
                    type="text"
                    ref={ref}
                    value={value}
                    onChange={handleIdentifierChange(onChange)}
                    hasError={Boolean(errors.identifier)}
                    placeholder={t("project_id")}
                    className={cn(styles.input, "pr-7", { uppercase: value })}
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
            </div>
          </FormFieldShell>
          <ProjectCodeField control={control} variant="modal" tabIndex={getIndex("code")} />
          <ProjectNetworkField control={control} variant="modal" tabIndex={getIndex("network")} />
          <ProjectDictionaryField
            control={control}
            variant="modal"
            name="business_unit"
            required={false}
            dictionaries={dictionaries}
            tabIndex={getIndex("business_unit")}
          />
          <FormFieldShell
            className="md:col-span-2"
            label={t("workspace_projects.fields.description")}
            required={false}
            editable
            error={errors.description?.message}
            styles={styles}
          >
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
          </FormFieldShell>
        </div>
      </FormSection>
      <ProjectClassificationSection
        control={control}
        variant="modal"
        dictionaries={dictionaries}
        getIndex={getIndex}
        requireGradeAndProductType
      />
    </>
  );
}

export default ProjectCommonAttributes;
