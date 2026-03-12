"use client";

import { usePathname, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import React from "react";
import { cn } from "@plane/utils";
import { isTMMindmapMenuActive, isTMOverviewActive, isTMOverviewMenuActive, isTMPlansActive, isTMPlansMenuActive, isTMReviewsActive, isTMReviewsMenuActive } from "./route-helpers";
import { useTestHub } from "./testhub-context";

type TMenuItem = {
  key: string;
  label: string;
  href: (workspaceSlug: string, projectId: string) => string;
  isActive: (pathname: string, workspaceSlug: string, projectId: string) => boolean;
};

const MENU_ITEMS: TMenuItem[] = [
  {
    key: "overview",
    label: "测试用例库",
    href: (ws, pid) => `/${ws}/projects/${pid}/testhub`,
    isActive: (pathname, ws, pid) => isTMOverviewMenuActive(pathname, ws, pid),
  },
  {
    key: "plans",
    label: "测试计划",
    href: (ws, pid) => `/${ws}/projects/${pid}/testhub/plans`,
    isActive: (pathname, ws, pid) => isTMPlansMenuActive(pathname, ws, pid),
  },
  {
    key: "reviews",
    label: "用例评审",
    href: (ws, pid) => `/${ws}/projects/${pid}/testhub/reviews`,
    isActive: (pathname, ws, pid) => isTMReviewsMenuActive(pathname, ws, pid),
  },
  // {
  //   key: "mindmap",
  //   label: "文件存储",
  //   href: (ws, pid) => `/${ws}/projects/${pid}/testhub/mindmap`,
  //   isActive: (pathname, ws, pid) => isTMMindmapMenuActive(pathname, ws, pid),
  // },
];

export const TestManagementMenuBar = () => {
  const pathname = usePathname();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const { triggerOpenNewModal, triggerOpenNewPlanModal, triggerOpenNewReviewModal } = useTestHub();
  const [repositoryIdFromStorage, setRepositoryIdFromStorage] = React.useState<string | null>(null);
  const [isClient, setIsClient] = React.useState(false);

  const ws = workspaceSlug?.toString() || "";
  const pid = projectId?.toString() || "";

  const isOverviewActive = !!pathname && !!ws && !!pid && isTMOverviewActive(pathname, ws, pid);
  const isPlansActive = !!pathname && !!ws && !!pid && isTMPlansActive(pathname, ws, pid);
  const isReviewsActive = !!pathname && !!ws && !!pid && isTMReviewsActive(pathname, ws, pid);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (!isClient) return;
    const storedRepositoryId = sessionStorage.getItem("selectedRepositoryId");
    setRepositoryIdFromStorage(storedRepositoryId);
  }, [isClient, pathname]);

  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryIdForLinks = repositoryIdFromStorage || repositoryIdFromUrl;

  return (
    <div className="w-full border-b border-subtle bg-surface-1">
      <div className="flex items-center w-full -ml-3">
        <div className="flex items-center overflow-x-auto no-scrollbar flex-1">
          {MENU_ITEMS.map((item) => {
            const href = item.href(ws, pid);
            const active = item.isActive(pathname, ws, pid);
            const finalHref =
              repositoryIdForLinks && item.key !== "overview"
                ? `${href}?repositoryId=${encodeURIComponent(String(repositoryIdForLinks))}`
                : href;
            return (
              <Link
                key={item.key}
                href={finalHref}
                className={cn(
                  "px-4 text-13 font-medium transition-colors whitespace-nowrap",
                  active ? "text-[#006399]" : "text-secondary hover:text-primary"
                )}
              >
                <span
                  className={cn("inline-block py-3 border-b-2", active ? "border-[#006399]" : "border-transparent")}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
        {isOverviewActive && (
          <button
            type="button"
            onClick={triggerOpenNewModal}
            className="ml-2 shrink-0 text-on-color bg-accent-primary hover:bg-accent-primary-hover focus:text-on-color focus:bg-accent-primary-hover px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            新建用例库
          </button>
        )}
        {isPlansActive && (
          <button
            type="button"
            onClick={triggerOpenNewPlanModal}
            className="ml-2 shrink-0 text-on-color bg-accent-primary hover:bg-accent-primary-hover focus:text-on-color focus:bg-accent-primary-hover px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            新建计划
          </button>
        )}
        {isReviewsActive && (
          <button
            type="button"
            onClick={triggerOpenNewReviewModal}
            className="ml-2 shrink-0 text-on-color bg-accent-primary hover:bg-accent-primary-hover focus:text-on-color focus:bg-accent-primary-hover px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            新建评审
          </button>
        )}
      </div>
    </div>
  );
};
