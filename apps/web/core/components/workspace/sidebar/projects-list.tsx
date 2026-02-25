import { useState, useRef, useEffect } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Ellipsis } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, PROJECT_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
import { copyUrlToClipboard, cn, orderJoinedProjects } from "@plane/utils";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
// plane web imports
import type { TProject } from "@/plane-web/types";
// local imports
import { SidebarProjectsListItem } from "./projects-list-item";

export const SidebarProjectsList = observer(function SidebarProjectsList() {
  // states
  const [isScrolled, setIsScrolled] = useState(false); // scroll animation state
  // refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  // store hooks
  const { t } = useTranslation();
  const { toggleCreateProjectModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const { isExtendedProjectSidebarOpened, toggleExtendedProjectSidebar } = useAppTheme();

  const { loader, getPartialProjectById, joinedProjectIds: joinedProjects, updateProjectView } = useProject();
  // router params
  const { workspaceSlug } = useParams();

  // auth
  const isAuthorizedUser = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  // Compute limited projects for main sidebar
  const displayedProjects = projectPreferences.showLimitedProjects
    ? joinedProjects.slice(0, projectPreferences.limitedProjectsCount)
    : joinedProjects;

  // Check if there are more projects to show
  const hasMoreProjects =
    projectPreferences.showLimitedProjects && joinedProjects.length > projectPreferences.limitedProjectsCount;

  const handleCopyText = (projectId: string) => {
    copyUrlToClipboard(`${workspaceSlug}/projects/${projectId}/issues`).then(() => {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("link_copied"),
        message: t("project_link_copied_to_clipboard"),
      });
    });
  };

  const handleOnProjectDrop = (
    sourceId: string | undefined,
    destinationId: string | undefined,
    shouldDropAtEnd: boolean
  ) => {
    if (!sourceId || !destinationId || !workspaceSlug) return;
    if (sourceId === destinationId) return;

    const joinedProjectsList: TProject[] = [];
    joinedProjects.map((projectId) => {
      const projectDetails = getPartialProjectById(projectId);
      if (projectDetails) joinedProjectsList.push(projectDetails);
    });

    const sourceIndex = joinedProjects.indexOf(sourceId);
    const destinationIndex = shouldDropAtEnd ? joinedProjects.length : joinedProjects.indexOf(destinationId);

    if (joinedProjectsList.length <= 0) return;

    const updatedSortOrder = orderJoinedProjects(sourceIndex, destinationIndex, sourceId, joinedProjectsList);
    if (updatedSortOrder != undefined)
      updateProjectView(workspaceSlug.toString(), sourceId, { sort_order: updatedSortOrder }).catch(() => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t("something_went_wrong"),
        });
      });
  };

  /**
   * Implementing scroll animation styles based on the scroll length of the container
   */
  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const scrollTop = containerRef.current.scrollTop;
        setIsScrolled(scrollTop > 0);
      }
    };
    const currentContainerRef = containerRef.current;
    if (currentContainerRef) {
      currentContainerRef.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (currentContainerRef) {
        currentContainerRef.removeEventListener("scroll", handleScroll);
      }
    };
  }, [containerRef]);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) return;

    return combine(
      autoScrollForElements({
        element,
        canScroll: ({ source }) => source?.data?.dragInstanceId === "PROJECTS",
        getAllowedAxis: () => "vertical",
      })
    );
  }, [containerRef]);
  return (
    <>
      <div
        ref={containerRef}
        className={cn({
          "border-t border-custom-sidebar-border-300": isScrolled,
        })}
      >
        {loader === "init-loader" && (
          <Loader className="w-full space-y-1.5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Loader.Item key={index} height="28px" />
            ))}
          </Loader>
        )}

        <div className="flex flex-col gap-0.5">
          {displayedProjects.map((projectId, index) => (
            <SidebarProjectsListItem
              key={projectId}
              projectId={projectId}
              handleCopyText={() => handleCopyText(projectId)}
              projectListType={"JOINED"}
              disableDrag={false}
              disableDrop={false}
              isLastChild={index === displayedProjects.length - 1}
              handleOnProjectDrop={handleOnProjectDrop}
            />
          ))}
          {hasMoreProjects && (
            <SidebarNavItem>
              <button
                type="button"
                onClick={() => toggleExtendedProjectSidebar()}
                className="flex items-center gap-1.5 text-sm font-medium flex-grow text-custom-text-350"
                id="extended-project-sidebar-toggle"
                aria-label={t(
                  isExtendedProjectSidebarOpened
                    ? "aria_labels.app_sidebar.close_extended_sidebar"
                    : "aria_labels.app_sidebar.open_extended_sidebar"
                )}
              >
                <Ellipsis className="flex-shrink-0 size-4" />
                <span>{isExtendedProjectSidebarOpened ? "Hide" : "More"}</span>
              </button>
            </SidebarNavItem>
          )}
        </div>

        {isAuthorizedUser && joinedProjects?.length === 0 && (
          <button
            type="button"
            data-ph-element={PROJECT_TRACKER_ELEMENTS.SIDEBAR_CREATE_PROJECT_BUTTON}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm leading-5 font-medium text-custom-sidebar-text-200 hover:bg-custom-sidebar-background-90 rounded-md"
            onClick={() => {
              toggleCreateProjectModal(true);
            }}
          >
            {t("add_project")}
          </button>
        )}
      </div>
    </>
  );
});
