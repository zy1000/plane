/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { ETabIndices } from "@plane/constants";
// types
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { ICycle } from "@plane/types";
// ui
import { Input } from "@plane/ui";
import { getDate, renderFormattedPayloadDate, getTabIndex } from "@plane/utils";
// components
import { CycleRichTextEditor } from "@/components/cycles/cycle-rich-text-editor";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
// hooks
import { useUser } from "@/hooks/store/user/user-user";

type Props = {
  handleFormSubmit: (values: Partial<ICycle>) => Promise<void>;
  handleClose: () => void;
  status: boolean;
  workspaceSlug: string;
  projectId: string;
  setActiveProject: (projectId: string) => void;
  data?: ICycle | null;
  isMobile?: boolean;
};

const defaultValues: Partial<ICycle> = {
  name: "",
  description: "",
  suggested_test_scope: "",
  start_date: null,
  end_date: null,
};

const cycleFormEditorContainerClassName =
  "min-h-56 !pl-8 rounded-md border-[0.5px] border-subtle-1 bg-layer-2 text-14";

export function CycleForm(props: Props) {
  const { handleFormSubmit, handleClose, status, workspaceSlug, projectId, setActiveProject, data, isMobile = false } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  // form data
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    control,
    reset,
    watch,
  } = useForm<ICycle>({
    defaultValues: {
      project_id: projectId,
      name: data?.name || "",
      description: data?.description || "",
      suggested_test_scope: data?.suggested_test_scope || "",
      start_date: data?.start_date || null,
      end_date: data?.end_date || null,
    },
  });

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CYCLE, isMobile);

  useEffect(() => {
    reset({
      ...defaultValues,
      ...data,
    });
  }, [data, reset]);

  const selectedProjectId = String(watch("project_id") ?? projectId ?? "");
  const cycleFormEditorId = data?.id ?? "new";

  return (
    <form onSubmit={handleSubmit((formData) => handleFormSubmit(formData))}>
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-x-3">
          {!status && (
            <Controller
              control={control}
              name="project_id"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <ProjectDropdown
                    value={value}
                    onChange={(val) => {
                      if (!Array.isArray(val)) {
                        onChange(val);
                        setActiveProject(val);
                      }
                    }}
                    multiple={false}
                    buttonVariant="border-with-text"
                    renderCondition={(projectId) => !!projectsWithCreatePermissions?.[projectId]}
                    tabIndex={getIndex("cover_image")}
                  />
                </div>
              )}
            />
          )}
          <h3 className="text-18 font-medium text-secondary">
            {status ? t("project_cycles.update_cycle") : t("project_cycles.create_cycle")}
          </h3>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Controller
              name="name"
              control={control}
              rules={{
                required: t("title_is_required"),
                maxLength: {
                  value: 255,
                  message: t("title_should_be_less_than_255_characters"),
                },
              }}
              render={({ field: { value, onChange } }) => (
                <Input
                  name="name"
                  type="text"
                  placeholder={t("title")}
                  className="w-full text-14"
                  value={value}
                  inputSize="md"
                  onChange={onChange}
                  hasError={Boolean(errors?.name)}
                  tabIndex={getIndex("description")}
                  autoFocus
                />
              )}
            />
            <span className="text-11 text-danger-primary">{errors?.name?.message}</span>
          </div>
          <div>
            <Controller
              name="description"
              control={control}
              render={({ field: { value, onChange } }) => (
                <CycleRichTextEditor
                  workspaceSlug={workspaceSlug}
                  projectId={selectedProjectId}
                  editorId={`cycle-form-description-${cycleFormEditorId}`}
                  initialValue={value}
                  editable
                  dragDropEnabled={false}
                  onChange={onChange}
                  placeholder={t("description")}
                  containerClassName={cycleFormEditorContainerClassName}
                />
              )}
            />
          </div>
          <div>
            <Controller
              name="suggested_test_scope"
              control={control}
              render={({ field: { value, onChange } }) => (
                <CycleRichTextEditor
                  workspaceSlug={workspaceSlug}
                  projectId={selectedProjectId}
                  editorId={`cycle-form-suggested-test-scope-${cycleFormEditorId}`}
                  initialValue={value}
                  editable
                  dragDropEnabled={false}
                  onChange={onChange}
                  placeholder="建议测试范围"
                  containerClassName={cycleFormEditorContainerClassName}
                />
              )}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="space-y-1">
              <Controller
                control={control}
                name="start_date"
                render={({ field: { value: startDateValue, onChange: onChangeStartDate } }) => (
                  <Controller
                    control={control}
                    name="end_date"
                    rules={{
                      required: t("end_date_is_required"),
                    }}
                    render={({ field: { value: endDateValue, onChange: onChangeEndDate } }) => (
                      <DateRangeDropdown
                        buttonVariant="border-with-text"
                        className="h-7"
                        buttonClassName={errors?.end_date ? "border-danger-strong" : ""}
                        minDate={new Date()}
                        value={{
                          from: getDate(startDateValue),
                          to: getDate(endDateValue),
                        }}
                        onSelect={(val) => {
                          onChangeStartDate(val?.from ? renderFormattedPayloadDate(val.from) : null);
                          onChangeEndDate(val?.to ? renderFormattedPayloadDate(val.to) : null);
                        }}
                        placeholder={{
                          from: "Start date",
                          to: "End date",
                        }}
                        hideIcon={{
                          to: true,
                        }}
                        tabIndex={getIndex("date_range")}
                      />
                    )}
                  />
                )}
              />
              <span className="text-11 text-danger-primary">{errors?.end_date?.message}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" size="lg" onClick={handleClose} tabIndex={getIndex("cancel")}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" size="lg" type="submit" loading={isSubmitting} tabIndex={getIndex("submit")}>
          {data
            ? isSubmitting
              ? t("common.updating")
              : t("project_cycles.update_cycle")
            : isSubmitting
              ? t("common.creating")
              : t("project_cycles.create_cycle")}
        </Button>
      </div>
    </form>
  );
}
