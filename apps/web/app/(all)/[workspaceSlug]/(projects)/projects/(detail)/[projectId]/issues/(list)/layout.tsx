/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { Outlet } from "react-router";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectIssuesMobileHeader } from "./mobile-header";

/**
 * 页头那一行已并进视图页签栏（ProjectLayoutRoot 把工具栏放在 ViewTabsRoot 的 trailing 里），
 * 这里只剩移动端的工具条。
 */
export default function ProjectIssuesLayout() {
  return (
    <>
      <ProjectIssuesMobileHeader />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
