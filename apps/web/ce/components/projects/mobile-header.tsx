/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { ProjectListHeaderActions } from "@/components/project/header-actions";

export const ProjectsListMobileHeader = observer(function ProjectsListMobileHeader() {
  return (
    <div className="flex w-full items-center justify-end gap-2 border-b border-subtle bg-surface-1 px-3 py-2 md:hidden">
      <ProjectListHeaderActions />
    </div>
  );
});
