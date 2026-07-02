"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PanelLeft, Rss } from "lucide-react";
// plane ui
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useProject } from "@/hooks/store/use-project";
// plane web
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

export const OverviewListHeader = observer(() => {
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { currentProjectDetails, loader } = useProject();
  const { canCurrentUserCreatePage } = usePageStore(EPageStoreType.PROJECT);
  const { overviewPeek, overviewSidebarPeek } = useAppTheme();

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs
            workspaceSlug={workspaceSlug?.toString() ?? ""}
            projectId={currentProjectDetails?.id?.toString() ?? ""}
          />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Overview"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/overview`}
                icon={<Rss className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        <button
          className="flex size-6 items-center justify-center rounded-md text-placeholder hover:bg-layer-1 hover:text-accent-primary disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent"
          disabled={!canCurrentUserCreatePage}
          onClick={() => {
            if (!canCurrentUserCreatePage) return;
            overviewSidebarPeek(!overviewPeek);
          }}
        >
          <PanelLeft className="size-4" />
        </button>
      </Header.RightItem>
    </Header>
  );
});
