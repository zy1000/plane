/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext, useContext } from "react";

/**
 * 列表外观。个人主页（工作项 / 缺陷）用列对齐的行 + 列头、分组栏常驻空组；
 * 其他页面不提供这个上下文，保持原样。
 */
export type TListAppearance = {
  variant: "profile";
  /** 空分组提示里的实体名，如「工作项」「缺陷」 */
  entityLabel: string;
};

export const ListAppearanceContext = createContext<TListAppearance | null>(null);

export const useListAppearance = () => useContext(ListAppearanceContext);
