/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { Control, FieldArrayWithId, FormState } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import type { IWorkspaceRole } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { WorkspaceRoleMultiSelectField } from "@/components/workspace/settings/workspace-role-multi-select-field";
import type { InvitationFormValues } from "@/hooks/use-workspace-invitation";
// local imports
import { InvitationEmailCombobox } from "./email-combobox";

type TInvitationFieldsProps = {
  workspaceSlug: string;
  fields: FieldArrayWithId<InvitationFormValues, "emails", "id">[];
  control: Control<InvitationFormValues>;
  formState: FormState<InvitationFormValues>;
  remove: (index: number) => void;
  roles: IWorkspaceRole[];
  isRolesLoading: boolean;
  className?: string;
};

export const InvitationFields = observer(function InvitationFields(props: TInvitationFieldsProps) {
  const {
    workspaceSlug,
    fields,
    control,
    formState: { errors },
    remove,
    roles,
    isRolesLoading,
    className,
  } = props;
  // plane hooks
  const { t } = useTranslation();
  // 其他行已填写的邮箱，从当前行的下拉候选里排除
  const watchedEmails = useWatch({ control, name: "emails" });
  return (
    <div className={cn("mb-3 space-y-4", className)}>
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="group relative mb-1 flex w-full items-start justify-between gap-x-4 text-body-xs-regular"
        >
          <div className="w-full">
            <Controller
              control={control}
              name={`emails.${index}.email`}
              rules={{
                required: t("workspace_settings.settings.members.modal.errors.required"),
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: t("workspace_settings.settings.members.modal.errors.invalid"),
                },
              }}
              render={({ field: { value, onChange, ref } }) => (
                <>
                  <InvitationEmailCombobox
                    workspaceSlug={workspaceSlug}
                    id={`emails.${index}.email`}
                    name={`emails.${index}.email`}
                    value={value}
                    onChange={onChange}
                    inputRef={ref}
                    hasError={Boolean(errors.emails?.[index]?.email)}
                    placeholder={t("workspace_settings.settings.members.modal.placeholder")}
                    excludeEmails={watchedEmails
                      .filter((_, emailIndex) => emailIndex !== index)
                      .map((item) => item.email)
                      .filter(Boolean)}
                  />
                  {errors.emails?.[index]?.email && (
                    <span className="ml-1 text-caption-sm-regular text-danger-primary">
                      {errors.emails?.[index]?.email?.message}
                    </span>
                  )}
                </>
              )}
            />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <Controller
                control={control}
                name={`emails.${index}.custom_role_ids`}
                rules={{ validate: (value) => value.length > 0 || "请选择角色" }}
                render={({ field: { value, onChange } }) => (
                  <WorkspaceRoleMultiSelectField
                    roles={roles}
                    isLoading={isRolesLoading}
                    value={value}
                    onChange={onChange}
                    hasError={Boolean(errors.emails?.[index]?.custom_role_ids)}
                    buttonClassName="rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 py-2 text-caption-sm-regular sm:text-body-xs-regular"
                    buttonContainerClassName="w-full"
                    containerClassName="w-40"
                    optionsContainerClassName="w-60"
                  />
                )}
              />
              {errors.emails?.[index]?.custom_role_ids && (
                <span className="ml-1 text-caption-sm-regular text-danger-primary">
                  {errors.emails?.[index]?.custom_role_ids?.message}
                </span>
              )}
            </div>
            {fields.length > 1 && (
              <div className="flex-item flex w-6">
                <button
                  type="button"
                  className="place-items-center self-center rounded-sm"
                  onClick={() => remove(index)}
                >
                  <CloseIcon className="h-4 w-4 text-secondary" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});
