/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext, useContext, type ReactNode } from "react";
import { EActivityTab } from "@plane/constants";

/**
 * 为 activity block 提供当前所在的 Tab 上下文。
 * 活动列表中的 action 组件（state / parent / link 等）需要根据当前 Tab
 * 决定是否渲染「旧值 → 新值」的详情 footer：仅在「活动」Tab 下隐藏 footer，
 * 在「全部 / 转换 / 历史」等 Tab 下保留。
 */
const ActivityTabContext = createContext<EActivityTab | undefined>(undefined);

export function ActivityTabProvider(props: { value: EActivityTab; children: ReactNode }) {
  const { value, children } = props;
  return <ActivityTabContext.Provider value={value}>{children}</ActivityTabContext.Provider>;
}

export function useActivityTab(): EActivityTab | undefined {
  return useContext(ActivityTabContext);
}

export function shouldHideActivityChangeFooter(tab: EActivityTab | undefined): boolean {
  return tab === EActivityTab.ACTIVITY;
}
