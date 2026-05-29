/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { Transition } from "@headlessui/react";
import { generateQueryParams } from "@plane/utils";
import { ReleaseAnalyticsSidebar } from "@/components/releases/release-analytics-sidebar";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";
import useKeypress from "@/hooks/use-keypress";

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
  // keep the last opened release id so content stays visible during the slide-out animation
  const [displayReleaseId, setDisplayReleaseId] = useState<string | null>(null);
  const { fetchReleaseDetails, fetchArchivedReleaseDetails } = useRelease();

  const isOpen = !!peekRelease;

  const handleClose = () => {
    const query = generateQueryParams(searchParams, ["peekRelease"]);
    router.push(`${pathname}?${query}`);
  };

  useEffect(() => {
    if (!peekRelease) return;
    setDisplayReleaseId(peekRelease.toString());
    if (isArchived) void fetchArchivedReleaseDetails(workspaceSlug, projectId, peekRelease.toString());
    else void fetchReleaseDetails(workspaceSlug, projectId, peekRelease.toString());
  }, [fetchArchivedReleaseDetails, fetchReleaseDetails, isArchived, peekRelease, projectId, workspaceSlug]);

  useKeypress("Escape", () => {
    if (isOpen) handleClose();
  });

  const portalContainer = typeof document !== "undefined" ? document.getElementById("full-screen-portal") : null;
  if (!portalContainer) return null;

  return createPortal(
    <Transition show={isOpen} as={React.Fragment}>
      <div className="absolute inset-0 z-[25]">
        {/* backdrop */}
        <Transition.Child
          as={React.Fragment}
          enter="transition-opacity duration-300 ease-out"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-200 ease-in"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="absolute inset-0 bg-black/20" onClick={handleClose} aria-hidden="true" />
        </Transition.Child>

        {/* drawer panel */}
        <Transition.Child
          as={React.Fragment}
          enter="transform transition-transform duration-300 ease-out"
          enterFrom="translate-x-full"
          enterTo="translate-x-0"
          leave="transform transition-transform duration-200 ease-in"
          leaveFrom="translate-x-0"
          leaveTo="translate-x-full"
        >
          <div
            className="absolute top-0 right-0 bottom-0 flex w-full max-w-full flex-col gap-3.5 overflow-y-auto border-l border-subtle bg-surface-1 px-6 md:w-1/2"
            style={{
              boxShadow:
                "-1px 0px 4px 0px rgba(0, 0, 0, 0.06), -2px 0px 4px 0px rgba(16, 24, 40, 0.06), -1px 0px 8px -1px rgba(16, 24, 40, 0.06)",
            }}
          >
            {displayReleaseId && (
              <ReleaseAnalyticsSidebar releaseId={displayReleaseId} handleClose={handleClose} isArchived={isArchived} />
            )}
          </div>
        </Transition.Child>
      </div>
    </Transition>,
    portalContainer
  );
});
