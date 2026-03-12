/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChangeEvent, FC } from "react";
import { Fragment, useCallback, useRef, useState, useEffect } from "react";
import { isEmpty } from "lodash-es";
import { observer } from "mobx-react";
import { useTheme } from "next-themes";
import { CalendarCheck, Download, Plus, Trash2 } from "lucide-react";
// headless ui
import { Tab } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PriorityIcon } from "@plane/propel/icons";
import { useRouter } from "next/navigation";
import type { TWorkItemFilterCondition } from "@plane/shared-state";
import type { ICycle } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// ui
import { Loader, Avatar, Button } from "@plane/ui";
import { cn, getDate, renderFormattedDate, renderFormattedDateWithoutYear, getFileURL } from "@plane/utils";
// assets
import darkAssigneeAsset from "@/app/assets/empty-state/active-cycle/assignee-dark.webp?url";
import lightAssigneeAsset from "@/app/assets/empty-state/active-cycle/assignee-light.webp?url";
import darkPriorityAsset from "@/app/assets/empty-state/active-cycle/priority-dark.webp?url";
import lightPriorityAsset from "@/app/assets/empty-state/active-cycle/priority-light.webp?url";
import userImage from "@/app/assets/user.png?url";
import { Pagination, Popconfirm, Tag, Tooltip } from "antd";
// components
import { SingleProgressStats } from "@/components/core/sidebar/single-progress-stats";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { SimpleEmptyState } from "@/components/empty-state/simple-empty-state-root";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import useLocalStorage from "@/hooks/use-local-storage";
// plane web components
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
import { CycleService } from "@/services/cycle.service";
// store
import type { ActiveCycleIssueDetails } from "@/store/issue/cycle";

export type ActiveCycleStatsProps = {
  workspaceSlug: string;
  projectId: string;
  cycle: ICycle | null;
  cycleId?: string | null;
  handleFiltersUpdate: (conditions: TWorkItemFilterCondition[]) => void;
  cycleIssueDetails?: ActiveCycleIssueDetails | { nextPageResults: boolean };
};

