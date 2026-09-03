/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChangeEvent, MutableRefObject } from "react";
import { Controller, useFormContext } from "react-hook-form";
// plane imports
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import { cn, getTabIndex, projectIdentifierSanitizer } from "@plane/utils";
// components
import { FORM_VARIANT_STYLES } from "@/components/common/form-section";
import { ProjectLogoField, ProjectNetworkSegmented } from "@/components/project/form-fields";
// plane web imports
import { ProjectTemplateSelect } from "@/plane-web/components/projects/create/template-select";
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  handleClose: () => void;
  isMobile?: boolean;
  isClosable?: boolean;
  handleTemplateSelect?: () => void;
  showActionButtons?: boolean;
  shouldAutoSyncIdentifier: boolean;
  setShouldAutoSyncIdentifier: (value: boolean) => void;
  /** 弹窗打开时聚焦的名称输入框（ModalCore 的 initialFocus） */
  nameInputRef?: MutableRefObject<HTMLInputElement | null>;
  handleFormOnChange?: () => void;
};

/**
 * 创建弹窗顶部的「身份区」：logo 大块 + 大字项目名 + ID 芯片 + 可见性开关 + 关闭按钮。
 * 项目 ID 随名称自动生成（去掉非字母数字、截 10 位），用户手动改过之后不再跟随。
 */
function ProjectCreateHeader(props: Props) {
  const {
    handleClose,
    isMobile = false,
    isClosable = true,
    handleTemplateSelect,
    showActionButtons = true,
    shouldAutoSyncIdentifier,
    setShouldAutoSyncIdentifier,
    nameInputRef,
    handleFormOnChange,
  } = props;
  const { t } = useTranslation();
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<TProject>();
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  const styles = FORM_VARIANT_STYLES["grouped-modal"];

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
    setShouldAutoSyncIdentifier(false);
    onChange(projectIdentifierSanitizer(e.target.value));
    handleFormOnChange?.();
  };

  return (
    <div className="grid shrink-0 grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-x-4 px-8 pt-7 pb-5">
      <ProjectLogoField
        control={control}
        tileClassName="h-16 w-16 rounded-2xl border-0 bg-accent-subtle"
        logoSize={32}
      />
      <div className="min-w-0">
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
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="off"
              ref={(element) => {
                ref(element);
                if (nameInputRef) nameInputRef.current = element;
              }}
              value={value ?? ""}
              onChange={handleNameChange(onChange)}
              placeholder={t("workspace_projects.create.name_placeholder")}
              tabIndex={getIndex("name")}
              className={cn(
                "block w-full border-0 border-b-2 border-transparent bg-transparent px-0 py-1 text-[22px] leading-tight font-semibold tracking-tight text-primary outline-none placeholder:font-medium placeholder:text-placeholder focus:border-accent-strong",
                Boolean(errors.name) && "border-danger-strong"
              )}
            />
          )}
        />
        {errors.name?.message ? <p className={styles.error}>{errors.name.message}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
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
              <label
                className={cn(
                  "inline-flex h-7 items-center overflow-hidden rounded-md border border-subtle-1 bg-layer-1 focus-within:border-accent-strong",
                  Boolean(errors.identifier) && "border-danger-strong"
                )}
              >
                <span
                  title={t("project_id_tooltip_content")}
                  className="flex h-full items-center border-r border-subtle-1 px-2 text-11 font-semibold tracking-wider text-tertiary"
                >
                  ID
                </span>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="off"
                  ref={ref}
                  value={value ?? ""}
                  onChange={handleIdentifierChange(onChange)}
                  placeholder={t("workspace_projects.create.identifier_placeholder")}
                  tabIndex={getIndex("identifier")}
                  className={cn(
                    "h-full w-28 bg-transparent px-2.5 font-mono text-13 font-semibold tracking-wide text-primary outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-placeholder",
                    value && "uppercase"
                  )}
                />
              </label>
            )}
          />
          <ProjectNetworkSegmented
            control={control}
            className="ml-auto"
            tabIndex={getIndex("network")}
            isMobile={isMobile}
          />
        </div>
        {errors.identifier?.message ? <p className={styles.error}>{errors.identifier.message}</p> : null}
      </div>
      <div className="flex items-center gap-1">
        {showActionButtons && <ProjectTemplateSelect onClick={handleTemplateSelect} />}
        {isClosable && (
          <button
            type="button"
            onClick={handleClose}
            tabIndex={getIndex("close")}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ProjectCreateHeader;
