/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";

export default function ProjectArchiveReleasesLayout() {
  // 页签栏下直接是「工作项 / 迭代 / 模块 / 发布」归档页签，不再单独一行面包屑
  return (
    <ContentWrapper>
      <Outlet />
    </ContentWrapper>
  );
}
