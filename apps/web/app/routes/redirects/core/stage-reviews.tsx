/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/stage-reviews";

/** 阶段评审并入「评审」标签后的旧路径：/stage-reviews/* → /reviews/stage-reviews/* */
export const clientLoader = ({ params, request }: Route.ClientLoaderArgs) => {
  const { workspaceSlug, projectId } = params;
  const splat = params["*"] || "";
  const search = new URL(request.url).search;
  const destination = `/${workspaceSlug}/projects/${projectId}/reviews/stage-reviews${splat ? `/${splat}` : ""}${search}`;
  throw redirect(destination);
};

export default function StageReviewsRedirect() {
  return null;
}
