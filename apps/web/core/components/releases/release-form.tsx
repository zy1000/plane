/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IRelease } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { getDate, renderFormattedPayloadDate, getTabIndex } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ReleaseStatusSelect } from "@/components/releases/release-status-select";

type Props = {
  handleFormSubmit: (values: Partial<IRelease>, dirtyFields: object) => Promise<void>;
  handleClose: () => void;
  isUpdate: boolean;
  projectId: string;
  data?: IRelease;
  isMobile?: boolean;
};

const defaultValues: Partial<IRelease> = {
  name: "",
  description: "",
  status: "not-started",
  lead_id: null,
  member_ids: [],
  test_handoff_date: null,
};

export function ReleaseForm(props: Props) {
  const { handleFormSubmit, handleClose, isUpdate, projectId, data, isMobile = false } = props;
  const {
    formState: { errors, isSubmitting, dirtyFields },
    handleSubmit,
    control,
    reset,
  } = useForm<IRelease>({
    defaultValues: {
      name: data?.name || "",
      description: data?.description || "",
      status: data?.status || "not-started",
      lead_id: data?.lead_id ?? null,
      member_ids: data?.member_ids || [],
      start_date: data?.start_date ?? null,
      target_date: data?.target_date ?? null,
      test_handoff_date: data?.test_handoff_date ?? null,
    },
  });

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_MODULE, isMobile);
  const { t } = useTranslation();

  const handleCreateUpdate = async (formData: Partial<IRelease>) => {
    const status = formData.status ?? data?.status ?? "not-started";
    await handleFormSubmit({ ...formData, status }, dirtyFields);
    reset({ ...defaultValues });
  };

  useEffect(() => {
    reset({
      ...defaultValues,
      ...data,
    });
  }, [data, reset]);

  return (
    <form onSubmit={handleSubmit(handleCreateUpdate)}>
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-x-3">
          <h3 className="text-18 font-medium text-secondary">
            {isUpdate ? t("common.update") : t("common.create")}
            {t("sidebar.releases")}
          </h3>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Controller
              control={control}
              name="name"
              rules={{
                required: t("title_is_required"),
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
                  onChange={onChange}
                  hasError={Boolean(errors?.name)}
                  placeholder={t("title")}
                  className="w-full text-14"
                  tabIndex={getIndex("name")}
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
                <TextArea
                  id="description"
                  name="description"
                  value={value}
                  onChange={onChange}
                  placeholder={t("description")}
                  className="min-h-24 w-full resize-none text-14"
                  hasError={Boolean(errors?.description)}
                  tabIndex={getIndex("description")}
                />
              )}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isUpdate && (
              <div className="h-7">
                <ReleaseStatusSelect control={control} error={errors?.status} tabIndex={getIndex("status")} />
              </div>
            )}
            <Controller
              control={control}
              name="start_date"
              render={({ field: { value: startDateValue, onChange: onChangeStartDate } }) => (
                <Controller
                  control={control}
                  name="target_date"
                  render={({ field: { value: endDateValue, onChange: onChangeEndDate } }) => (
                    <DateRangeDropdown
                      buttonVariant="border-with-text"
                      className="h-7"
                      value={{
                        from: getDate(startDateValue),
                        to: getDate(endDateValue),
                      }}
                      onSelect={(val) => {
                        onChangeStartDate(val?.from ? renderFormattedPayloadDate(val.from) : null);
                        onChangeEndDate(val?.to ? renderFormattedPayloadDate(val.to) : null);
                      }}
                      placeholder={{
                        from: t("start_date"),
                        to: t("end_date"),
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
            <Controller
              control={control}
              name="test_handoff_date"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <DateDropdown
                    buttonVariant="border-with-text"
                    value={getDate(value)}
                    onChange={(val) => onChange(val ? renderFormattedPayloadDate(val) : null)}
                    placeholder={t("test_handoff_date")}
                    hideIcon
                    tabIndex={getIndex("test_handoff_date")}
                  />
                </div>
              )}
            />
            <Controller
              control={control}
              name="lead_id"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <MemberDropdown
                    value={value}
                    onChange={onChange}
                    projectId={projectId}
                    multiple={false}
                    buttonVariant="border-with-text"
                    placeholder={t("lead")}
                    tabIndex={getIndex("lead")}
                  />
                </div>
              )}
            />
            <Controller
              control={control}
              name="member_ids"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <MemberDropdown
                    value={value}
                    onChange={onChange}
                    projectId={projectId}
                    multiple
                    buttonVariant={value && value.length > 0 ? "transparent-without-text" : "border-with-text"}
                    buttonClassName={value && value.length > 0 ? "hover:bg-transparent px-0" : ""}
                    placeholder={t("members")}
                    tabIndex={getIndex("member_ids")}
                  />
                </div>
              )}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" size="lg" onClick={handleClose} tabIndex={getIndex("cancel")}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="lg" type="submit" loading={isSubmitting} tabIndex={getIndex("submit")}>
          {isUpdate
            ? isSubmitting
              ? t("updating")
              : t("common.update")
            : isSubmitting
              ? t("creating")
              : t("common.create")}
        </Button>
      </div>
    </form>
  );
}
