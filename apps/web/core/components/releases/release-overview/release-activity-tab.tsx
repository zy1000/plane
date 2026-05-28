/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useState } from "react";
import { Activity, MessageSquare } from "lucide-react";
import { cn } from "@plane/utils";
import { ReleaseActivityFeed } from "@/components/releases/release-activity";
import { ReleaseCommentsSection } from "@/components/releases/release-comments";

type SubTabKey = "activity" | "comment";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
};

const SECTION_CARD = "rounded-xl border border-subtle bg-surface-1";

const SUB_TABS: { key: SubTabKey; label: string; icon: typeof Activity }[] = [
  { key: "activity", label: "动态", icon: Activity },
  { key: "comment", label: "评论", icon: MessageSquare },
];

export const ReleaseActivityTab: React.FC<Props> = ({ workspaceSlug, projectId, releaseId }) => {
  const [active, setActive] = useState<SubTabKey>("activity");

  return (
    <section className={`${SECTION_CARD} flex h-[calc(100vh-9rem)] flex-col`}>
      <div
        className="flex items-center gap-1 border-b border-subtle px-5"
        role="tablist"
        aria-label="动态与评论"
      >
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary",
                isActive
                  ? "border-accent-primary text-primary"
                  : "border-transparent text-placeholder hover:text-secondary"
              )}
              onClick={() => setActive(tab.key)}
            >
              <Icon
                className={cn("h-4 w-4", isActive ? "text-accent-primary" : "text-placeholder")}
                aria-hidden
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {active === "activity" ? (
          <div className="vertical-scrollbar scrollbar-sm h-full overflow-y-auto px-6 py-5">
            <ReleaseActivityFeed
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              releaseId={releaseId}
            />
          </div>
        ) : (
          <ReleaseCommentsSection
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            releaseId={releaseId}
          />
        )}
      </div>
    </section>
  );
};
