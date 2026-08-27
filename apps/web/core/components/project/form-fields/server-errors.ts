/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { UseFormSetError } from "react-hook-form";
import type { TProject } from "@/plane-web/types/projects";
import { PROJECT_FORM_FIELD_KEYS, PROJECT_SERVER_ERROR_I18N, getProjectFieldLabelKey } from "./constants";

/** DRF 对必填字段的三种报错文案 */
const SERVER_REQUIRED_PATTERN = /required|may not be null|may not be blank/i;
/** PrimaryKeyRelatedField 找不到对象 / 值不合法 */
const SERVER_INVALID_PK_PATTERN = /does not exist|invalid pk|is not a valid/i;

type TTranslate = (key: string, params?: Record<string, unknown>) => string;

/**
 * 把后端的字段级错误 `{ field: [code] }` 写进 react-hook-form 的行内错误。
 * 返回 true 表示至少命中了一个表单字段，调用方不必再 toast。
 */
export const applyProjectServerErrors = (body: unknown, setError: UseFormSetError<TProject>, t: TTranslate) => {
  if (!body || typeof body !== "object") return false;
  const payload = body as Record<string, unknown>;
  let handled = false;
  for (const key of PROJECT_FORM_FIELD_KEYS) {
    const raw = payload[key];
    const code = Array.isArray(raw) ? raw[0] : raw;
    if (typeof code !== "string" || !code) continue;
    const field = t(getProjectFieldLabelKey(key));
    const i18nKey = PROJECT_SERVER_ERROR_I18N[code];
    const message = i18nKey
      ? t(i18nKey)
      : SERVER_REQUIRED_PATTERN.test(code)
        ? t("workspace_projects.validation.required", { field })
        : SERVER_INVALID_PK_PATTERN.test(code)
          ? t("workspace_projects.validation.invalid_option")
          : code;
    setError(key, { type: "server", message });
    handled = true;
  }
  return handled;
};
