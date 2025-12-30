"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Milestone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
// ui
import { Header, Breadcrumbs } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { useUserPermissions } from "@/hooks/store/user";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

const getMilestoneNameCacheKey = (workspaceSlug: string, projectId: string, milestoneId: string) =>
  `milestoneName:${workspaceSlug}:${projectId}:${milestoneId}`;

const OPEN_ADD_ISSUES_MODAL_EVENT = "milestone-issues:add-issues-modal:open";

export const MilestoneIssuesHeader = observer(function MilestoneIssuesHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId, milestoneId } = useParams();
  const [milestoneName, setMilestoneName] = useState<string | null>(null);
  const { currentProjectDetails, loader } = useProject();
  const { allowPermissions } = useUserPermissions();

  const milestoneNameKey = useMemo(() => {
    const ws = String(workspaceSlug ?? "");
    const pid = String(projectId ?? "");
    const mid = String(milestoneId ?? "");
    if (!ws || !pid || !mid) return null;
    return getMilestoneNameCacheKey(ws, pid, mid);
  }, [workspaceSlug, projectId, milestoneId]);

  const canAddIssues = useMemo(() => {
    if (!workspaceSlug || !projectId) return false;
    return allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug.toString(),
      projectId.toString()
    );
  }, [allowPermissions, workspaceSlug, projectId]);

  useEffect(() => {
    if (!milestoneNameKey) return;
    try {
      const cached = window.sessionStorage.getItem(milestoneNameKey);
      setMilestoneName(cached || null);
    } catch {
      setMilestoneName(null);
    }
  }, [milestoneNameKey]);

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="里程碑"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/milestones`}
                icon={<Milestone className="h-4 w-4 text-custom-text-300" />}
              />
            }
          />
          <Breadcrumbs.Item component={<BreadcrumbLink label={milestoneName || "关联工作项"} isLast />} isLast />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        {canAddIssues ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_ADD_ISSUES_MODAL_EVENT))}
          >
            关联工作项
          </Button>
        ) : null}
      </Header.RightItem>
    </Header>
  );
});
