/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { Outlet } from "react-router";
import { ContentWrapper } from "@/components/core/content-wrapper";

// 「添加笔记」在正文「公开 / 私有 / 已归档」页签行的右端，不再单独占一行页头
export default function ProjectPagesListLayout() {
  return (
    <ContentWrapper>
      <Outlet />
    </ContentWrapper>
  );
}
