/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RANDOM_EMOJI_CODES } from "@plane/constants";
import type { IProject } from "@plane/types";

export const getProjectFormValues = (projectLead?: string | null): Partial<IProject> => ({
  description: "",
  logo_props: {
    in_use: "emoji",
    emoji: {
      value: RANDOM_EMOJI_CODES[Math.floor(Math.random() * RANDOM_EMOJI_CODES.length)],
    },
  },
  identifier: "",
  name: "",
  network: 0,
  project_lead: projectLead ?? null,
  /** 0348 扩展字段：不在 defaultValues 里的键不会进 formData，RHF 的校验也不会跑 */
  code: "",
  business_unit: null,
  product_manager: null,
  status: null,
  project_type: null,
  start_date: null,
  end_date: null,
  /** 创建时默认开启全部项目特性，跳过创建后选择特性的环节 */
  cycle_view: true,
  module_view: true,
  issue_views_view: true,
  page_view: true,
  inbox_view: true,
});
