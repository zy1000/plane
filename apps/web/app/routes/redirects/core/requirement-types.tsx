/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/requirement-types";

/**
 * 需求类型的旧路径兜底，统一跳到模板中心的 /templates/requirement-types。
 *
 * /templates/requirements 与 /settings/requirement-types 先后都当过入口，一定还留在用户的
 * 书签与历史里；更早的 /templates/requirements/:id/edit 也在这里一并吞掉。
 */
export const clientLoader = ({ params, request }: Route.ClientLoaderArgs) => {
  const { workspaceSlug } = params;
  const rest = (params["*"] ?? "").replace(/\/?edit\/?$/, "");
  const { search } = new URL(request.url);
  throw redirect(`/${workspaceSlug}/templates/requirement-types${rest ? `/${rest}` : ""}${search}`);
};

export default function RequirementTypesRedirect() {
  return null;
}
