/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { START_OF_THE_WEEK_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EStartOfTheWeek } from "@plane/types";
import { CustomSelect } from "@plane/ui";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useUserProfile } from "@/hooks/store/user";

const START_OF_WEEK_I18N_KEYS: Record<EStartOfTheWeek, string> = {
  [EStartOfTheWeek.SUNDAY]: "weekdays.sunday",
  [EStartOfTheWeek.MONDAY]: "weekdays.monday",
  [EStartOfTheWeek.TUESDAY]: "weekdays.tuesday",
  [EStartOfTheWeek.WEDNESDAY]: "weekdays.wednesday",
  [EStartOfTheWeek.THURSDAY]: "weekdays.thursday",
  [EStartOfTheWeek.FRIDAY]: "weekdays.friday",
  [EStartOfTheWeek.SATURDAY]: "weekdays.saturday",
};

export const StartOfWeekPreference = observer(function StartOfWeekPreference(props: {
  option: { title: string; description: string };
}) {
  // hooks
  const { data: userProfile, updateUserProfile } = useUserProfile();
  const { t } = useTranslation();

  const getStartOfWeekLabel = (startOfWeek: EStartOfTheWeek) => t(START_OF_WEEK_I18N_KEYS[startOfWeek]);

  const handleStartOfWeekChange = async (val: number) => {
    try {
      await updateUserProfile({ start_of_the_week: val });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "First day of the week updated successfully" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Update failed", message: "Please try again later." });
    }
  };

  return (
    <SettingsControlItem
      title={props.option.title}
      description={props.option.description}
      control={
        <CustomSelect
          value={userProfile.start_of_the_week}
          label={getStartOfWeekLabel(userProfile.start_of_the_week)}
          onChange={handleStartOfWeekChange}
          buttonClassName="border border-subtle-1"
          input
          maxHeight="lg"
          placement="bottom-end"
        >
          <>
            {START_OF_THE_WEEK_OPTIONS.map((day) => (
              <CustomSelect.Option key={day.value} value={day.value}>
                {t(START_OF_WEEK_I18N_KEYS[day.value])}
              </CustomSelect.Option>
            ))}
          </>
        </CustomSelect>
      }
    />
  );
});
