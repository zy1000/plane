/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// icons
import { Circle, ClipboardCheck, ChevronDown } from "lucide-react";
// plane imports
import {
  EUserPermissions,
  EUserPermissionsLevel,
  SPACE_BASE_PATH,
  SPACE_BASE_URL,
  WORK_ITEM_TRACKER_ELEMENTS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { NewTabIcon, WorkItemsIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssuesStoreType } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CountChip } from "@/components/common/count-chip";
// constants
import { HeaderFilters } from "@/components/issues/filters";
import { WorkflowApprovalModal } from "@/components/issues/workflow-approval-modal";
import { IssueService } from "@/services/issue";
import { Dropdown, message } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useRef, useState } from "react";
// helpers
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useWorkflowApprovals } from "@/hooks/store/use-workflow-approvals";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { getProjectIssueScopeFromPathname } from "@/store/issue/project";

export const IssuesHeader = observer(function IssuesHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const pathname = usePathname();
  const scope = getProjectIssueScopeFromPathname(pathname);
  const { issues } = useIssues(EIssuesStoreType.PROJECT);
  const { selectedEntityIds } = useMultipleSelectStore();
  const { fetchProjectLabels } = useLabel();
  // i18n
  const { t } = useTranslation();

  const { currentProjectDetails, loader } = useProject();

  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { isMobile } = usePlatformOS();

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);

  const { pendingCount, fetchPendingCount } = useWorkflowApprovals(
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  // 页面加载时拉取待审批数量（用于红点）
  useEffect(() => {
    if (workspaceSlug && projectId) {
      fetchPendingCount();
    }
  }, [workspaceSlug, projectId, fetchPendingCount]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const issueService = new IssueService();

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await issueService.importIssue(workspaceSlug, projectId, formData);

      // 如果有失败的记录，生成CSV并下载
      if (res.data?.fail && res.data.fail.length > 0) {
        message.warning(`导入完成，有 ${res.data.fail.length} 条数据导入失败，详情请查看下载的文件`);

        // 创建CSV内容
        const headers = ["用例名称", "失败原因"];
        const csvContent = [
          headers.join(","),
          ...res.data.fail.map(
            (item: any) =>
              // 处理字段中可能包含的逗号，用引号包裹
              `"${item.name || ""}","${item.error || ""}"`
          ),
        ].join("\n");

        // 创建Blob并下载
        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", `导入失败记录_${new Date().getTime()}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        message.success("导入成功");
      }
      if (workspaceSlug && projectId) {
        await fetchProjectLabels(workspaceSlug.toString(), projectId.toString());
      }
      await issues.fetchIssuesWithExistingPagination(
        workspaceSlug?.toString(),
        projectId?.toString(),
        "mutation",
        scope
      );
    } catch (err: any) {
      console.error(err);
      message.error(err?.error || "导入失败");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const convertToCSV = (data: Record<string, unknown>[]): string => {
    if (!data.length) return "";
    const headers = Object.keys(data[0]);
    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const str = Array.isArray(val) ? val.join(";") : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = data.map((row) => headers.map((h) => escape(row[h])).join(","));
    return [headers.join(","), ...rows].join("\n");
  };

  const handleExport = async (format: "json" | "csv") => {
    if (selectedEntityIds.length < 1) return;
    try {
      const data = await issueService.bulkExportIssues(
        workspaceSlug?.toString(),
        projectId?.toString(),
        selectedEntityIds
      );
      let blob: Blob;
      let filename: string;
      if (format === "csv") {
        const csv = "\uFEFF" + convertToCSV(data);
        blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        filename = `工作项导出_${Date.now()}.csv`;
      } else {
        blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
        filename = `工作项导出_${Date.now()}.json`;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success(`已导出 ${data.length} 条工作项（${format.toUpperCase()}）`);
    } catch (err: any) {
      console.error(err);
      message.error(err?.error || "导出失败");
    }
  };

  const exportMenuItems: MenuProps["items"] = [
    { key: "json", label: "导出为 JSON" },
    { key: "csv", label: "导出为 CSV" },
  ];

  const SPACE_APP_URL = (SPACE_BASE_URL.trim() === "" ? window.location.origin : SPACE_BASE_URL) + SPACE_BASE_PATH;
  const publishedURL = `${SPACE_APP_URL}/issues/${currentProjectDetails?.anchor}`;

  const issuesCount = issues.getGroupIssueCount(undefined, undefined, false);
  const canUserCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-2.5">
          <Breadcrumbs onBack={() => router.back()} isLoading={loader === "init-loader"} className="flex-grow-0">
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Work Items"
                  href={`/${workspaceSlug}/projects/${projectId}/issues/`}
                  icon={<WorkItemsIcon className="h-4 w-4 text-tertiary" />}
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
          {issuesCount && issuesCount > 0 ? (
            <Tooltip
              isMobile={isMobile}
              tooltipContent={`There are ${issuesCount} ${issuesCount > 1 ? "work items" : "work item"} in this project`}
              position="bottom"
            >
              <CountChip count={issuesCount} />
            </Tooltip>
          ) : null}
        </div>
        {currentProjectDetails?.anchor ? (
          <a
            href={publishedURL}
            className="group flex items-center gap-1.5 rounded-sm bg-accent-primary/10 px-2.5 py-1 text-11 font-medium text-accent-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Circle className="h-1.5 w-1.5 fill-accent-primary" strokeWidth={2} />
            {t("workspace_projects.network.public.title")}
            <NewTabIcon className="hidden h-3 w-3 group-hover:block" strokeWidth={2} />
          </a>
        ) : (
          <></>
        )}
      </Header.LeftItem>
      <Header.RightItem>
        <div className="hidden items-center gap-2 md:flex">
          <HeaderFilters
            projectId={projectId}
            currentProjectDetails={currentProjectDetails}
            workspaceSlug={workspaceSlug}
            canUserCreateIssue={canUserCreateIssue}
          />
        </div>
        {canUserCreateIssue && (
          <>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                toggleCreateIssueModal(true, EIssuesStoreType.PROJECT);
              }}
              data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.WORK_ITEMS}
            >
              <div className="block sm:hidden">{t("issue.label", { count: 1 })}</div>
              <div className="hidden sm:block">{t("issue.add.label")}</div>
            </Button>
            <Button size="lg" onClick={() => fileInputRef.current?.click()} variant="secondary">
              导入
            </Button>
            {selectedEntityIds.length >= 1 && (
              <Dropdown
                menu={{
                  items: exportMenuItems,
                  onClick: ({ key }) => handleExport(key as "json" | "csv"),
                }}
                trigger={["click"]}
              >
                <Button size="lg" variant="secondary" className="flex items-center gap-1">
                  导出
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </Dropdown>
            )}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".xlsx,.xls"
              onChange={handleImport}
            />
            <div className="relative hidden md:block">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setIsApprovalModalOpen(true)}
                className="flex items-center gap-1"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                {pendingCount > 0 ? (
                  <span style={{ color: "#f87171" }}>
                    待审批·{pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                ) : (
                  "审批"
                )}
              </Button>
            </div>
          </>
        )}
        {isApprovalModalOpen && workspaceSlug && projectId && (
          <WorkflowApprovalModal
            isOpen={isApprovalModalOpen}
            onClose={() => {
              setIsApprovalModalOpen(false);
              fetchPendingCount();
            }}
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
          />
        )}
      </Header.RightItem>
    </Header>
  );
});
