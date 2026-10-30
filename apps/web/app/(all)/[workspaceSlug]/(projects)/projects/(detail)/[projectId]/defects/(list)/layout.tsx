/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { ContentWrapper } from "@/components/core/content-wrapper";

/** 页头那一行已并进视图页签栏（DefectListRoot 把工具栏放在 ViewTabsRoot 的 trailing 里） */
export default function ProjectDefectsLayout() {
  return (
    <ContentWrapper>
      <Outlet />
    </ContentWrapper>
  );
}
