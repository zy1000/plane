import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { EIssuesStoreType } from "@plane/types";
import { Header } from "@plane/ui";
import { HeaderFilters } from "@/components/issues/filters";
import { BugIssueModal } from "@/components/issues/issue-modal/bug-modal";
import { PROJECT_DEFECTS_REFRESH_EVENT, useProjectDefects } from "@/hooks/store/use-project-defects";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { PROJECT_DEFECT_FILTER_TOGGLE_EVENT } from "./defect-filter-events";
import { DefectQuickFilterBar, DEFECT_PRESET_PARAM, getDefectPreset } from "./defect-quick-filter-bar";
import type { TDefectPreset } from "./defect-quick-filter-bar";

export const ProjectDefectsHeader = observer(function ProjectDefectsHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceSlugValue = workspaceSlug?.toString();
  const projectIdValue = projectId?.toString();
  const preset = getDefectPreset(searchParams.get(DEFECT_PRESET_PARAM));
  const { currentProjectDetails } = useProject();
  const { allowPermissions } = useUserPermissions();
  const { issues } = useIssues(EIssuesStoreType.PROJECT);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const defects = useProjectDefects(workspaceSlugValue, projectIdValue, { includeList: false });

  const canCreateDefect =
    workspaceSlugValue && projectIdValue
      ? allowPermissions(
          [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
          EUserPermissionsLevel.PROJECT,
          workspaceSlugValue,
          projectIdValue
        )
      : false;
  const handleFilterToggle = useCallback(() => {
    if (!projectIdValue) return;
    window.dispatchEvent(
      new CustomEvent(PROJECT_DEFECT_FILTER_TOGGLE_EVENT, {
        detail: { entityId: `${projectIdValue}_defects` },
      })
    );
  }, [projectIdValue]);
  const handlePresetChange = useCallback(
    (next: TDefectPreset) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete(DEFECT_PRESET_PARAM);
      else params.set(DEFECT_PRESET_PARAM, next);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, router, pathname]
  );

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex max-w-full flex-wrap items-center gap-2.5">
          <DefectQuickFilterBar value={preset} onChange={handlePresetChange} variant="header" />
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        {workspaceSlugValue && projectIdValue ? (
          <div className="hidden items-center gap-2 md:flex">
            <HeaderFilters
              projectId={projectIdValue}
              workspaceSlug={workspaceSlugValue}
              currentProjectDetails={currentProjectDetails}
              canUserCreateIssue={canCreateDefect}
              scope="defects"
              onFilterToggle={handleFilterToggle}
            />
          </div>
        ) : null}
        {canCreateDefect && workspaceSlugValue && projectIdValue ? (
          <Button variant="primary" size="lg" onClick={() => setIsCreateModalOpen(true)}>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Plus className="h-3.5 w-3.5" />
              新增缺陷
            </span>
            <span className="sm:hidden">新增</span>
          </Button>
        ) : null}
        {workspaceSlugValue && projectIdValue ? (
          <BugIssueModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            modalTitle="新增缺陷"
            data={{ project_id: projectIdValue }}
            isProjectSelectionDisabled
            allowedProjectIds={[projectIdValue]}
            onSubmit={async () => {
              setIsCreateModalOpen(false);
              // 刷新缺陷列表（MobX defects scope）与顶部指标条统计
              await issues.fetchIssuesWithExistingPagination(workspaceSlugValue, projectIdValue, "mutation", "defects");
              defects.refetch();
              window.dispatchEvent(new Event(PROJECT_DEFECTS_REFRESH_EVENT));
            }}
          />
        ) : null}
      </Header.RightItem>
    </Header>
  );
});
