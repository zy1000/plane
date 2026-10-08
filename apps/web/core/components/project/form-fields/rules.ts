/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RegisterOptions } from "react-hook-form";
import type { IUserLite } from "@plane/types";
import { normalizeUserId } from "./constants";

/**
 * 项目表单各字段的 react-hook-form 校验规则。
 * 设置页的叶子字段（fields.tsx）和创建弹窗的属性行（create/properties.tsx）长得不一样，但校验必须是同一份。
 */

type TRules = Omit<RegisterOptions, "valueAsNumber" | "valueAsDate" | "setValueAs" | "disabled">;

/** 项目代号：去空白后非空 */
export const codeRules = (requiredMessage: string): TRules => ({
  validate: (value: string | null | undefined) => Boolean((value ?? "").trim()) || requiredMessage,
});

/** 字典 FK / 研发模式 / 产品类型：必填时值须为真 */
export const requiredValueRules = (requiredMessage: string | undefined): TRules | undefined =>
  requiredMessage ? { validate: (value: unknown) => Boolean(value) || requiredMessage } : undefined;

/** 人员：project_lead 可能是 IUserLite 对象，先归一到 id 再判空 */
export const memberRules = (requiredMessage: string | undefined): TRules | undefined =>
  requiredMessage
    ? { validate: (value: IUserLite | string | null | undefined) => Boolean(normalizeUserId(value)) || requiredMessage }
    : undefined;

/** 日期：必填校验之后再跑额外校验（如完成日期不早于开始日期） */
export const dateRules = (
  requiredMessage: string | undefined,
  validate?: (value: string | null | undefined) => true | string
): TRules => ({
  validate: (value: string | null | undefined) => {
    if (requiredMessage && !value) return requiredMessage;
    return validate?.(value) ?? true;
  },
});
