"use client";

import { useState, useEffect } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { History, Clock } from "lucide-react";
import { calculateTimeAgo, getFileURL } from "@plane/utils";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

// components
import { ActivityIcon, ActivityMessage, IssueLink } from "@/components/core/activity";
import { RichTextEditor } from "@/components/editor/rich-text";
import { ActivitySettingsLoader } from "@/components/ui/loader/settings/activity";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { SettingsHeading } from "@/components/settings/heading";

// hooks
import { useUser } from "@/hooks/store/user";

// services
import { ProjectService } from "@/services/project/project.service";

// assets
import darkActivityAsset from "@/app/assets/empty-state/profile/activity-dark.webp?url";
import lightActivityAsset from "@/app/assets/empty-state/profile/activity-light.webp?url";

const projectService = new ProjectService();
const PER_PAGE = 30;

type ProjectActivityListPageProps = {
  workspaceSlug: string;
  projectId: string;
  cursor: string;
  perPage: number;
  updateResultsCount: (count: number) => void;
  updateTotalPages: (count: number) => void;
  updateEmptyState: (state: boolean) => void;
};

const ProjectActivityListPage = observer((props: ProjectActivityListPageProps) => {
  const { workspaceSlug, projectId, cursor, perPage, updateResultsCount, updateTotalPages, updateEmptyState } = props;
  const { data: currentUser } = useUser();

  const { data: projectActivity } = useSWR(
    workspaceSlug && projectId ? `PROJECT_ACTIVITY_${workspaceSlug}_${projectId}_${cursor}` : null,
    () =>
      projectService.getProjectActivity(workspaceSlug, {
        project_id: projectId,
        cursor,
        per_page: perPage,
      })
  );

  useEffect(() => {
    if (!projectActivity) return;

    // if no results found then show empty state
    if (projectActivity.total_results === 0) updateEmptyState(true);

    updateTotalPages(projectActivity.total_pages);
    updateResultsCount(projectActivity.results.length);
  }, [updateResultsCount, updateTotalPages, projectActivity, updateEmptyState]);

  if (!projectActivity) return <ActivitySettingsLoader />;

  return (
    <ul role="list">
      {projectActivity.results.map((activityItem: any) => {
        if (activityItem.field === "comment")
          return (
            <div key={activityItem.id} className="mt-2">
              <div className="relative flex items-start space-x-3">
                <div className="relative px-1">
                  {activityItem.field ? (
                    activityItem.new_value === "restore" && <History className="h-3.5 w-3.5 text-custom-text-200" />
                  ) : activityItem.actor_detail.avatar_url && activityItem.actor_detail.avatar_url !== "" ? (
                    <img
                      src={getFileURL(activityItem.actor_detail.avatar_url)}
                      alt={activityItem.actor_detail.display_name}
                      height={30}
                      width={30}
                      className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-gray-500 text-white"
                    />
                  ) : (
                    <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-gray-700 text-xs capitalize text-white">
                      {activityItem.actor_detail.display_name?.[0]}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-custom-text-200">
                    <span className="font-medium text-custom-text-100">{activityItem.actor_detail.display_name}</span>
                    <span className="ml-2 text-xs text-custom-text-400">
                      {calculateTimeAgo(activityItem.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-custom-text-200">
                    <RichTextEditor
                      editable={false}
                      id={activityItem.id}
                      initialValue={
                        activityItem?.new_value !== "" ? activityItem.new_value : activityItem.old_value
                      }
                      containerClassName="text-xs bg-custom-background-100"
                      workspaceId={activityItem?.workspace_detail?.id?.toString() ?? ""}
                      workspaceSlug={activityItem?.workspace_detail?.slug?.toString() ?? ""}
                      projectId={activityItem.project ?? ""}
                    />
                  </div>
                </div>
              </div>
            </div>
          );

        const message = <ActivityMessage activity={activityItem} showIssue />;

        if ("field" in activityItem && activityItem.field !== "updated_by")
          return (
            <li key={activityItem.id}>
              <div className="relative pb-1">
                <div className="relative flex items-start space-x-2">
                  <>
                    <div>
                      <div className="relative px-1.5 mt-4">
                        <div className="mt-1.5">
                          <div className="flex h-6 w-6 items-center justify-center">
                            {activityItem.field ? (
                              activityItem.new_value === "restore" ? (
                                <History className="h-5 w-5 text-custom-text-200" />
                              ) : (
                                <ActivityIcon activity={activityItem} />
                              )
                            ) : activityItem.actor_detail.avatar_url &&
                              activityItem.actor_detail.avatar_url !== "" ? (
                              <img
                                src={getFileURL(activityItem.actor_detail.avatar_url)}
                                alt={activityItem.actor_detail.display_name}
                                height={24}
                                width={24}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-gray-700 text-xs capitalize text-white">
                                {activityItem.actor_detail.display_name?.[0]}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 border-b border-custom-border-100 py-4">
                      <div className="break-words text-sm text-custom-text-200">
                        {activityItem.field === "archived_at" && activityItem.new_value !== "restore" ? (
                          <span className="text-gray font-medium">Plane</span>
                        ) : activityItem.actor_detail.is_bot ? (
                          <span className="text-gray font-medium">{activityItem.actor_detail.first_name} Bot</span>
                        ) : (
                          <Link
                            href={`/${activityItem.workspace_detail?.slug}/profile/${activityItem.actor_detail.id}`}
                            className="inline"
                          >
                            <span className="text-gray font-medium">
                              {currentUser?.id === activityItem.actor_detail.id
                                ? "You"
                                : activityItem.actor_detail.display_name}
                            </span>
                          </Link>
                        )}{" "}
                        <div className="inline gap-1">
                          {message}{" "}
                          <span className="flex-shrink-0 whitespace-nowrap">
                            {calculateTimeAgo(activityItem.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                </div>
              </div>
            </li>
          );
      })}
    </ul>
  );
});

type TProjectActivity = {
  workspaceSlug: string;
  projectId: string;
  disabled?: boolean;
  description?: string;
};

export const ProjectActivity: React.FC<TProjectActivity> = observer((props) => {
  const { workspaceSlug, projectId, description } = props;
  
  // states
  const [pageCount, setPageCount] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [resultsCount, setResultsCount] = useState(0);
  const [isEmpty, setIsEmpty] = useState(false);
  
  // theme hook
  const { resolvedTheme } = useTheme();
  // plane hooks
  const { t } = useTranslation();
  // derived values
  const resolvedPath = resolvedTheme === "light" ? lightActivityAsset : darkActivityAsset;

  const updateTotalPages = (count: number) => setTotalPages(count);

  const updateResultsCount = (count: number) => setResultsCount(count);

  const updateEmptyState = (isEmpty: boolean) => setIsEmpty(isEmpty);

  const handleLoadMore = () => setPageCount((prev) => prev + 1);

  const activityPages: React.ReactNode[] = [];
  for (let i = 0; i < pageCount; i++)
    activityPages.push(
      <ProjectActivityListPage
        key={i}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cursor={`${PER_PAGE}:${i}:0`}
        perPage={PER_PAGE}
        updateResultsCount={updateResultsCount}
        updateTotalPages={updateTotalPages}
        updateEmptyState={updateEmptyState}
      />
    );

  const isLoadMoreVisible = pageCount < totalPages && resultsCount !== 0;

  if (isEmpty) {
    return (
      <div className="flex h-full w-full flex-col">
        <SettingsHeading
          title={t("account_settings.activity.heading")}
          description={description ?? t("account_settings.activity.description")}
        />
        <DetailedEmptyState
          title={""}
          description={""}
          assetPath={resolvedPath}
          className="w-full !p-0 justify-center mx-auto min-h-fit"
          size="md"
        />
      </div>
    );
  }

  return (
    <div className="max-h-[600px] overflow-y-auto">
      <SettingsHeading
        title={t("account_settings.activity.heading")}
        description={description ?? t("account_settings.activity.description")}
      />
      <div className="w-full">{activityPages}</div>
      {isLoadMoreVisible && (
        <div className="flex w-full items-center justify-center text-xs pb-4">
          <Button variant="accent-primary" size="sm" onClick={handleLoadMore}>
            {t("load_more")}
          </Button>
        </div>
      )}
    </div>
  );
});
