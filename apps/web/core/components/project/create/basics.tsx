/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertTriangle } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
// plane imports
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TDevMode } from "@plane/types";
import { cn, getTabIndex } from "@plane/utils";
// components
import { MODAL_FIELD_CLASS, ModalFieldError, ModalFieldLabel } from "@/components/common/form-modal";
import { DictionaryLabelSelect } from "@/components/dropdowns/dictionary-label-select";
import { DictionaryEmptyHint, ProjectDevModeField, codeRules } from "@/components/project/form-fields";
import type { TProjectDictionaries } from "@/components/project/form-fields";
// plane-web types
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  isMobile: boolean;
  dictionaries: TProjectDictionaries;
  devModes: TDevMode[];
  isDevModesLoading: boolean;
};

/**
 * 创建弹窗左栏的正文：研发模式（排最前，它决定项目能用哪些组件）、项目代号、描述（占满剩余高度）。
 * 名称 / 项目 ID / logo / 可见性在身份区（header.tsx），其余属性在右栏（properties.tsx）。
 */
export function ProjectCreateBasics(props: Props) {
  const { isMobile, dictionaries, devModes, isDevModesLoading } = props;
  const { t } = useTranslation();
  const { control } = useFormContext<TProject>();
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  const codeDictionary = dictionaries.get("code");
  const codeEmpty = dictionaries.isEmpty("code");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectDevModeField
        control={control}
        devModes={devModes}
        isLoading={isDevModesLoading}
        tabIndex={getIndex("dev_mode")}
      />

      <Controller
        control={control}
        name="code"
        rules={codeRules(t("workspace_projects.validation.required", { field: t("workspace_projects.fields.code") }))}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <div className="mt-5">
            <ModalFieldLabel required>{t("workspace_projects.fields.code")}</ModalFieldLabel>
            {/* 下拉外层是 h-full，不给定高会被撑成整块的高度 */}
            <div className="h-10.5">
              <DictionaryLabelSelect
                dictionary={codeDictionary}
                value={value ?? ""}
                onChange={onChange}
                disabled={codeEmpty}
                hasError={Boolean(error)}
                isLoading={dictionaries.isLoading}
                buttonClassName={cn(MODAL_FIELD_CLASS, "border-subtle-1 bg-layer-2", error && "border-danger-strong")}
                triggerClassName="hover:bg-transparent"
                tabIndex={getIndex("code")}
              />
            </div>
            {codeEmpty ? (
              <p className="mt-1.5 flex items-start gap-1 text-12 text-warning-primary">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <DictionaryEmptyHint dictionaries={dictionaries} name="code" />
              </p>
            ) : (
              <ModalFieldError message={error?.message} />
            )}
          </div>
        )}
      />

      <Controller
        name="description"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <ModalFieldLabel htmlFor="description">{t("workspace_projects.fields.description")}</ModalFieldLabel>
            <textarea
              id="description"
              name="description"
              value={value ?? ""}
              onChange={onChange}
              tabIndex={getIndex("description")}
              className={cn(
                "min-h-40 w-full flex-1 resize-none rounded-[10px] border border-subtle-1 bg-layer-2 px-3.5 py-3 text-14 leading-relaxed text-primary outline-none focus:border-accent-strong",
                error && "border-danger-strong"
              )}
            />
            <ModalFieldError message={error?.message} />
          </div>
        )}
      />
    </div>
  );
}
