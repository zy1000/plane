/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/requirement-types";

/**
 * 需求类型从「模板管理」搬到工作区设置后的旧路径兜底。
 *
 * /templates/requirements 与 /templates/requirement-types 先后都当过侧边栏的落地页，
 * 一定还留在用户的书签与历史里；更早的 /templates/requirements/:id/edit 也在这里一并吞掉。
 */
export const clientLoader = ({ params, request }: Route.ClientLoaderArgs) => {
  const { workspaceSlug } = params;
  const rest = (params["*"] ?? "").replace(/\/?edit\/?$/, "");
  const { search } = new URL(request.url);
  throw redirect(`/${workspaceSlug}/settings/requirement-types${rest ? `/${rest}` : ""}${search}`);
};

export default function RequirementTypesRedirect() {
  return null;
}
