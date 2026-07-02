/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RANDOM_EMOJI_CODES } from "@plane/constants";
import type { IProject } from "@plane/types";
import { getRandomCoverImage } from "@/helpers/cover-image.helper";

export const getProjectFormValues = (projectLead?: string | null): Partial<IProject> => ({
  cover_image_url: getRandomCoverImage(),
  description: "",
  logo_props: {
    in_use: "emoji",
    emoji: {
      value: RANDOM_EMOJI_CODES[Math.floor(Math.random() * RANDOM_EMOJI_CODES.length)],
    },
  },
  identifier: "",
  name: "",
  grade: null,
  product_type: null,
  network: 0,
  project_lead: projectLead ?? null,
  /** 创建时默认开启全部项目特性，跳过创建后选择特性的环节 */
  cycle_view: true,
  module_view: true,
  issue_views_view: true,
  page_view: true,
  inbox_view: true,
});
