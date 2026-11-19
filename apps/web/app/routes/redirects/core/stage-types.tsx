/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/stage-types";

/**
 * 阶段类型原来在工作区设置（/settings/stage-types），挪进模板中心后旧地址还留在书签与历史里，
 * 统一跳到 /templates/stage-types。
 */
export const clientLoader = ({ params, request }: Route.ClientLoaderArgs) => {
  const { search } = new URL(request.url);
  throw redirect(`/${params.workspaceSlug}/templates/stage-types${search}`);
};

export default function StageTypesRedirect() {
  return null;
}
