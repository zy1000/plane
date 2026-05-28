"use client";
import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Modal } from "antd";
import { Button } from "@plane/propel/button";
import {
  EUserPermissions,
  EUserPermissionsLevel,
  PROJECT_ERROR_MESSAGES,
  isProjectPermissionError,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Dialog, Transition } from "@headlessui/react";
import { Loader } from "@plane/ui";
import { ReleaseService } from "@/services/release.service";
import { WorkspaceService } from "@/services/workspace.service";
import { renderFormattedPayloadDate, findTotalDaysInRange } from "@plane/utils";
import { EFileAssetType } from "@plane/types";
import { useRelease } from "@/hooks/store/use-release";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useUserPermissions } from "@/hooks/store/user";
import useLocalStorage from "@/hooks/use-local-storage";
import { RichTextEditor } from "@/components/editor/rich-text";
import { formatReleaseUpdateError } from "@/components/releases/use-release-error-message";
import {
  ReleaseActivityTab,
  ReleaseMaterialsTab,
  ReleaseOverviewTab,
  ReleasePageTabs,
  ReleaseQualityTab,
  DEFAULT_RELEASE_DETAIL_TAB,
  getReleaseDetailTabStorageKey,
  RELEASE_DETAIL_TABS,
  formatReleaseOverviewDateRange,
} from "@/components/releases/release-overview";
import type { ReleaseDetailTabKey, ReleaseTabItem } from "@/components/releases/release-overview";
import type { TReleaseUpdatePayload } from "@/components/releases/release-status-dropdown";

type Props = {
  releaseId: string;
  isArchived?: boolean;
  isOpen?: boolean;
  showTabs?: boolean;
};

type TReleaseFile = {
  id: string;
  name: string;
  size: number;
  created_at: string;
};

const DEFAULT_TAB = DEFAULT_RELEASE_DETAIL_TAB;

