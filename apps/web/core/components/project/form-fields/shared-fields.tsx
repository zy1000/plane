/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TTranslationStore } from "@plane/i18n";
import { getDate } from "@plane/utils";

/**
 * 完成日期不早于开始日期。minDate 挡住日历里的选择；用户先选完成日期再把开始日期改晚时靠这里兜。
 * 创建弹窗（属性行）与设置页（分组布局）各自拼日期字段，校验共用这一处。
 */
export const validateEndDate =
  (startDate: Date | undefined, t: TTranslationStore["t"]) =>
  (value: string | null | undefined): true | string => {
    const end = getDate(value);
    return startDate && end && end < startDate ? t("workspace_projects.validation.end_before_start") : true;
  };
