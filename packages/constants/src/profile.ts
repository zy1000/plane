/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { EStartOfTheWeek } from "@plane/types";

export const PROFILE_VIEWER_TAB = [
  {
    key: "summary",
    route: "",
    i18n_label: "profile.tabs.summary",
    selected: "/",
  },
];

export const PROFILE_ADMINS_TAB = [
  {
    key: "pending",
    route: "pending",
    i18n_label: "profile.tabs.pending",
    selected: "/pending/",
  },
  {
    key: "processed",
    route: "processed",
    i18n_label: "profile.tabs.processed",
    selected: "/processed/",
  },
  {
    key: "initiated",
    route: "initiated",
    i18n_label: "profile.tabs.initiated",
    selected: "/initiated/",
  },
];

export const PREFERENCE_OPTIONS: {
  id: string;
  title: string;
  description: string;
}[] = [
  {
    id: "theme",
    title: "theme",
    description: "select_or_customize_your_interface_color_scheme",
  },
];

/**
 * @description The options for the start of the week
 * @type {Array<{value: EStartOfTheWeek, label: string}>}
 * @constant
 */
export const START_OF_THE_WEEK_OPTIONS = [
  {
    value: EStartOfTheWeek.SUNDAY,
    label: "Sunday",
  },
  {
    value: EStartOfTheWeek.MONDAY,
    label: "Monday",
  },
  {
    value: EStartOfTheWeek.TUESDAY,
    label: "Tuesday",
  },
  {
    value: EStartOfTheWeek.WEDNESDAY,
    label: "Wednesday",
  },
  {
    value: EStartOfTheWeek.THURSDAY,
    label: "Thursday",
  },
  {
    value: EStartOfTheWeek.FRIDAY,
    label: "Friday",
  },
  {
    value: EStartOfTheWeek.SATURDAY,
    label: "Saturday",
  },
];
