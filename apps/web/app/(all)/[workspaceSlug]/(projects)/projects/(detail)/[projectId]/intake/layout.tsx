/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";

// 「添加工作项」在侧栏「打开 / 已关闭」页签行的右端，不再单独占一行页头
export default function ProjectInboxIssuesLayout() {
  return (
    <ContentWrapper>
      <Outlet />
    </ContentWrapper>
  );
}
