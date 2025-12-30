"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react";
import { Modal, Pagination, message } from "antd";
import type { TableProps } from "antd";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { DEFAULT_DISPLAY_PROPERTIES } from "@/store/issue/issue-details/sub_issues_filter.store";
import { ALL_ISSUES } from "@plane/constants";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { EIssueServiceType } from "@plane/types";
import { CustomMenu } from "@plane/ui";

import { PageHead } from "@/components/core/page-title";
import { IssueBlockRoot } from "@/components/issues/issue-layouts/list/block-root";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUserPermissions } from "@/hooks/store/user";
import { IssueService } from "@/services/issue/issue.service";
import { MilestoneService } from "@/services/milestone.service";
import { ProjectIssueTypeService, projectIssueTypesCache } from "@/services/project";
import { MilestoneAddIssuesModal } from "./milestone-add-issues-modal";

const milestoneService = new MilestoneService();
const projectIssueTypeService = new ProjectIssueTypeService();
const OPEN_ADD_ISSUES_MODAL_EVENT = "milestone-issues:add-issues-modal:open";

type TIssueRow = {
  id: string;
  name?: string;
  title?: string;
  sequence_id?: string | number;
  project_detail?: { identifier?: string };
  [key: string]: any;
};

function ProjectMilestoneIssuesPage() {
  const { workspaceSlug, projectId, milestoneId } = useParams();
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const paginationRef = useRef<{ page: number; size: number }>({ page: 1, size: 10 });
  const wasPeekOpenRef = useRef(false);
  const { allowPermissions } = useUserPermissions();
  const issueService = useMemo(() => new IssueService(EIssueServiceType.ISSUES), []);
  const { peekIssue } = useIssueDetail(EIssueServiceType.ISSUES);

  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<TIssueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableIssues, setAvailableIssues] = useState<TIssueRow[]>([]);
  const [availableTotal, setAvailableTotal] = useState(0);
  const [availableCurrentPage, setAvailableCurrentPage] = useState(1);
  const [availablePageSize, setAvailablePageSize] = useState(10);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Key[]>([]);
  const [availableTypeId, setAvailableTypeId] = useState<string | undefined>(undefined);
  const [availableNameQuery, setAvailableNameQuery] = useState("");

  const [issueTypesMap, setIssueTypesMap] = useState<Record<string, any> | undefined>(undefined);

  const getIssueLabel = useCallback((issue: TIssueRow) => {
    const identifier = issue?.project_detail?.identifier;
    const sequenceId = issue?.sequence_id;
    const name = issue?.name ?? issue?.title ?? issue?.id ?? "-";
    if (identifier && (sequenceId || sequenceId === 0)) return `${identifier}-${sequenceId} ${name}`;
    return name;
  }, []);

  const normalizeListResponse = useCallback((res: any) => {
    if (res && Array.isArray(res.results)) return { items: res.results, total: res.total_count ?? res.count ?? 0 };
    if (res && Array.isArray(res.data)) return { items: res.data, total: res.total_count ?? res.count ?? 0 };
    if (Array.isArray(res)) return { items: res, total: res.length };
    return { items: [], total: 0 };
  }, []);

  const fetchIssues = useCallback(
    async (page: number, size: number) => {
      if (!workspaceSlug || !projectId || !milestoneId) return;
      setLoading(true);
      try {
        const res: any = await milestoneService.getMilestoneIssues(
          String(workspaceSlug),
          String(projectId),
          String(milestoneId),
          page,
          size
        );
        const normalized = normalizeListResponse(res);
        setIssues(normalized.items);
        setTotal(normalized.total);
      } catch (e: any) {
        message.error(e?.detail || e?.error || "获取关联工作项失败");
      } finally {
        setLoading(false);
      }
    },
    [workspaceSlug, projectId, milestoneId, normalizeListResponse]
  );

  const fetchAvailableIssues = useCallback(async (page: number, size: number) => {
    if (!workspaceSlug || !projectId || !milestoneId) return;
    setAvailableLoading(true);
    try {
      const res: any = await milestoneService.getUnselectedIssues(
        String(workspaceSlug),
        String(projectId),
        String(milestoneId),
        page,
        size,
        {
          type_id: availableTypeId,
          name: availableNameQuery.trim() ? availableNameQuery.trim() : undefined,
        }
      );
      const normalized = normalizeListResponse(res);
      setAvailableIssues(normalized.items);
      setAvailableTotal(normalized.total);
    } catch (e: any) {
      message.error(e?.detail || e?.error || "获取可关联工作项失败");
    } finally {
      setAvailableLoading(false);
    }
  }, [workspaceSlug, projectId, milestoneId, normalizeListResponse, availableTypeId, availableNameQuery]);

  useEffect(() => {
    fetchIssues(currentPage, pageSize);
  }, [fetchIssues, currentPage, pageSize]);

  useEffect(() => {
    if (!addModalOpen) return;
    fetchAvailableIssues(availableCurrentPage, availablePageSize);
  }, [addModalOpen, fetchAvailableIssues, availableCurrentPage, availablePageSize]);

  useEffect(() => {
    paginationRef.current = { page: currentPage, size: pageSize };
  }, [currentPage, pageSize]);

  useEffect(() => {
    const isPeekOpen = Boolean(peekIssue?.issueId);
    if (wasPeekOpenRef.current && !isPeekOpen) {
      fetchIssues(paginationRef.current.page, paginationRef.current.size);
    }
    wasPeekOpenRef.current = isPeekOpen;
  }, [fetchIssues, peekIssue?.issueId]);

  useEffect(() => {
    const fetchIssueTypes = async () => {
      if (!workspaceSlug || !projectId) return;
      const cachedTypes = projectIssueTypesCache.get(projectId.toString());
      if (cachedTypes) {
        setIssueTypesMap(cachedTypes);
        return;
      }

      try {
        const types = await projectIssueTypeService.fetchProjectIssueTypes(workspaceSlug.toString(), projectId.toString());
        const typesMap = types.reduce(
          (acc, type) => {
            acc[type.id] = type;
            return acc;
          },
          {} as Record<string, any>
        );
        projectIssueTypesCache.set(projectId.toString(), typesMap);
        setIssueTypesMap(typesMap);
      } catch {
        setIssueTypesMap(undefined);
      }
    };

    fetchIssueTypes();
  }, [workspaceSlug, projectId]);

  const handlePageChange = (page: number, size?: number) => {
    const nextSize = size ?? pageSize;
    if (page !== currentPage) setCurrentPage(page);
    if (nextSize !== pageSize) setPageSize(nextSize);
  };

  const handleAvailablePageChange = (page: number, size: number) => {
    if (size !== availablePageSize) {
      setAvailablePageSize(size);
      setAvailableCurrentPage(1);
      return;
    }
    if (page !== availableCurrentPage) setAvailableCurrentPage(page);
  };

  const handleAvailableTableChange: TableProps<TIssueRow>["onChange"] = (_pagination, filters) => {
    const nextTypeId = (filters?.type_id as string[] | undefined)?.[0];
    const nextName = (filters?.name as string[] | undefined)?.[0] ?? "";
    setAvailableTypeId(nextTypeId ? String(nextTypeId) : undefined);
    setAvailableNameQuery(String(nextName ?? ""));
    setAvailableCurrentPage(1);
  };

  const openAddModal = useCallback(() => {
    setAddModalOpen(true);
    setSelectedIssueIds([]);
    setAvailableCurrentPage(1);
    setAvailablePageSize(10);
    setAvailableTypeId(undefined);
    setAvailableNameQuery("");
  }, []);

  useEffect(() => {
    const handleOpen = () => openAddModal();
    window.addEventListener(OPEN_ADD_ISSUES_MODAL_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_ADD_ISSUES_MODAL_EVENT, handleOpen);
  }, [openAddModal]);

  const handleAddSelected = async () => {
    if (!workspaceSlug || !projectId || !milestoneId) return;
    const ids = selectedIssueIds.map(String).filter(Boolean);
    if (ids.length === 0) {
      message.warning("请选择要关联的工作项");
      return;
    }
    setAvailableLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map((issueId) =>
          milestoneService.addMilestoneIssue(String(workspaceSlug), String(projectId), String(milestoneId), issueId)
        )
      );
      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.length - successCount;
      if (successCount > 0) message.success(`已关联 ${successCount} 条`);
      if (failCount > 0) message.error(`关联失败 ${failCount} 条`);
      setAddModalOpen(false);
      setSelectedIssueIds([]);
      fetchIssues(currentPage, pageSize);
    } finally {
      setAvailableLoading(false);
    }
  };

  const handleRemove = async (issueId: string) => {
    if (!workspaceSlug || !projectId || !milestoneId) return;
    Modal.confirm({
      title: "确认移除关联？",
      okText: "移除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await milestoneService.removeMilestoneIssue(
            String(workspaceSlug),
            String(projectId),
            String(milestoneId),
            String(issueId)
          );
          message.success("已移除");
          fetchIssues(currentPage, pageSize);
        } catch (e: any) {
          message.error(e?.detail || e?.error || "移除失败");
        }
      },
    });
  };

  const issuesMap = useMemo(() => {
    const map: Record<string, any> = {};
    issues.forEach((issue) => {
      map[String(issue.id)] = issue;
    });
    return map;
  }, [issues]);

  const issueIds = useMemo(() => issues.map((i) => String(i.id)), [issues]);

  const selectionHelpers: TSelectionHelper = useMemo(
    () => ({
      handleClearSelection: () => {},
      handleEntityClick: () => {},
      getIsEntitySelected: () => false,
      getIsEntityActive: () => false,
      handleGroupClick: () => {},
      isGroupSelected: () => "empty",
      isSelectionDisabled: true,
    }),
    []
  );

  const canEditProperties = useCallback(
    (_projectId: string | undefined) => {
      if (!workspaceSlug || !projectId) return false;
      return allowPermissions(
        [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        EUserPermissionsLevel.PROJECT,
        workspaceSlug.toString(),
        projectId.toString()
      );
    },
    [allowPermissions, workspaceSlug, projectId]
  );

  const updateIssue = useCallback(
    async (pId: string | null | undefined, issueId: string, data: Record<string, any>) => {
      if (!workspaceSlug || !pId) return;
      try {
        const updated = await issueService.patchIssue(workspaceSlug.toString(), pId.toString(), issueId.toString(), data);
        setIssues((prev) =>
          prev.map((issue) => (issue.id.toString() === issueId.toString() ? { ...issue, ...updated } : issue))
        );
        await fetchIssues(paginationRef.current.page, paginationRef.current.size);
      } catch (e: any) {
        message.error(e?.detail || e?.error || "更新失败");
        throw e;
      }
    },
    [issueService, workspaceSlug, fetchIssues]
  );

  const renderQuickActions = useCallback(
    ({ issue }: { issue: any }) => (
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <CustomMenu placement="bottom-end" ellipsis>
          <CustomMenu.MenuItem onClick={() => handleRemove(String(issue.id))}>移除</CustomMenu.MenuItem>
        </CustomMenu>
      </div>
    ),
    [handleRemove]
  );

  const availableTypeOptions = useMemo(() => {
    if (!issueTypesMap) return [];
    return Object.values(issueTypesMap)
      .filter((t: any) => Boolean(t?.id))
      .map((t: any) => ({ value: String(t.id), label: String(t.name ?? t.id) }));
  }, [issueTypesMap]);

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <PageHead title="Milestone - Work Items" />

      <div className="relative size-full flex flex-col gap-3 overflow-hidden">
        <div
          ref={listContainerRef}
          className="size-full vertical-scrollbar scrollbar-lg relative overflow-auto vertical-scrollbar-margin-top-md bg-custom-background-90 rounded"
        >
          {issueIds.length === 0 && !loading ? (
            <div className="flex items-center justify-center py-10 text-custom-text-300">暂无工作项</div>
          ) : (
            issueIds.map((issueId, index) => (
              <IssueBlockRoot
                key={issueId}
                issueId={issueId}
                issuesMap={issuesMap}
                updateIssue={updateIssue as any}
                quickActions={({ issue }) => renderQuickActions({ issue })}
                canEditProperties={canEditProperties}
                displayProperties={DEFAULT_DISPLAY_PROPERTIES as any}
                nestingLevel={0}
                spacingLeft={0}
                containerRef={listContainerRef}
                selectionHelpers={selectionHelpers}
                groupId={ALL_ISSUES}
                isLastChild={index === issueIds.length - 1}
                isDragAllowed={false}
                canDropOverIssue={false}
                projectIssueTypesMap={issueTypesMap}
              />
            ))
          )}
          {loading && (
            <div className="flex items-center justify-center py-6 text-custom-text-300">{issueIds.length ? "加载中..." : "加载中..."}</div>
          )}
        </div>

        <div className="flex justify-end">
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            showTotal={(v) => `共 ${v} 条`}
            onChange={handlePageChange}
            disabled={loading}
          />
        </div>
      </div>

      <MilestoneAddIssuesModal
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={handleAddSelected}
        loading={availableLoading}
        issues={availableIssues}
        currentPage={availableCurrentPage}
        pageSize={availablePageSize}
        total={availableTotal}
        onPageChange={handleAvailablePageChange}
        selectedIssueIds={selectedIssueIds}
        setSelectedIssueIds={setSelectedIssueIds}
        getIssueLabel={getIssueLabel}
        typeOptions={availableTypeOptions}
        selectedTypeId={availableTypeId}
        nameQuery={availableNameQuery}
        onTableChange={handleAvailableTableChange}
      />
    </div>
  );
}

export default observer(ProjectMilestoneIssuesPage);