export const ReleaseDetailContent: React.FC<Props> = observer(({ releaseId, isArchived, isOpen, showTabs = true }) => {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const { getReleaseById, fetchReleaseDetails, updateReleaseDetails } = useRelease();
  const releaseDetails = getReleaseById(releaseId);
  const { getWorkspaceBySlug } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  const workspaceId = workspaceSlug ? getWorkspaceBySlug(workspaceSlug.toString())?.id : undefined;
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const workspaceService = useMemo(() => new WorkspaceService(), []);
  const { storedValue: storedTab, setValue: setStoredTab } = useLocalStorage<ReleaseDetailTabKey | "scope" | "note">(
    getReleaseDetailTabStorageKey(releaseId),
    DEFAULT_TAB
  );
  const activeTab: ReleaseDetailTabKey =
    storedTab === "scope" || storedTab === "note" ? "materials" : (storedTab ?? DEFAULT_TAB);

  const todayStr = renderFormattedPayloadDate(new Date());
  const rawDays =
    releaseDetails?.target_date && todayStr
      ? findTotalDaysInRange(todayStr, releaseDetails.target_date, false)
      : undefined;
  const daysLeft = typeof rawDays === "number" ? Math.max(0, rawDays) : undefined;

  const releaseService = useMemo(() => new ReleaseService(), []);

  const [cycles, setCycles] = useState<any[]>([]);
  const [cyclesLoading, setCyclesLoading] = useState(false);
  const [cyclesError, setCyclesError] = useState<string | null>(null);

  const [associateOpen, setAssociateOpen] = useState(false);
  const [selectLoading, setSelectLoading] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [selectPage, setSelectPage] = useState(1);
  const [selectPageSize, setSelectPageSize] = useState(10);
  const [selectTotal, setSelectTotal] = useState(0);
  const [selectData, setSelectData] = useState<any[]>([]);
  const [selectedCycleIds, setSelectedCycleIds] = useState<string[]>([]);

  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<any | null>(null);

  const [plans, setPlans] = useState<any[]>([]);
  const [planAssociateOpen, setPlanAssociateOpen] = useState(false);
  const [selectablePlans, setSelectablePlans] = useState<any[]>([]);
  const [selectablePlansLoading, setSelectablePlansLoading] = useState(false);
  const [selectablePlansError, setSelectablePlansError] = useState<string | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [associatingPlans, setAssociatingPlans] = useState(false);
  const [cancelingPlanId, setCancelingPlanId] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteHtml, setNoteHtml] = useState<string>("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [releaseFiles, setReleaseFiles] = useState<TReleaseFile[]>([]);
  const [releaseFilesLoading, setReleaseFilesLoading] = useState(false);
  const [releaseFilesError, setReleaseFilesError] = useState<string | null>(null);
  const [releaseFilesTotal, setReleaseFilesTotal] = useState(0);
  const [releaseFilesUploading, setReleaseFilesUploading] = useState(false);
  const [releaseFilesDeletingId, setReleaseFilesDeletingId] = useState<string | null>(null);
  const [releaseFilesDownloadingId, setReleaseFilesDownloadingId] = useState<string | null>(null);

  // 与后端 CustomPaginator.max_page_size 一致，单次请求上限；多页时循环拉取直至全部
  const RELEASE_FILES_PAGE_SIZE = 100;

  const releaseOverdueSwrKey =
    workspaceSlug && projectId && releaseId
      ? `release-overdue-by-assignee-${workspaceSlug}-${projectId}-${releaseId}`
      : null;
  const { data: releaseOverdueByAssignee, mutate: mutateReleaseOverdueByAssignee } = useSWR(
    releaseOverdueSwrKey,
    () =>
      releaseService.getReleaseOverdueByAssignee(
        workspaceSlug!.toString(),
        projectId!.toString(),
        releaseId
      )
  );

  const resolveReleaseFileApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
    if (typeof error === "string" && error.trim()) return error;
    if (!error || typeof error !== "object") return fallbackMessage;

    const err = error as {
      error?: unknown;
      detail?: unknown;
      message?: unknown;
    };

    const raw = [err.error, err.detail, err.message];
    for (const candidate of raw) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
      if (Array.isArray(candidate)) {
        const firstText = candidate.find((item) => typeof item === "string" && item.trim());
        if (typeof firstText === "string") return firstText;
      }
    }

    return fallbackMessage;
  };

  const showReleaseFileApiError = (error: unknown, genericTitle: string, genericMessage: string) => {
    if (isProjectPermissionError(error)) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
        message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
          ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
          : undefined,
      });
    } else {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: genericTitle,
        message: resolveReleaseFileApiErrorMessage(error, genericMessage),
      });
    }
  };

  const fetchReleaseStatistics = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setStatsLoading(true);
      setStatsError(null);
      const data = await releaseService.getReleaseStatistics(workspaceSlug.toString(), projectId.toString(), releaseId);
      setStats(data ?? null);
    } catch (e: any) {
      setStatsError(e?.detail || e?.error || "获取统计信息失败");
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchPlans = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setPlansLoading(true);
      setPlansError(null);
      const data = await releaseService.getReleasePlans(workspaceSlug.toString(), projectId.toString(), releaseId);
      setPlans(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setPlansError(e?.detail || e?.error || "获取测试计划失败");
    } finally {
      setPlansLoading(false);
    }
  };

  const openPlanAssociateModal = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    setPlanAssociateOpen(true);
    setSelectedPlanIds([]);
    setSelectablePlansLoading(true);
    setSelectablePlansError(null);
    try {
      const res = await releaseService.getReleaseSelectablePlans(
        workspaceSlug.toString(),
        projectId.toString(),
        releaseId
      );
      setSelectablePlans(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      setSelectablePlansError(e?.error || e?.detail || "获取可选测试计划失败");
      setSelectablePlans([]);
    } finally {
      setSelectablePlansLoading(false);
    }
  };

  const handleConfirmAssociatePlans = async () => {
    if (!workspaceSlug || !projectId || !releaseId || selectedPlanIds.length === 0) return;
    try {
      setAssociatingPlans(true);
      await releaseService.associateReleasePlans(
        workspaceSlug.toString(),
        projectId.toString(),
        releaseId,
        selectedPlanIds
      );
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "关联成功",
        message: `已关联 ${selectedPlanIds.length} 个测试计划`,
      });
      setPlanAssociateOpen(false);
      setSelectedPlanIds([]);
      void fetchPlans();
    } catch (e: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "关联失败",
        message: e?.error || e?.detail || "请稍后重试",
      });
    } finally {
      setAssociatingPlans(false);
    }
  };

  const handleCancelPlanAssociation = async (planId: string) => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setCancelingPlanId(planId);
      await releaseService.cancelReleasePlanAssociation(
        workspaceSlug.toString(),
        projectId.toString(),
        releaseId,
        [planId]
      );
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已取消关联", message: "测试计划已取消关联" });
      void fetchPlans();
    } catch (e: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "操作失败",
        message: e?.error || e?.detail || "请稍后重试",
      });
    } finally {
      setCancelingPlanId(null);
    }
  };

  const fetchCycles = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setCyclesLoading(true);
      setCyclesError(null);
      const data = await releaseService.getCycleList(workspaceSlug.toString(), projectId.toString(), releaseId);
      setCycles(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setCyclesError(e?.detail || e?.error || "获取迭代列表失败");
    } finally {
      setCyclesLoading(false);
    }
  };

  const fetchReleaseFiles = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setReleaseFilesLoading(true);
      setReleaseFilesError(null);
      const all: TReleaseFile[] = [];
      let total = 0;
      let page = 1;
      for (;;) {
        const res = await releaseService.getReleaseFileList(
          workspaceSlug.toString(),
          projectId.toString(),
          releaseId,
          { page, page_size: RELEASE_FILES_PAGE_SIZE }
        );
        const list = Array.isArray(res?.data) ? res.data : [];
        if (page === 1) {
          total = Number(res?.count ?? 0);
        }
        all.push(...list);
        if (list.length === 0) break;
        if (total > 0 && all.length >= total) break;
        if (list.length < RELEASE_FILES_PAGE_SIZE) break;
        page += 1;
        if (page > 500) break;
      }
      setReleaseFiles(all);
      setReleaseFilesTotal(total > 0 ? total : all.length);
    } catch (e: unknown) {
      if (isProjectPermissionError(e)) {
        setReleaseFilesError(t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title));
      } else {
        const err = e as { detail?: string; error?: string };
        setReleaseFilesError(err?.detail || err?.error || "获取文件列表失败");
      }
    } finally {
      setReleaseFilesLoading(false);
    }
  };

  const handleUploadReleaseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setReleaseFilesUploading(true);
      await releaseService.uploadReleaseFile(
        workspaceSlug.toString(),
        projectId.toString(),
        releaseId.toString(),
        file
      );
      setToast({ type: TOAST_TYPE.SUCCESS, title: "上传成功", message: "文件已上传" });
      await fetchReleaseFiles();
    } catch (e: unknown) {
      showReleaseFileApiError(e, "上传失败", "请稍后重试");
    } finally {
      event.target.value = "";
      setReleaseFilesUploading(false);
    }
  };

  const handleDeleteReleaseFile = async (fileId: string) => {
    try {
      setReleaseFilesDeletingId(fileId);
      await releaseService.deleteReleaseFile(workspaceSlug!.toString(), projectId!.toString(), fileId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "删除成功", message: "文件已删除" });
      await fetchReleaseFiles();
    } catch (e: unknown) {
      showReleaseFileApiError(e, "删除失败", "请稍后重试");
    } finally {
      setReleaseFilesDeletingId(null);
    }
  };

  const handleDownloadReleaseFile = async (fileId: string, _fileName: string) => {
    try {
      setReleaseFilesDownloadingId(fileId);
      const url = await releaseService.downloadReleaseFile(
        workspaceSlug!.toString(),
        projectId!.toString(),
        fileId
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      showReleaseFileApiError(e, "下载失败", "请稍后重试");
    } finally {
      setReleaseFilesDownloadingId(null);
    }
  };

  const fetchSelectable = async (page = selectPage, pageSize = selectPageSize) => {
    if (!workspaceSlug || !projectId) return;
    try {
      setSelectLoading(true);
      setSelectError(null);
      const res = await releaseService.selectCycleList(workspaceSlug.toString(), projectId.toString(), {
        page,
        page_size: pageSize,
      });
      const list = res?.data ?? res?.results ?? [];
      const count = res?.count ?? res?.total_results ?? 0;
      setSelectData(Array.isArray(list) ? list : []);
      setSelectTotal(Number(count) || 0);
      setSelectPage(page);
      setSelectPageSize(pageSize);
    } catch (e: any) {
      setSelectError(e?.detail || e?.error || "获取可选迭代失败");
    } finally {
      setSelectLoading(false);
    }
  };

  const prevReleaseIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (prevReleaseIdRef.current !== undefined && prevReleaseIdRef.current !== releaseId) {
      setStoredTab(DEFAULT_TAB);
    }
    prevReleaseIdRef.current = releaseId;
  }, [releaseId, setStoredTab]);

  useEffect(() => {
    if (!isOpen || !workspaceSlug || !projectId || !releaseId) return;

    setAssociateOpen(false);
    setSelectedCycleIds([]);
    fetchReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId);
    fetchCycles();
    fetchReleaseStatistics();
    fetchReleaseFiles();
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchReleaseDetails, isOpen, releaseId, projectId, workspaceSlug]);

  const handleNoteEditorUploadFile = async (blockId: string | undefined, file: File) => {
    if (!workspaceSlug || !projectId) throw new Error("Missing context");
    const { asset_id } = await uploadEditorAsset({
      blockId: blockId ?? "",
      data: {
        entity_identifier: projectId.toString(),
        entity_type: EFileAssetType.PROJECT_DESCRIPTION,
      },
      file,
      projectId: projectId.toString(),
      workspaceSlug: workspaceSlug.toString(),
    });
    return asset_id;
  };

  const handleNoteEditorDuplicateFile = async (assetId: string) => {
    if (!workspaceSlug || !projectId) throw new Error("Missing context");
    const { asset_id } = await duplicateEditorAsset({
      assetId,
      entityId: projectId.toString(),
      entityType: EFileAssetType.PROJECT_DESCRIPTION,
      projectId: projectId.toString(),
      workspaceSlug: workspaceSlug.toString(),
    });
    return asset_id;
  };

  const handleNoteOpen = () => {
    setNoteHtml(releaseDetails?.note || "");
    setNoteOpen(true);
  };

  const handleNoteSubmit = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setNoteSubmitting(true);
      await releaseService.updateNote(workspaceSlug.toString(), projectId.toString(), releaseId, noteHtml);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "更新成功", message: "发布日志已更新" });
      setNoteOpen(false);
      await fetchReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId);
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "更新失败", message: e?.detail || e?.error || "请稍后重试" });
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleReleaseDetailsChange = async (payload: TReleaseUpdatePayload) => {
    if (!workspaceSlug || !projectId) return;

    await updateReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId, payload)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: "Release updated successfully.",
        });
      })
      .catch((err) => {
        if (isProjectPermissionError(err)) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
            message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
              ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
              : undefined,
          });
        } else {
          const { title, message } = formatReleaseUpdateError(err);
          setToast({
            type: TOAST_TYPE.ERROR,
            title,
            message,
          });
        }
      });
  };

  const handleAssociateClose = () => {
    setAssociateOpen(false);
    setSelectedCycleIds([]);
    void fetchReleaseStatistics();
    void mutateReleaseOverdueByAssignee();
  };

  const handleAssociateConfirm = async () => {
    if (!workspaceSlug || !projectId || !releaseId || selectedCycleIds.length === 0) {
      handleAssociateClose();
      return;
    }
    try {
      const payloads = selectedCycleIds.map((cid) => ({ release_id: releaseId, cycle_id: cid }));
      await Promise.all(
        payloads.map((p) => releaseService.associateCycle(workspaceSlug.toString(), projectId.toString(), p))
      );
      setToast({ type: TOAST_TYPE.SUCCESS, title: "关联成功", message: "已关联所选迭代" });
      handleAssociateClose();
      fetchCycles();
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "关联失败", message: e?.detail || e?.error || "请稍后重试" });
    }
  };

  const handleCancelAssociation = async (cycleId: string) => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      await releaseService.cancelCycleAssociation(workspaceSlug.toString(), projectId.toString(), {
        release_id: releaseId,
        cycle_id: cycleId,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已取消关联", message: "迭代已取消关联" });
      fetchCycles();
      void fetchReleaseStatistics();
      void mutateReleaseOverdueByAssignee();
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: e?.detail || e?.error || "请稍后重试" });
    }
  };

  const totalIssues = Number(stats?.total_issues ?? 0);
  const backlogIssues = Number(stats?.state_distribution?.backlog ?? 0);
  const inProgressIssues = Number(
    (stats?.state_distribution?.unstarted ?? 0) + (stats?.state_distribution?.started ?? 0)
  );
  const completedIssues = Number(stats?.state_distribution?.completed ?? 0);
  const cancelledIssues = Number(stats?.state_distribution?.cancelled ?? 0);
  const progress = totalIssues > 0 ? Math.floor((completedIssues / totalIssues) * 100) : 0;
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  const releaseTabs: ReleaseTabItem[] = useMemo(
    () => [
      ...RELEASE_DETAIL_TABS.map((tab) =>
        tab.key === "materials" ? { ...tab, badge: cycles.length + plans.length + releaseFilesTotal } : tab
      ),
    ],
    [cycles.length, plans.length, releaseFilesTotal]
  );

  if (!releaseDetails) {
    return (
      <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
        <div className="flex flex-col gap-5 px-6 py-4">
          <Loader className="max-w-xl">
            <Loader.Item height="16px" />
            <Loader.Item height="16px" />
            <Loader.Item height="16px" />
          </Loader>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className="flex min-h-full flex-col gap-4 px-6 py-4">
        {showTabs && <ReleasePageTabs tabs={releaseTabs} activeTab={activeTab} onChange={(key) => setStoredTab(key)} />}

        <div
          id={`release-tab-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`release-tab-${activeTab}`}
          className="min-h-0 flex-1"
        >
          {activeTab === "overview" && (
            <ReleaseOverviewTab
              workspaceSlug={workspaceSlug?.toString() ?? ""}
              projectId={projectId?.toString() ?? ""}
              releaseId={releaseId}
              releaseDetails={releaseDetails}
              isStatusDisabled={!isEditingAllowed || Boolean(isArchived)}
              totalIssues={totalIssues}
              backlogIssues={backlogIssues}
              inProgressIssues={inProgressIssues}
              completedIssues={completedIssues}
              cancelledIssues={cancelledIssues}
              progress={progress}
              daysLeft={daysLeft}
              cyclesCount={cycles.length}
              plansCount={plans.length}
              filesCount={releaseFilesTotal}
              plans={plans}
              overdueTotal={releaseOverdueByAssignee?.total ?? 0}
              noteHtml={releaseDetails.note}
              onReleaseDetailsChange={handleReleaseDetailsChange}
              onJumpTab={(key) => setStoredTab(key)}
              onEditNote={handleNoteOpen}
            />
          )}

          {activeTab === "materials" && (
            <ReleaseMaterialsTab
              workspaceSlug={workspaceSlug?.toString() ?? ""}
              projectId={projectId?.toString() ?? ""}
              cycles={cycles}
              cyclesLoading={cyclesLoading}
              cyclesError={cyclesError}
              plans={plans}
              plansLoading={plansLoading}
              plansError={plansError}
              cancelingPlanId={cancelingPlanId}
              files={releaseFiles}
              filesLoading={releaseFilesLoading}
              filesError={releaseFilesError}
              filesUploading={releaseFilesUploading}
              filesDeletingId={releaseFilesDeletingId}
              filesDownloadingId={releaseFilesDownloadingId}
              onOpenCycleAssociate={() => {
                setAssociateOpen(true);
                fetchSelectable(1, selectPageSize);
              }}
              onCancelCycleAssociation={handleCancelAssociation}
              onOpenPlanAssociate={() => void openPlanAssociateModal()}
              onCancelPlanAssociation={handleCancelPlanAssociation}
              onTriggerUploadFile={() => fileInputRef.current?.click()}
              onDeleteFile={handleDeleteReleaseFile}
              onDownloadFile={handleDownloadReleaseFile}
            />
          )}

          {activeTab === "quality" && (
            <ReleaseQualityTab
              totalIssues={totalIssues}
              backlogIssues={backlogIssues}
              inProgressIssues={inProgressIssues}
              completedIssues={completedIssues}
              cancelledIssues={cancelledIssues}
              progress={progress}
              plans={plans}
              overdueData={releaseOverdueByAssignee}
            />
          )}

          {activeTab === "activity" && (
            <ReleaseActivityTab
              workspaceSlug={workspaceSlug?.toString() ?? ""}
              projectId={projectId?.toString() ?? ""}
              releaseId={releaseId}
            />
          )}
        </div>
      </div>

      {/* 隐藏的附件上传 input：保留在父组件以便 ScopeTab 的“上传”按钮触发 */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadReleaseFile} />

      {/* 关联迭代弹层 */}
      <Transition.Root show={associateOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[10000]" onClose={handleAssociateClose}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-backdrop transition-opacity" />
          </Transition.Child>
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-surface-1 text-left shadow-overlay-100 transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">选择迭代</h3>
                      <Button variant="secondary" onClick={handleAssociateClose}>
                        关闭
                      </Button>
                    </div>
                    <div className="mt-3">
                      {selectLoading && (
                        <div className="flex items-center justify-center py-8 text-sm text-secondary">
                          加载中...
                        </div>
                      )}
                      {selectError && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                          {selectError}
                        </div>
                      )}
                      {!selectLoading && !selectError && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full table-fixed">
                            <thead>
                              <tr className="text-left text-xs text-secondary border-b border-subtle">
                                <th className="w-10 px-2 py-2"></th>
                                <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">名称</th>
                                <th className="w-2/5 px-2 py-2 text-sm font-medium tabular-nums text-primary">日期</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectData.length === 0 && (
                                <tr>
                                  <td className="px-2 py-6 text-sm text-secondary" colSpan={3}>
                                    暂无可选迭代
                                  </td>
                                </tr>
                              )}
                              {selectData.map((c) => {
                                const checked = selectedCycleIds.includes(c.id);
                                return (
                                  <tr key={c.id} className="border-b border-subtle hover:bg-layer-1-hover">
                                    <td className="px-2 py-2">
                                      <input
                                        type="checkbox"
                                        className="size-4"
                                        checked={checked}
                                        onChange={(e) => {
                                          const v = e.target.checked;
                                          setSelectedCycleIds((prev) => {
                                            if (v) return Array.from(new Set([...prev, c.id]));
                                            return prev.filter((x) => x !== c.id);
                                          });
                                        }}
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <span className="truncate text-sm text-primary">{c.name}</span>
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-2 text-sm tabular-nums text-primary">
                                      {formatReleaseOverviewDateRange(c.start_date, c.end_date)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="text-sm text-secondary">共 {selectTotal} 条</div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="secondary"
                                disabled={selectPage <= 1}
                                onClick={() => fetchSelectable(selectPage - 1, selectPageSize)}
                              >
                                上一页
                              </Button>
                              <div className="text-sm">第 {selectPage} 页</div>
                              <Button
                                variant="secondary"
                                disabled={selectPage * selectPageSize >= selectTotal}
                                onClick={() => fetchSelectable(selectPage + 1, selectPageSize)}
                              >
                                下一页
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="secondary" onClick={handleAssociateClose}>
                        取消
                      </Button>
                      <Button variant="primary" onClick={handleAssociateConfirm} disabled={selectedCycleIds.length === 0}>
                        确定
                      </Button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

      {/* 编辑发布日志弹层 */}
      <Transition.Root show={noteOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[100]" onClose={() => setNoteOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-backdrop transition-opacity" />
          </Transition.Child>
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-surface-1 text-left shadow-overlay-100 transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">编辑发布日志</h3>
                      <Button variant="secondary" onClick={() => setNoteOpen(false)}>
                        关闭
                      </Button>
                    </div>
                    <div className="mt-3">
                      <RichTextEditor
                        id="release-note-editor"
                        editable
                        initialValue={noteHtml ?? ""}
                        workspaceSlug={workspaceSlug?.toString() ?? ""}
                        workspaceId={workspaceId ?? ""}
                        projectId={projectId?.toString() ?? ""}
                        onChange={(_: any, val: string) => setNoteHtml(val)}
                        uploadFile={handleNoteEditorUploadFile}
                        duplicateFile={handleNoteEditorDuplicateFile}
                        searchMentionCallback={async (payload) =>
                          await workspaceService.searchEntity(workspaceSlug?.toString() ?? "", {
                            ...payload,
                            project_id: projectId?.toString() ?? "",
                          })
                        }
                        containerClassName="min-h-[180px] rounded-md"
                      />
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setNoteOpen(false)}
                        disabled={noteSubmitting}
                      >
                        取消
                      </Button>
                      <Button onClick={handleNoteSubmit} disabled={noteSubmitting} loading={noteSubmitting}>
                        确定
                      </Button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

      {/* 关联测试计划弹层 */}
      <Modal
        title="关联测试计划"
        open={planAssociateOpen}
        onCancel={() => setPlanAssociateOpen(false)}
        onOk={handleConfirmAssociatePlans}
        okText="确定"
        cancelText="取消"
        okButtonProps={{
          disabled: selectedPlanIds.length === 0 || selectablePlansLoading,
          loading: associatingPlans,
        }}
        width={720}
        destroyOnClose
      >
        <div className="mt-2">
          {selectablePlansLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
          ) : selectablePlansError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {selectablePlansError}
            </div>
          ) : (
            <div className="max-h-[min(480px,60vh)] overflow-y-auto overflow-x-auto vertical-scrollbar scrollbar-sm">
              <table className="min-w-full table-fixed">
                <thead>
                  <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                    <th className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={
                          selectablePlans.length > 0 &&
                          selectedPlanIds.length === selectablePlans.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) setSelectedPlanIds(selectablePlans.map((p: any) => p.id));
                          else setSelectedPlanIds([]);
                        }}
                      />
                    </th>
                    <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">名称</th>
                    <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">状态</th>
                    <th className="w-2/5 px-2 py-2 text-sm font-medium tabular-nums text-primary">日期</th>
                  </tr>
                </thead>
                <tbody>
                  {selectablePlans.length === 0 ? (
                    <tr>
                      <td className="px-2 py-6 text-sm text-secondary" colSpan={4}>
                        暂无可选测试计划
                      </td>
                    </tr>
                  ) : (
                    selectablePlans.map((plan: any) => {
                      const checked = selectedPlanIds.includes(plan.id);
                      return (
                        <tr key={plan.id} className="border-b border-subtle hover:bg-layer-1-hover">
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={checked}
                              onChange={(e) => {
                                const v = e.target.checked;
                                setSelectedPlanIds((prev) => {
                                  if (v) return Array.from(new Set([...prev, plan.id]));
                                  return prev.filter((x) => x !== plan.id);
                                });
                              }}
                            />
                          </td>
                          <td className="truncate px-2 py-2 text-sm text-primary" title={plan.name ?? "-"}>
                            {plan.name ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-sm text-primary">{plan.state ?? "-"}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-sm tabular-nums text-primary">
                            {formatReleaseOverviewDateRange(plan.begin_time, plan.end_time)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
});
