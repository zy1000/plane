/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type { TTimesheetCategoryDetail } from "@/services/issue/timesheet.service";

export type TTimesheetCategory = TTimesheetCategoryDetail;

export class TimesheetCategoryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(): Promise<TTimesheetCategory[]> {
    return this.get(`/api/timesheet-categories/`)
      .then((response) => {
        const data = response?.data;
        return Array.isArray(data) ? data : (data?.results ?? []);
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
