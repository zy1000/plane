/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { usePathname, useSearchParams } from "next/navigation";
import { generateQueryParams } from "@plane/utils";
import { ReleaseAnalyticsSidebar } from "@/components/releases/release-analytics-sidebar";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  projectId: string;
  workspaceSlug: string;
  isArchived?: boolean;
};

export const ReleasePeekOverview = observer(function ReleasePeekOverview({
  projectId,
  workspaceSlug,
  isArchived = false,
}: Props) {
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const peekRelease = searchParams.get("peekRelease");
  const ref = React.useRef(null);
  const { fetchReleaseDetails, fetchArchivedReleaseDetails } = useRelease();

  const handleClose = () => {
    const query = generateQueryParams(searchParams, ["peekRelease"]);
    router.push(`${pathname}?${query}`);
  };

  useEffect(() => {
    if (!peekRelease) return;
    if (isArchived) void fetchArchivedReleaseDetails(workspaceSlug, projectId, peekRelease.toString());
    else void fetchReleaseDetails(workspaceSlug, projectId, peekRelease.toString());
  }, [fetchArchivedReleaseDetails, fetchReleaseDetails, isArchived, peekRelease, projectId, workspaceSlug]);

  return (
    <>
      {peekRelease && (
        <div
          ref={ref}
          className="absolute right-0 z-[9] flex h-full w-full max-w-[24rem] flex-shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-subtle bg-surface-1 px-6 duration-300 md:relative"
          style={{
            boxShadow:
              "0px 1px 4px 0px rgba(0, 0, 0, 0.06), 0px 2px 4px 0px rgba(16, 24, 40, 0.06), 0px 1px 8px -1px rgba(16, 24, 40, 0.06)",
          }}
        >
          <ReleaseAnalyticsSidebar
            releaseId={peekRelease?.toString() ?? ""}
            handleClose={handleClose}
            isArchived={isArchived}
          />
        </div>
      )}
    </>
  );
});
