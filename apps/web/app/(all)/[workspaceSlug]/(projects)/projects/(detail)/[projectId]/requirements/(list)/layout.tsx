/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";

/**
 * 不包页头也不包 ContentWrapper：页头那一行已并进视图页签栏（页面把网格工具栏挂在
 * ViewTabsRoot 的 trailing 里）；页面自己铺一层带 `flex min-h-0 flex-col overflow-hidden`
 * 的容器，网格靠它才能正确算出可滚动高度。与产品需求页的做法一致。
 */
export default function ProjectRequirementsLayout() {
  return <Outlet />;
}
