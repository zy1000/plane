/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { TypedProjectLayoutRoot } from "@/components/issues/issue-layouts/roots/typed-project-layout-root";
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectDefectsPage({ params }: Route.ComponentProps) {
  const { projectId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();

  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - ${t("sidebar.defects")}` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full">
        <TypedProjectLayoutRoot variant="defects" />
      </div>
    </>
  );
}

export default observer(ProjectDefectsPage);
