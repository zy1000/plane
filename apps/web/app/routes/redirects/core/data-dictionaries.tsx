/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/data-dictionaries";

/**
 * 数据字典原来在工作区设置（/settings/data-dictionaries），挪进模板中心后旧地址还留在书签与历史里，
 * 统一跳到 /templates/data-dictionaries。
 * 字段表单「前往数据字典」带的 ?dictionary=<id> 原样带过去。
 */
export const clientLoader = ({ params, request }: Route.ClientLoaderArgs) => {
  const { search } = new URL(request.url);
  throw redirect(`/${params.workspaceSlug}/templates/data-dictionaries${search}`);
};

export default function DataDictionariesRedirect() {
  return null;
}
