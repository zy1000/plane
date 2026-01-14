"use client";

import { usePathname, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import React from "react";
import { cn } from "@plane/utils";
import { isTMOverviewMenuActive, isTMPlansMenuActive, isTMReviewsMenuActive } from "./route-helpers";

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
];

export const TestManagementMenuBar = () => {
  const pathname = usePathname();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const [repositoryIdFromStorage, setRepositoryIdFromStorage] = React.useState<string | null>(null);
  const [isClient, setIsClient] = React.useState(false);

  const ws = workspaceSlug?.toString() || "";
  const pid = projectId?.toString() || "";

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
    <div className="w-full  border-custom-border-200 bg-custom-background-100">
      <div className="pl-0 py-2 flex items-center gap-2">
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
                "px-2.5 py-1.5 rounded text-xs font-medium",
                active
                  ? "bg-custom-background-90 text-custom-text-100"
                  : "text-custom-text-300 hover:bg-custom-background-90 hover:text-custom-text-100"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
};
