/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { Lock } from "lucide-react";
import { Link } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TDevMode, TDevModeLite } from "@plane/types";
import { DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { ChevronDownIcon } from "@plane/propel/icons";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { TypeIcon } from "@/components/common/type-icon-picker";
import { FormFieldShell } from "@/components/common/form-section";
import { devModeDetailPath } from "@/components/template-management/dev-modes/routes";
// local imports
import type { TProjectFieldProps } from "./fields";
import { useFieldHelpers } from "./fields";

/** 与模板中心卡片共用的 i18n 前缀，模式名与组件名都从那边取，别再抄一份 */
const DEV_MODE_I18N = "workspace_templates.dev_modes";

const PRESET_BADGE = "inline-flex h-5 shrink-0 items-center rounded border border-subtle bg-surface-2 px-1.5 text-11 font-medium text-secondary";

/** 模式开放了哪些组件：开的高亮、关的划线灰，与模板中心卡片同一套 chip */
function DevModeFeatureSummary({ features }: { features: TDevModeLite["features"] }) {
  const { t } = useTranslation();
  return (
    <span className="mt-2 flex flex-wrap items-center gap-1.5 text-12 text-tertiary">
      {t(`${DEV_MODE_I18N}.field.enabled_features`)}
      {DEV_MODE_FEATURE_KEYS.map((key) => (
        <span
          key={key}
          className={cn(
            "inline-flex h-[22px] items-center rounded px-2 text-11 font-medium",
            features?.[key]
              ? "bg-accent-primary/10 text-accent-primary"
              : "border border-subtle text-disabled line-through"
          )}
        >
          {t(`${DEV_MODE_I18N}.features.${key}`)}
        </span>
      ))}
    </span>
  );
}

// ---- 创建弹窗：可选的下拉 ----
type TProjectDevModeFieldProps = TProjectFieldProps & {
  devModes: TDevMode[];
  isLoading: boolean;
  className?: string;
};

/**
 * 创建项目弹窗里的「研发模式」。必填，默认选中混合模式（默认值在表单那边设）。
 *
 * 模式决定项目能用哪些组件，所以选完立刻在下面把开放的组件列出来 —— 创建弹窗里
 * 已经没有功能开关那一步了，这行摘要是用户唯一能看到的后果。
 */
export function ProjectDevModeField(props: TProjectDevModeFieldProps) {
  const { control, variant, disabled = false, tabIndex, devModes, isLoading, className } = props;
  const { t, styles, label } = useFieldHelpers(variant);

  const options = useMemo(
    () =>
      devModes.map((devMode) => ({
        value: devMode.id,
        query: devMode.name,
        content: (
          <span className="flex min-w-0 items-center gap-2.5">
            <TypeIcon iconProps={devMode.icon_props?.icon} className="size-7 rounded-lg" iconClassName="size-4" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium">{devMode.name}</span>
                {devMode.is_system ? <span className={PRESET_BADGE}>{t(`${DEV_MODE_I18N}.card.preset`)}</span> : null}
              </span>
              {devMode.description ? (
                <span className="block truncate text-12 text-tertiary">{devMode.description}</span>
              ) : null}
            </span>
          </span>
        ),
      })),
    [devModes, t]
  );

  return (
    <Controller
      control={control}
      name="dev_mode"
      rules={{ validate: (value) => Boolean(value) || t("workspace_projects.validation.dev_mode_required") }}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const selected = devModes.find((devMode) => devMode.id === value);
        return (
          <FormFieldShell
            label={label("dev_mode")}
            required
            editable={!disabled}
            error={error?.message}
            styles={styles}
            className={className}
          >
            <div className={styles.control}>
              <CustomSearchSelect
                options={isLoading ? undefined : options}
                value={value ?? null}
                onChange={onChange}
                disabled={disabled}
                className="h-full w-full"
                optionsClassName="w-[min(28rem,calc(100vw-2rem))]"
                customButtonClassName="h-full rounded-md"
                customButton={
                  <div
                    className={cn(
                      "flex h-full w-full items-center justify-between gap-1.5 rounded-md border-[0.5px] border-strong px-2 text-left",
                      error && "border-danger-strong",
                      styles.dropdownButton
                    )}
                  >
                    <span className={cn("flex min-w-0 flex-1 items-center gap-2", !selected && "text-placeholder")}>
                      {selected ? (
                        <>
                          <TypeIcon
                            iconProps={selected.icon_props?.icon}
                            className="size-[22px] rounded-md"
                            iconClassName="size-3.5"
                          />
                          <span className="truncate">{selected.name}</span>
                          {selected.is_system ? (
                            <span className={PRESET_BADGE}>{t(`${DEV_MODE_I18N}.card.preset`)}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="truncate">{t("workspace_projects.fields.select_placeholder")}</span>
                      )}
                    </span>
                    <ChevronDownIcon className="size-3 shrink-0 text-secondary" aria-hidden="true" />
                  </div>
                }
                tabIndex={tabIndex}
              />
            </div>
            {selected ? <DevModeFeatureSummary features={selected.features} /> : null}
          </FormFieldShell>
        );
      }}
    />
  );
}

// ---- 项目设置：只读的一格 ----
type TProjectDevModeReadOnlyFieldProps = {
  variant: TProjectFieldProps["variant"];
  devMode: TDevModeLite | null | undefined;
  workspaceSlug: string;
};

/**
 * 项目设置里的「研发模式」：只显示，不可改（需求 4.2，项目不允许切换模式）。
 *
 * 不进表单、不进保存 payload —— 做成禁用的下拉会让人以为改得动，所以直接是一格只读。
 */
export function ProjectDevModeReadOnlyField(props: TProjectDevModeReadOnlyFieldProps) {
  const { variant, devMode, workspaceSlug } = props;
  const { t, styles, label } = useFieldHelpers(variant);

  return (
    <FormFieldShell
      label={label("dev_mode")}
      editable={false}
      styles={styles}
      hint={
        devMode ? (
          <span className="flex flex-wrap items-center gap-x-1">
            {t("workspace_projects.fields.dev_mode_readonly_hint")}
            <Link to={devModeDetailPath(workspaceSlug, devMode.id)} className="text-accent-primary hover:underline">
              {t("workspace_projects.fields.dev_mode_view")}
            </Link>
          </span>
        ) : undefined
      }
    >
      <div
        className={cn(
          styles.control,
          "flex items-center gap-2 rounded-lg border border-subtle bg-layer-1 px-3 text-14 text-primary"
        )}
      >
        {devMode ? (
          <>
            <TypeIcon iconProps={devMode.icon_props?.icon} className="size-6 rounded-md" iconClassName="size-3.5" />
            <span className="truncate font-medium">{devMode.name}</span>
            {devMode.is_system ? <span className={PRESET_BADGE}>{t(`${DEV_MODE_I18N}.card.preset`)}</span> : null}
          </>
        ) : (
          <span className="text-placeholder">{t("workspace_projects.fields.not_set")}</span>
        )}
        <Lock className="ml-auto size-3.5 shrink-0 text-placeholder" aria-hidden="true" />
      </div>
    </FormFieldShell>
  );
}
