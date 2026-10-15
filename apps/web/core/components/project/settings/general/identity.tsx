/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import type { ReactNode } from "react";
import { Controller } from "react-hook-form";
import type { Control, FieldErrors } from "react-hook-form";
import { Lock, Pencil } from "lucide-react";
// plane imports
import { NETWORK_CHOICES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { IProject } from "@plane/types";
import { cn, projectIdentifierSanitizer, renderFormattedDate } from "@plane/utils";
// components
import { ModalInlineError } from "@/components/common/form-modal";
import { ProjectLogoField, ProjectNetworkSegmented, getProjectDateFormatToken } from "@/components/project/form-fields";
import { ProjectNetworkIcon } from "@/components/project/project-network-icon";
// plane web types
import type { TProject } from "@/plane-web/types/projects";

/**
 * 项目设置常规页顶部的「身份区」：72px 图标块 + 大字项目名 + ID 芯片 + 创建时间，右侧是可见性开关。
 * 与创建弹窗的身份区同一套样式，只是名称 / ID 不再联动。
 */

const TILE_CLASS = "h-18 w-18 rounded-[20px] border-0 bg-accent-subtle";
const LOGO_SIZE = 36;
const NAME_CLASS = "block w-full text-24 leading-tight font-semibold tracking-tight text-primary";
const CHIP_CLASS = "inline-flex h-8 items-center overflow-hidden rounded-lg border border-subtle-1 bg-surface-1";
const CHIP_PREFIX_CLASS =
  "flex h-full items-center border-r border-subtle-1 bg-layer-1 px-2.5 text-12 font-semibold tracking-wider text-tertiary";
const CHIP_VALUE_CLASS = "h-full bg-transparent px-2.5 font-mono text-13 font-semibold tracking-wide text-primary uppercase";

function IdentityLayout(props: { tile: ReactNode; main: ReactNode; aside: ReactNode }) {
  const { tile, main, aside } = props;
  return (
    <header className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-5 gap-y-3 md:grid-cols-[72px_minmax(0,1fr)_auto]">
      {tile}
      <div className="min-w-0">{main}</div>
      <div className="col-start-2 md:col-start-3 md:self-start md:pt-1.5">{aside}</div>
    </header>
  );
}

function CreatedOn({ project }: { project: IProject }) {
  const { t, currentLocale } = useTranslation();
  const createdOn = renderFormattedDate(project.created_at, getProjectDateFormatToken(currentLocale));
  if (!createdOn) return null;
  return (
    <span className="text-13 text-tertiary">
      {t("common.created_on")} {createdOn}
    </span>
  );
}

// ---- 可编辑 ----
type TProjectSettingsIdentityProps = {
  project: IProject;
  control: Control<TProject>;
  errors: FieldErrors<TProject>;
};

export function ProjectSettingsIdentity(props: TProjectSettingsIdentityProps) {
  const { project, control, errors } = props;
  const { t } = useTranslation();
  const identifierInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <IdentityLayout
      tile={<ProjectLogoField control={control} tileClassName={TILE_CLASS} logoSize={LOGO_SIZE} />}
      main={
        <>
          <Controller
            control={control}
            name="name"
            rules={{
              required: t("name_is_required"),
              maxLength: {
                value: 255,
                message: t("workspace_projects.validation.max_length", {
                  field: t("workspace_projects.fields.name"),
                  max: 255,
                }),
              },
            }}
            render={({ field: { value, onChange, ref } }) => (
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="off"
                ref={ref}
                value={value ?? ""}
                onChange={onChange}
                placeholder={t("common.project_name")}
                aria-label={t("workspace_projects.fields.name")}
                className={cn(
                  NAME_CLASS,
                  "border-0 border-b-2 border-transparent bg-transparent px-0 py-0.5 outline-none placeholder:font-medium placeholder:text-placeholder focus:border-accent-strong",
                  Boolean(errors.name) && "border-danger-strong"
                )}
              />
            )}
          />
          {errors.name?.message ? <ModalInlineError message={errors.name.message} /> : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <Controller
              control={control}
              name="identifier"
              rules={{
                required: t("project_id_is_required"),
                validate: (value) => /^[ÇŞĞIİÖÜA-Z0-9]+$/.test(value.toUpperCase()) || t("project_id_allowed_char"),
                minLength: { value: 1, message: t("project_id_min_char") },
                maxLength: { value: 10, message: t("project_id_max_char") },
              }}
              render={({ field: { value, onChange, ref } }) => (
                <label
                  className={cn(
                    CHIP_CLASS,
                    "focus-within:border-accent-strong",
                    Boolean(errors.identifier) && "border-danger-subtle bg-danger-subtle"
                  )}
                >
                  <span
                    title={t("project_id_tooltip_content")}
                    className={cn(
                      CHIP_PREFIX_CLASS,
                      Boolean(errors.identifier) && "border-danger-subtle bg-danger-subtle text-danger-primary"
                    )}
                  >
                    ID
                  </span>
                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    autoComplete="off"
                    ref={(element) => {
                      ref(element);
                      identifierInputRef.current = element;
                    }}
                    value={value ?? ""}
                    onChange={(e) => onChange(projectIdentifierSanitizer(e.target.value).toUpperCase())}
                    placeholder={t("project_settings.general.enter_project_id")}
                    aria-label={t("workspace_projects.fields.identifier")}
                    className={cn(CHIP_VALUE_CLASS, "w-28 outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-placeholder")}
                  />
                  <button
                    type="button"
                    aria-label={t("workspace_projects.fields.identifier")}
                    onClick={() => identifierInputRef.current?.focus()}
                    className="grid h-full w-7 place-items-center border-l border-subtle-1 text-placeholder hover:text-primary"
                  >
                    <Pencil className="size-3" aria-hidden="true" />
                  </button>
                </label>
              )}
            />
            <CreatedOn project={project} />
          </div>
          {errors.identifier?.message ? <ModalInlineError message={errors.identifier.message} /> : null}
        </>
      }
      aside={<ProjectNetworkSegmented control={control} />}
    />
  );
}

// ---- 成员只读 ----
export function ProjectSettingsIdentityReadOnly({ project }: { project: IProject }) {
  const { t } = useTranslation();
  const network = NETWORK_CHOICES.find((choice) => choice.key === project.network);
  return (
    <IdentityLayout
      tile={
        <span className={cn("grid place-items-center", TILE_CLASS)}>
          <Logo logo={project.logo_props} size={LOGO_SIZE} />
        </span>
      }
      main={
        <>
          <h1 className={cn(NAME_CLASS, "truncate py-0.5")}>{project.name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-13 text-tertiary">
            <span className={cn(CHIP_CLASS, "h-7")}>
              <span className={CHIP_PREFIX_CLASS}>ID</span>
              <span className={cn(CHIP_VALUE_CLASS, "flex items-center")}>{project.identifier}</span>
            </span>
            {network ? (
              <span className="inline-flex items-center gap-1.5">
                <ProjectNetworkIcon iconKey={network.iconKey} className="size-3.5" />
                {t(network.i18n_label)}
              </span>
            ) : null}
            <CreatedOn project={project} />
          </div>
        </>
      }
      aside={
        <span className="inline-flex h-7.5 items-center gap-1.5 rounded-lg bg-layer-2 px-3 text-13 font-medium text-secondary">
          <Lock className="size-3.5 text-placeholder" aria-hidden="true" />
          {t("project_settings.general.readonly_hint")}
        </span>
      }
    />
  );
}
