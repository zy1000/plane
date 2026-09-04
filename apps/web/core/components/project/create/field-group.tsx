/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { FormFieldGroup } from "@/components/common/form-section";
import type { TFormFieldGroupProps } from "@/components/common/form-section";

/** 创建弹窗的字段分组：组名靠左一列（与首行控件顶对齐），字段靠右；组与组之间一条分隔线 */
export function ProjectCreateFieldGroup(props: TFormFieldGroupProps) {
  return <FormFieldGroup {...props} />;
}
