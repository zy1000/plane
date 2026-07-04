"use client";

import { usePathname, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import React from "react";
import {
  PROJECT_QA_CASE_VIEW_PERMISSION_KEY,
  PROJECT_QA_PLAN_VIEW_PERMISSION_KEY,
  PROJECT_QA_REPORT_VIEW_PERMISSION_KEY,
  PROJECT_QA_REVIEW_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import { cn } from "@plane/utils";
import { useUserPermissions } from "@/hooks/store/user";
import {
  isTMOverviewActive,
  isTMOverviewMenuActive,
  isTMPlansActive,
  isTMPlansMenuActive,
  isTMReviewsMenuActive,
  isTMReportsActive,
  isTMReportsMenuActive,
} from "./route-helpers";
import { useTestHub } from "./testhub-context";

const PROJECT_QA_PLAN_CREATE_PERMISSION_KEY = "qa.plan.create" as const;
const PROJECT_QA_REPORT_CREATE_PERMISSION_KEY = "qa.report.create" as const;

type TMenuItem = {
  key: string;
  label: string;
  href: (workspaceSlug: string, projectId: string) => string;
  isActive: (pathname: string, workspaceSlug: string, projectId: string) => boolean;
  permissionKey?: string;
};

const MENU_ITEMS: TMenuItem[] = [
  {
    key: "overview",
    label: "测试用例",
    href: (ws, pid) => `/${ws}/projects/${pid}/testhub`,
    isActive: (pathname, ws, pid) => isTMOverviewMenuActive(pathname, ws, pid),
    permissionKey: PROJECT_QA_CASE_VIEW_PERMISSION_KEY,
  },
  {
    key: "plans",
    label: "测试计划",
    href: (ws, pid) => `/${ws}/projects/${pid}/testhub/plans`,
    isActive: (pathname, ws, pid) => isTMPlansMenuActive(pathname, ws, pid),
    permissionKey: PROJECT_QA_PLAN_VIEW_PERMISSION_KEY,
  },
  {
    key: "reviews",
    label: "用例评审",
    href: (ws, pid) => `/${ws}/projects/${pid}/testhub/reviews`,
    isActive: (pathname, ws, pid) => isTMReviewsMenuActive(pathname, ws, pid),
    permissionKey: PROJECT_QA_REVIEW_VIEW_PERMISSION_KEY,
  },
  {
    key: "reports",
    label: "测试报告",
    href: (ws, pid) => `/${ws}/projects/${pid}/testhub/reports`,
    isActive: (pathname, ws, pid) => isTMReportsMenuActive(pathname, ws, pid),
    permissionKey: PROJECT_QA_REPORT_VIEW_PERMISSION_KEY,
  },
];

export const TestManagementMenuBar = () => {
  const pathname = usePathname();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const { triggerOpenNewModal, triggerOpenNewPlanModal, triggerOpenNewReportModal } = useTestHub();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const [repositoryIdFromStorage, setRepositoryIdFromStorage] = React.useState<string | null>(null);
  const [isClient, setIsClient] = React.useState(false);

  const ws = workspaceSlug?.toString() || "";
  const pid = projectId?.toString() || "";

  const isOverviewActive = !!pathname && !!ws && !!pid && isTMOverviewActive(pathname, ws, pid);
  const isPlansActive = !!pathname && !!ws && !!pid && isTMPlansActive(pathname, ws, pid);
  const isReportsActive = !!pathname && !!ws && !!pid && isTMReportsActive(pathname, ws, pid);
  const canCreatePlan = !!ws && !!pid && allowProjectPermissionKeys([PROJECT_QA_PLAN_CREATE_PERMISSION_KEY], ws, pid);
  const canCreateReport =
    !!ws && !!pid && allowProjectPermissionKeys([PROJECT_QA_REPORT_CREATE_PERMISSION_KEY], ws, pid);
  const visibleMenuItems = MENU_ITEMS.filter(
    (item) => !item.permissionKey || (!!ws && !!pid && allowProjectPermissionKeys([item.permissionKey], ws, pid))
  );

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
      <div className="-ml-3 flex w-full items-center">
        <div className="no-scrollbar flex flex-1 items-center overflow-x-auto">
          {visibleMenuItems.map((item) => {
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
                  "px-4 text-13 font-medium whitespace-nowrap transition-colors",
                  active ? "text-[#006399]" : "text-secondary hover:text-primary"
                )}
              >
                <span
                  className={cn("inline-block border-b-2 py-3", active ? "border-[#006399]" : "border-transparent")}
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
            className="ml-2 flex shrink-0 items-center justify-center gap-1.5 rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover focus:bg-accent-primary-hover focus:text-on-color disabled:cursor-not-allowed disabled:opacity-50"
          >
            新建用例库
          </button>
        )}
        {isPlansActive && (
          <button
            type="button"
            disabled={!canCreatePlan}
            onClick={() => {
              if (!canCreatePlan) return;
              triggerOpenNewPlanModal();
            }}
            className="ml-2 flex shrink-0 items-center justify-center gap-1.5 rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover focus:bg-accent-primary-hover focus:text-on-color disabled:cursor-not-allowed disabled:opacity-50"
          >
            新建计划
          </button>
        )}
        {isReportsActive && (
          <button
            type="button"
            disabled={!canCreateReport}
            onClick={() => {
              if (!canCreateReport) return;
              triggerOpenNewReportModal();
            }}
            className="ml-2 flex shrink-0 items-center justify-center gap-1.5 rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover focus:bg-accent-primary-hover focus:text-on-color disabled:cursor-not-allowed disabled:opacity-50"
          >
            新建报告
          </button>
        )}
      </div>
    </div>
  );
};
