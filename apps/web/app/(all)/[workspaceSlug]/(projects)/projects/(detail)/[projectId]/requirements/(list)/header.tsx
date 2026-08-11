/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { BookOpenText, Info } from "lucide-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

/**
 * 项目需求页的页头。
 *
 * 右侧不放操作：关联/解除关联/搜索都是对当前这批行的操作，跟着网格的工具栏走
 * （网格把它 portal 到筛选行右侧），放在页头会离作用对象太远。这里只留一句只读说明
 * —— 它是常驻的语境，不该占筛选行的横向空间。
 */
export const ProjectRequirementsHeader = observer(function ProjectRequirementsHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { currentProjectDetails, loader } = useProject();

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t("project_requirements.title")}
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/requirements/`}
                icon={<BookOpenText className="h-4 w-4 text-secondary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        <Tooltip tooltipContent={t("project_requirements.readonly_hint")}>
          <span className="hidden items-center gap-1 text-12 text-tertiary lg:inline-flex">
            <Info className="size-3.5 shrink-0" />
            <span className="max-w-80 truncate">{t("project_requirements.readonly_hint")}</span>
          </span>
        </Tooltip>
      </Header.RightItem>
    </Header>
  );
});