export const ActiveCycleStats = observer(function ActiveCycleStats(props: ActiveCycleStatsProps) {
  const { workspaceSlug, projectId, cycle, cycleId, handleFiltersUpdate, cycleIssueDetails } = props;
  const router = useRouter();
  const cycleService = useRef(new CycleService());
  const [testPlans, setTestPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cycleFiles, setCycleFiles] = useState<any[]>([]);
  const [cycleFilesLoading, setCycleFilesLoading] = useState(false);
  const [cycleFilesError, setCycleFilesError] = useState<string | null>(null);
  const [cycleFilesPage, setCycleFilesPage] = useState(1);
  const [cycleFilesTotal, setCycleFilesTotal] = useState(0);
  const [cycleFilesDownloadingId, setCycleFilesDownloadingId] = useState<string | null>(null);
  const [cycleFilesDeletingId, setCycleFilesDeletingId] = useState<string | null>(null);
  const [cycleFilesUploading, setCycleFilesUploading] = useState(false);
  const cycleFilesPageSize = 5;
  // local storage
  const { storedValue: tab, setValue: setTab } = useLocalStorage("activeCycleTab", "Assignees");
  // refs
  const issuesContainerRef = useRef<HTMLDivElement | null>(null);
  // states
  const [issuesLoaderElement, setIssueLoaderElement] = useState<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // theme hook
  const { resolvedTheme } = useTheme();
  // plane hooks
  const { t } = useTranslation();
  // derived values
  const priorityResolvedPath = resolvedTheme === "light" ? lightPriorityAsset : darkPriorityAsset;
  const assigneesResolvedPath = resolvedTheme === "light" ? lightAssigneeAsset : darkAssigneeAsset;

  const currentValue = (tab: string | null) => {
    switch (tab) {
      case "Priority-Issues":
        return 0;
      case "Assignees":
        return 1;
      case "Files":
        return 2;
      default:
        return 0;
    }
  };
  const {
    issues: { fetchNextActiveCycleIssues },
  } = useIssues(EIssuesStoreType.CYCLE);
  const {
    issue: { getIssueById },
    setPeekIssue,
  } = useIssueDetail();
  const loadMoreIssues = useCallback(() => {
    if (!cycleId) return;
    fetchNextActiveCycleIssues(workspaceSlug, projectId, cycleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, cycleId, issuesLoaderElement, cycleIssueDetails?.nextPageResults]);

  useIntersectionObserver(issuesContainerRef, issuesLoaderElement, loadMoreIssues, `0% 0% 100% 0%`);

  const fetchCycleFiles = useCallback(
    async (page = 1) => {
      if (!workspaceSlug || !projectId || !cycleId) return;
      try {
        setCycleFilesLoading(true);
        setCycleFilesError(null);
        const res = await cycleService.current.getCycleFileList(workspaceSlug, projectId, cycleId, {
          page,
          page_size: cycleFilesPageSize,
        });
        const list = Array.isArray(res?.data) ? res.data : [];
        const count = Number(res?.count ?? 0);
        const totalPages = Math.max(Math.ceil(count / cycleFilesPageSize), 1);
        const safePage = Math.min(Math.max(page, 1), totalPages);
        if (safePage !== page) {
          await fetchCycleFiles(safePage);
          return;
        }
        setCycleFiles(list);
        setCycleFilesTotal(count);
        setCycleFilesPage(page);
      } catch (e: any) {
        setCycleFilesError(e?.detail || e?.error || "获取文件列表失败");
      } finally {
        setCycleFilesLoading(false);
      }
    },
    [workspaceSlug, projectId, cycleId]
  );

  const handleDownloadCycleFile = async (fileId: string, fileName: string) => {
    try {
      setCycleFilesDownloadingId(fileId);
      const blob = await cycleService.current.downloadCycleFile(fileId);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } finally {
      setCycleFilesDownloadingId(null);
    }
  };

  const handleUploadCycleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile || !cycleId) return;
    try {
      setCycleFilesUploading(true);
      setCycleFilesError(null);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("cycle_id", cycleId);
      await cycleService.current.uploadCycleFile(workspaceSlug, projectId, formData);
      await fetchCycleFiles(1);
    } catch (e: any) {
      setCycleFilesError(e?.detail || e?.error || "上传失败");
    } finally {
      setCycleFilesUploading(false);
      event.target.value = "";
    }
  };

  const handleDeleteCycleFile = async (fileId: string) => {
    try {
      setCycleFilesDeletingId(fileId);
      setCycleFilesError(null);
      await cycleService.current.deleteCycleFile(fileId);
      await fetchCycleFiles(cycleFilesPage);
    } catch (e: any) {
      setCycleFilesError(e?.detail || e?.error || "删除失败");
    } finally {
      setCycleFilesDeletingId(null);
    }
  };

  const formatFileSize = (size = 0) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

    // 渲染测试计划状态
  const renderState = (state: any) => {
    const colorMap: Record<string, string> = {
      未开始: "default",
      进行中: "processing",
      已完成: "success",
    };
    const color = colorMap[state] || "default";
    const text = state ? state.toString() : "-";
    return <Tag color={color}>{text}</Tag>;
  };

  // 渲染通过率
  const renderPassRate = (passRate: any) => {
    if (!passRate) return "-";

    const orderKeys = ["成功", "失败", "阻塞",'无效', "未执行"];
    const totalCount = orderKeys.reduce((s, k) => s + Number(passRate?.[k] || 0), 0);
    const passed = Number(passRate?.["成功"] || 0);
    const percent = totalCount > 0 ? Math.floor((passed / totalCount) * 100) : 0;

    const colorHexMap: Record<string, string> = {
      green: "#52c41a",
      red: "#ff4d4f",
      gold: "#faad14",
      blue: "#1677ff",
      gray: "#bfbfbf",
      mediumBlue: "#3b5999",
      default: "#d9d9d9",
    };

    const categoryColor: Record<string, string> = {
      成功: colorHexMap.green,
      失败: colorHexMap.red,
      阻塞: colorHexMap.gold,
      无效: colorHexMap.mediumBlue,
      未执行: colorHexMap.gray,
    };

    const segments = orderKeys.map((k) => {
      const count = Number(passRate?.[k] || 0);
      const color = categoryColor[k] || colorHexMap.default;
      const widthPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
      return { key: k, count, color, widthPct };
    });

    const tooltipContent = (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {orderKeys.map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "2px",
                backgroundColor: categoryColor[k] || colorHexMap.default,
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: "12px", color: "var(--text-color-primary)" }}>{k}</span>
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#8c8c8c" }}>{Number(passRate?.[k] || 0)}</span>
          </div>
        ))}
      </div>
    );

    return (
      <Tooltip mouseEnterDelay={0.25} title={tooltipContent} color="#fff" overlayInnerStyle={{ color: "#333" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "80px" }}>
          <div style={{ flex: "1", minWidth: "50px" }}>
            <div
              style={{
                width: "100%",
                height: "5px",
                border: "1px solid #e8e8e8",
                borderRadius: "5px",
                overflow: "hidden",
                display: "flex",
              }}
            >
              {segments.map((seg, idx) => (
                <div
                  key={`${seg.key}-${idx}`}
                  style={{ width: `${seg.widthPct}%`, backgroundColor: seg.color, height: "100%" }}
                />
              ))}
            </div>
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-color-primary)", minWidth: "25px" }}>{percent}%</span>
        </div>
      </Tooltip>
    );
  };

  // 从 cycle 数据中获取测试计划
  useEffect(() => {
    if (cycle && cycle.plans) {
      setTestPlans(cycle.plans);
      setLoading(false);
    } else {
      setTestPlans([]);
      setLoading(false);
    }
  }, [cycle]);

  useEffect(() => {
    if (!cycleId) return;
    fetchCycleFiles(1);
  }, [cycleId, fetchCycleFiles]);

  const loaders = (
    <Loader className="space-y-3">
      <Loader.Item height="30px" />
      <Loader.Item height="30px" />
      <Loader.Item height="30px" />
    </Loader>
  );

  return cycleId ? (
    <div className="col-span-1 flex min-h-[17rem] flex-col gap-4 overflow-hidden rounded-lg border border-subtle bg-surface-1 p-4 lg:col-span-2 xl:col-span-1">
      <Tab.Group
        as={Fragment}
        defaultIndex={currentValue(tab)}
        onChange={(i) => {
          switch (i) {
            case 0:
              return setTab("Priority-Issues");
            case 1:
              return setTab("Assignees");
            case 2:
              return setTab("Files");

            default:
              return setTab("Priority-Issues");
          }
        }}
      >
        <Tab.List
          as="div"
          className="relative grid rounded-sm border-[0.5px] border-subtle bg-layer-1 p-[1px]"
          style={{
            gridTemplateColumns: `repeat(3, 1fr)`,
          }}
        >
          <Tab
            className={({ selected }) =>
              cn(
                "relative z-[1] rounded-[3px] py-1.5 text-11 font-semibold text-placeholder transition duration-500 focus:outline-none",
                {
                  "bg-surface-1 text-tertiary": selected,
                  "hover:text-tertiary": !selected,
                }
              )
            }
          >
            测试计划
          </Tab>
          <Tab
            className={({ selected }) =>
              cn(
                "relative z-[1] rounded-[3px] py-1.5 text-11 font-semibold text-placeholder transition duration-500 focus:outline-none",
                {
                  "bg-surface-1 text-tertiary": selected,
                  "hover:text-tertiary": !selected,
                }
              )
            }
          >
            {t("project_cycles.active_cycle.assignees")}
          </Tab>
          <Tab
            className={({ selected }) =>
              cn(
                "relative z-[1] rounded-[3px] py-1.5 text-11 font-semibold text-placeholder transition duration-500 focus:outline-none",
                {
                  "bg-surface-1 text-tertiary": selected,
                  "hover:text-tertiary": !selected,
                }
              )
            }
          >
            文件
          </Tab>
        </Tab.List>

        <Tab.Panels as={Fragment}>
          <Tab.Panel as="div" className="flex h-52 w-full flex-col overflow-hidden text-secondary">
            {loading ? (
              <div className="h-full w-full p-4 overflow-y-auto vertical-scrollbar scrollbar-sm">{loaders}</div>
            ) : error ? (
              <div className="flex items-center justify-center h-full w-full">
                <div className="text-sm text-tertiary">{error}</div>
              </div>
            ) : testPlans.length > 0 ? (
              <div className="flex flex-col h-full w-full">
                {/* 表格头部 */}
                <div className="grid grid-cols-3 gap-2 px-2 py-1 text-xs font-medium text-placeholder border-b border-subtle shrink-0 bg-surface-1">                  <div>测试计划</div>
                  <div>状态</div>
                  <div>通过率</div>
                </div>

                {/* 表格内容 */}
                <div
                  ref={issuesContainerRef}
                  className="flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm divide-y divide-subtle"
                >
                  {testPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="grid grid-cols-3 gap-2 px-2 py-2 text-sm hover:bg-surface-2 cursor-pointer"                      onClick={() => {
                        const planId = plan?.id;
                        const repo = plan?.repository;
                        const repositoryId = typeof repo === "string" ? repo : repo?.id;
                        if (!planId || !repositoryId) return;
                        router.push(
                          `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases/?planId=${planId}&repositoryId=${repositoryId}`
                        );
                      }}
                    >
                      <div className="truncate text-primary" title={plan.name}>
                        {plan.name}
                      </div>
                      <div className="flex items-center">{renderState(plan.state)}</div>
                      <div className="flex items-center">{renderPassRate(plan.pass_rate)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full w-full">
                <SimpleEmptyState title="暂无关联测试计划" assetPath={priorityResolvedPath} />
              </div>
            )}
          </Tab.Panel>

          <Tab.Panel
            as="div"
            className="vertical-scrollbar flex scrollbar-sm h-52 w-full flex-col gap-1 overflow-y-auto text-secondary"
          >
            {cycle && !isEmpty(cycle.distribution) ? (
              cycle?.distribution?.assignees && cycle.distribution.assignees.length > 0 ? (
                cycle.distribution?.assignees?.map((assignee, index) => {
                  if (assignee.assignee_id)
                    return (
                      <SingleProgressStats
                        key={assignee.assignee_id}
                        title={
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={assignee?.display_name ?? undefined}
                              src={getFileURL(assignee?.avatar_url ?? "")}
                            />

                            <span>{assignee.display_name}</span>
                          </div>
                        }
                        completed={assignee.completed_issues}
                        total={assignee.total_issues}
                        onClick={() => {
                          if (assignee.assignee_id) {
                            handleFiltersUpdate([
                              { property: "assignee_id", operator: "in", value: [assignee.assignee_id] },
                            ]);
                          }
                        }}
                      />
                    );
                  else
                    return (
                      <SingleProgressStats
                        key={`unassigned-${index}`}
                        title={
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded-full border-2 border-subtle bg-layer-1">
                              <img src={userImage} height="100%" width="100%" className="rounded-full" alt="User" />
                            </div>
                            <span>{t("no_assignee")}</span>
                          </div>
                        }
                        completed={assignee.completed_issues}
                        total={assignee.total_issues}
                      />
                    );
                })
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <SimpleEmptyState
                    title={t("active_cycle.empty_state.assignee.title")}
                    assetPath={assigneesResolvedPath}
                  />
                </div>
              )
            ) : (
              loaders
            )}
          </Tab.Panel>

          <Tab.Panel
            as="div"
            className="flex h-52 w-full flex-col text-primary"
          >
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-xs font-medium text-secondary">文件</div>
              <div className="flex">
                <Button
                  variant="link-neutral"
                  className="p-0"
                  onClick={() => fileInputRef.current?.click()}
                  loading={cycleFilesUploading}
                  disabled={cycleFilesUploading}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadCycleFile} />
              </div>
            </div>
            {cycleFilesLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
            ) : cycleFilesError ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{cycleFilesError}</div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed">
                      <thead>
                        <tr className="text-left text-xs text-secondary border-b border-subtle">
                          <th className="w-2/5 px-2 py-2">文件名</th>
                          <th className="w-1/5 px-2 py-2">大小</th>
                          <th className="w-2/5 px-2 py-2">上传时间</th>
                          <th className="w-1/5 px-2 py-2 text-left">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cycleFiles.length === 0 && (
                          <tr>
                            <td className="px-2 py-6 text-sm text-secondary" colSpan={4}>
                              暂无文件
                            </td>
                          </tr>
                        )}
                        {cycleFiles.map((file) => (
                          <tr key={file.id} className="border-b border-subtle hover:bg-layer-1-hover">
                            <td className="px-2 py-2 truncate text-sm text-primary" title={file.name}>
                              {file.name}
                            </td>
                            <td className="px-2 py-2 text-sm text-primary">
                              {formatFileSize(Number(file.size ?? 0))}
                            </td>
                            <td className="px-2 py-2 text-sm text-primary">
                              {file.created_at ? renderFormattedDate(getDate(file.created_at), "yyyy-MM-dd") ?? "-" : "-"}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="link-neutral"
                                  className="p-0"
                                  disabled={cycleFilesDownloadingId === file.id}
                                  onClick={() => handleDownloadCycleFile(file.id, file.name)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <Popconfirm
                                  title="确认删除该文件？"
                                  okText="删除"
                                  cancelText="取消"
                                  onConfirm={() => void handleDeleteCycleFile(file.id)}
                                >
                                  <Button
                                    variant="link-danger"
                                    className="p-0"
                                    disabled={cycleFilesDeletingId === file.id}
                                    loading={cycleFilesDeletingId === file.id}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </Popconfirm>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex-shrink-0 border-t border-subtle px-2 py-2 bg-surface-1 flex items-center justify-between mt-2">
                  <div className="text-sm text-secondary">{cycleFilesTotal > 0 ? `共 ${cycleFilesTotal} 条` : ""}</div>
                  <Pagination
                    simple
                    current={cycleFilesPage}
                    pageSize={cycleFilesPageSize}
                    total={cycleFilesTotal}
                    onChange={(p) => fetchCycleFiles(p)}
                    size="small"
                  />
                </div>
              </div>
            )}
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  ) : (
    <Loader className="col-span-1 flex min-h-[17rem] flex-col gap-4 overflow-hidden bg-surface-1 lg:col-span-2 xl:col-span-1">
      <Loader.Item width="100%" height="17rem" />
    </Loader>
  );
});
