/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import type { TDataDictionary, TProductExtendedFieldKey } from "@plane/types";
import { Input } from "@plane/ui";
import { cn } from "@plane/utils";
import { MODAL_FIELD_CLASS, ModalFieldError, ModalFieldLabel } from "@/components/common/form-modal";
import { DictionaryLabelSelect } from "@/components/dropdowns/dictionary-label-select";
import type { TProductExtendedFieldErrors, TProductExtendedFieldsState } from "./extended-fields";

type Props = {
  workspaceSlug: string;
  editable: boolean;
  values: TProductExtendedFieldsState;
  errors: TProductExtendedFieldErrors;
  onChange: <K extends TProductExtendedFieldKey>(key: K, value: TProductExtendedFieldsState[K]) => void;
  codeDictionary?: TDataDictionary;
  isDictionaryLoading: boolean;
  /** 描述编辑器由弹窗传入（附件上传 / 草稿资产都在弹窗里管） */
  description: ReactNode;
};

/** 产品弹窗左栏的正文部分：项目代号、两个型号、描述（占满剩余高度） */
export function ProductModalBasics(props: Props) {
  const { workspaceSlug, editable, values, errors, onChange, codeDictionary, isDictionaryLoading, description } =
    props;
  const { t } = useTranslation();
  const codeEmpty = editable && codeDictionary !== undefined && codeDictionary.items.length === 0;

  const textField = (key: "model_number" | "external_model") => (
    <div className="min-w-0">
      <ModalFieldLabel htmlFor={`product-${key}`}>{t(`workspace_products.fields.${key}`)}</ModalFieldLabel>
      {editable ? (
        <Input
          id={`product-${key}`}
          name={key}
          type="text"
          value={values[key]}
          onChange={(event) => onChange(key, event.target.value)}
          maxLength={255}
          hasError={Boolean(errors[key])}
          placeholder={t("workspace_products.fields.optional")}
          className={cn(MODAL_FIELD_CLASS, "py-0 focus:border-accent-strong")}
        />
      ) : (
        <p className="truncate text-14 text-primary">{values[key] || "—"}</p>
      )}
      <ModalFieldError message={errors[key]} />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div>
        <ModalFieldLabel required={editable}>{t("workspace_products.fields.code")}</ModalFieldLabel>
        {editable ? (
          // 下拉外层是 h-full，不给定高会被撑成整块的高度
          <div className="h-10.5">
            <DictionaryLabelSelect
              dictionary={codeDictionary}
              value={values.code}
              onChange={(label) => onChange("code", label)}
              disabled={codeEmpty}
              hasError={Boolean(errors.code)}
              isLoading={isDictionaryLoading}
              buttonClassName={cn(MODAL_FIELD_CLASS, "border-subtle-1 bg-layer-2", errors.code && "border-danger-strong")}
              triggerClassName="hover:bg-transparent"
            />
          </div>
        ) : (
          <p className="truncate text-14 text-primary">{values.code || "—"}</p>
        )}
        {codeEmpty ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1 text-12 text-warning-primary">
            <AlertTriangle className="size-3.5 shrink-0" />
            {t("workspace_products.validation.dictionary_empty", {
              name: codeDictionary?.name ?? t("workspace_products.fields.code"),
            })}
            <Link to={`/${workspaceSlug}/settings/data-dictionaries`} className="text-accent-primary hover:underline">
              {t("workspace_products.validation.manage_dictionaries")}
            </Link>
          </p>
        ) : (
          <ModalFieldError message={errors.code} />
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {textField("model_number")}
        {textField("external_model")}
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <ModalFieldLabel>{t("workspace_products.fields.description")}</ModalFieldLabel>
        {description}
      </div>
    </div>
  );
}
