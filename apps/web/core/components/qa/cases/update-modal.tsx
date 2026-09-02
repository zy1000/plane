// 顶部：添加 client 指令与必要的导入
"use client";
import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { cn } from "@plane/utils";
import { CaseService } from "../../../services/qa/case.service";
import { CaseService as ReviewApiService } from "../../../services/qa/review.service";
import { Tag, Spin, Tooltip, Input, Table, Select, Button } from "antd";
import { getEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import { useMember } from "@/hooks/store/use-member";
import * as LucideIcons from "lucide-react";
import { ModalHeader } from "./update-modal/modal-header";
import { TitleInput } from "./update-modal/title-input";
import { CaseMetaForm } from "./update-modal/case-meta-form";
import { BasicInfoPanel } from "./update-modal/basic-info-panel";
import { AttachmentsPanel } from "./update-modal/attachments-panel";
import { SideInfoPanel } from "./update-modal/side-info-panel";
import { FileUploadService, generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import { FileService } from "@/services/file.service";
import { WorkItemDisplayModal } from "./work-item-display-modal";
import { RequirementDisplayPanel } from "./requirement-display-panel";
import { CaseReviewRecordsTable } from "./case-review-records-table";
import { RequirementSelectModal } from "./requirement-select-modal";
import { WorkItemSelectModal } from "./work-item-select-modal";
import { workItemTypeName, type TWorkItemType } from "./work-item-category";
import { PlusOutlined } from "@ant-design/icons";
import { EFileAssetType, type TIssue } from "@plane/types";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { formatCNDateTime } from "./util";
import styles from "./update-modal.module.css";
import { ExecutionRecordDetailModal } from "../execution/execution-records";
import { TestCaseActivityTab } from "./test-case-activity/test-case-activity-tab";
import { useTranslation } from "@plane/i18n";
import { useUserPermissions } from "@/hooks/store/user";
import {
  qaCaseErrorContent,
  qaCaseSetToastError,
  qaCaseSetToastSuccess,
  qaCaseSetToastWarning,
} from "@/utils/qa-case-error";

const QA_CASE_EDIT_PERMISSION_KEY = "qa.case.edit" as const;

type UpdateModalProps = {
  open: boolean;
  onClose: () => void;
  canEdit?: boolean;
  caseId?: string; // 改为传入case ID而不是完整数据
  workspaceSlug?: string;
  projectId?: string;
  // 模板库模式：保存走 workspace 级模板用例接口，只保留「基本信息」tab，隐藏项目语境区块
  templateMode?: boolean;
  // 渲染形态：drawer = 抽屉（默认，portal + 遮罩）；page = 独立页面（直接平铺，无头部/底部操作条）
  variant?: "drawer" | "page";
  // 用例数据加载/更新后回调（独立页面用它取用例名、所属用例库渲染面包屑）
  onCaseDataChange?: (caseData: any) => void;
};

function UpdateModalBody({
  open,
  onClose,
  canEdit,
  caseId,
  workspaceSlug: propWorkspaceSlug,
  projectId: propProjectId,
  templateMode = false,
  variant = "drawer",
  onCaseDataChange,
}: UpdateModalProps) {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<string>("basic");
  const isPage = variant === "page";
  /** 「需求」tab（requirement 域的真需求）的选择器开关与刷新令牌 */
  const [isRequirementModalOpen, setIsRequirementModalOpen] = useState(false);
  const [requirementReloadToken, setRequirementReloadToken] = useState(0);
  // 增加：本地状态与失焦更新逻辑
  const params = useParams() as { workspaceSlug?: string; projectId?: string };
  const workspaceSlug = propWorkspaceSlug || params.workspaceSlug;
  const projectId = propProjectId || params.projectId;
  const projectIdStr = projectId ? String(projectId) : "";
  const { allowProjectPermissionKeys } = useUserPermissions();
  const canEditCase =
    canEdit ??
    allowProjectPermissionKeys([QA_CASE_EDIT_PERMISSION_KEY], workspaceSlug ? String(workspaceSlug) : "", projectIdStr);
  const caseService = React.useMemo(() => new CaseService(), []);
  const reviewService = React.useMemo(() => new ReviewApiService(), []);

  /**
   * 单点保存：所有用例字段更新统一走这里。
   * 模板库模式走 workspace 级模板用例接口（payload 含 id）；项目模式维持原 updateCase 调用。
   */
  const persistCase = async (payload: any) => {
    if (templateMode) return caseService.updateTemplateCase(String(workspaceSlug), payload);
    return caseService.updateCase(String(workspaceSlug), projectIdStr, payload);
  };
  const loadSeqRef = React.useRef<number>(0);
  const [initialLoading, setInitialLoading] = React.useState<boolean>(false);
  const [initialReady, setInitialReady] = React.useState<boolean>(false);

  // 新增：用例数据状态
  const [caseData, setCaseData] = React.useState<any>(null);

  // 用例数据变化时通知外部（首次加载与失焦保存后的本地合并都会触发）
  React.useEffect(() => {
    if (caseData) onCaseDataChange?.(caseData);
  }, [caseData, onCaseDataChange]);
  const [labelList, setLabelList] = React.useState<any[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  const [title, setTitle] = React.useState<string>("");
  const [codeValue, setCodeValue] = React.useState<string>("");

  const handleBlurTitle = async () => {
    if (!canEditCase) return;
    const newName = title?.trim();
    const oldName = (caseData?.name ?? "").trim();
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;
    if (newName === oldName) return;
    try {
      await persistCase({ id: caseId, name: newName });
      // 本地 optimistic 更新，避免再次请求导致闪动
      setCaseData((prev: any) => (prev ? { ...prev, name: newName } : prev));
    } catch (e) {
      qaCaseSetToastError(e, t, "更新名称失败");
    }
  };

  const handleBlurCode = async () => {
    if (!canEditCase) return;
    const newCode = (codeValue ?? "").trim();
    const oldCode = String(caseData?.code ?? "");
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;
    if (newCode === oldCode) return;
    try {
      await persistCase({ id: caseId, code: newCode });
      setCaseData((prev: any) => (prev ? { ...prev, code: newCode } : prev));
    } catch (e) {
      qaCaseSetToastError(e, t, "更新编号失败");
    }
  };

  const handleCreateLabel = async (name: string) => {
    if (!canEditCase) return;
    // 允许 repository_id 为空，因为可能不是必须的
    if (!name || !workspaceSlug || !caseId) return;
    try {
      // 传递 repository_id，如果 caseData 中没有，尝试使用默认值或空字符串
      const repoId = caseData?.repository || "";
      const res = await caseService.createlabel(workspaceSlug, name, caseId, repoId);
      const newLabel = Array.isArray(res) ? res[0] : res;
      if (newLabel && newLabel.id) {
        setLabelList((prev) => [...prev, newLabel]);
      }
    } catch (error) {
      console.error("创建标签失败:", error);
      qaCaseSetToastError(error, t, "创建标签失败");
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId) return;
    try {
      await caseService.deletelabel(workspaceSlug, labelId, caseId);
      setLabelList((prev) => prev.filter((l) => l.id !== labelId));
    } catch (error) {
      console.error("删除标签失败:", error);
      qaCaseSetToastError(error, t, "删除标签失败");
    }
  };

  // 新增：统一将 id/枚举值规范化为字符串，保证与下拉 options 的 value 类型一致
  const normalizeId = (v: any): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "object") {
      const id = v.id ?? v.value ?? v.uuid;
      return id ? String(id) : undefined;
    }
    return String(v);
  };
  const stepsText = React.useMemo(() => {
    const s = caseData?.steps;
    if (Array.isArray(s)) {
      return s
        .map((item: any, idx: number) => {
          const desc = item?.description ?? "";
          const result = item?.result ?? "";
          return `${idx + 1}. ${desc}${result ? `（结果：${result}）` : ""}`;
        })
        .join("；");
    }
    return String(s ?? "");
  }, [caseData?.steps]);

  const [reloadToken, setReloadToken] = React.useState<number>(0);
  const [isWorkItemModalOpen, setIsWorkItemModalOpen] = React.useState<boolean>(false);
  const [forceTypeName, setForceTypeName] = React.useState<TWorkItemType | undefined>(undefined);
  const [currentCount, setCurrentCount] = React.useState<number>(0);
  const [currentLabel, setCurrentLabel] = React.useState<string>("");
  const [preselectedIssues, setPreselectedIssues] = React.useState<TIssue[]>([]);

  // 执行记录：类型定义与本地状态
  type TExecRecord = {
    id?: string | number;
    name?: string;
    result?: string;
    created_by?: string | null;
    created_at?: string;
    steps?: any;
  };
  const [execDetailModalOpen, setExecDetailModalOpen] = React.useState<boolean>(false);
  const [execDetailRecord, setExecDetailRecord] = React.useState<TExecRecord | null>(null);
  const [execLoading, setExecLoading] = React.useState<boolean>(false);
  const [execError, setExecError] = React.useState<string | null>(null);
  const [execList, setExecList] = React.useState<TExecRecord[]>([]);
  const [execTotal, setExecTotal] = React.useState<number>(0);
  const [execPage, setExecPage] = React.useState<number>(1);
  const [execPageSize, setExecPageSize] = React.useState<number>(10);
  const execPageSizeOptions = [10, 20, 50, 100];

  // 执行记录：请求方法
  const fetchExecRecords = async () => {
    if (!workspaceSlug || !caseId) return;
    setExecLoading(true);
    setExecError(null);
    try {
      const res = await caseService.getCaseExecuteRecord(String(workspaceSlug), String(caseId));
      const list = Array.isArray((res as any)?.data) ? (res as any).data : Array.isArray(res) ? (res as any) : [];
      const count = (res as any)?.count ?? list.length;
      setExecList(list);
      setExecTotal(count);
      setExecPage(1);
    } catch (e: any) {
      const msg = qaCaseErrorContent(e, t, "获取执行记录失败");
      setExecError(msg);
      qaCaseSetToastError(e, t, "获取执行记录失败");
    } finally {
      setExecLoading(false);
    }
  };

  const handleOpenSelectModal = async (type: TWorkItemType) => {
    if (!canEditCase) return;
    setForceTypeName(type);
    if (workspaceSlug && caseId) {
      try {
        const res = await caseService.issueList(String(workspaceSlug), {
          case_id: caseId,
          type_name: workItemTypeName(type),
        });
        const resolved: TIssue[] = Array.isArray((res as any)?.data)
          ? ((res as any).data as TIssue[])
          : Array.isArray(res)
            ? (res as TIssue[])
            : [];
        setPreselectedIssues(resolved);
      } catch {
        setPreselectedIssues([]);
      }
    }
    setIsWorkItemModalOpen(true);
  };

  /**
   * 关联需求（requirement 域，「需求」tab）。失败往上抛 —— 409 的差异化提示由选择器按
   * conflicts[].reason 展示，弹窗也据此决定不关闭，让用户改选。
   */
  const handleRequirementConfirm = async (requirementIds: string[]) => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId || !projectIdStr) return;
    await caseService.addCaseRequirements(String(workspaceSlug), projectIdStr, String(caseId), requirementIds);
    setRequirementReloadToken((token) => token + 1);
    qaCaseSetToastSuccess("关联需求已更新");
  };

  const handleWorkItemConfirm = async (issues: any[]) => {
    if (!canEditCase) return;
    try {
      if (!workspaceSlug || !caseId || !projectIdStr) return;
      const issueIds = (issues || []).map((i) => i.id);
      await persistCase({ id: caseId, issues: issueIds });
      setIsWorkItemModalOpen(false);
      setReloadToken((t) => t + 1);
      await fetchCaseData();
      qaCaseSetToastSuccess("关联工作项已更新");
    } catch (e: any) {
      qaCaseSetToastError(e, t, "更新失败");
    }
  };

  // 新增：附件相关本地状态（编辑模式展示与上传）
  const [caseAttachments, setCaseAttachments] = React.useState<any[]>([]);
  const [attachmentUploading, setAttachmentUploading] = React.useState<Record<string, boolean>>({});
  const [attachmentsLoading, setAttachmentsLoading] = React.useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const handlePickAttachments = () => {
    if (!canEditCase) return;
    fileInputRef.current?.click();
  };

  const fetchAttachments = async (seq?: number) => {
    if (!workspaceSlug || !caseId) return;
    setAttachmentsLoading(true);
    try {
      const list = await caseService.getCaseAssetList(String(workspaceSlug), String(caseId));
      if (seq && seq !== loadSeqRef.current) return;
      setCaseAttachments(Array.isArray(list) ? list : []);
    } catch {
      if (seq && seq !== loadSeqRef.current) return;
      setCaseAttachments([]);
    } finally {
      if (seq && seq !== loadSeqRef.current) return;
      setAttachmentsLoading(false);
    }
  };

  const fileUploadService = useMemo(() => new FileUploadService(), []);
  const fileService = useMemo(() => new FileService(), []);
  const [attachmentAssetIds, setAttachmentAssetIds] = useState<string[]>([]);
  const [attachmentAssetMap, setAttachmentAssetMap] = useState<Record<string, string>>({});

  const handleRemoveAttachment = async (idx: number) => {
    if (!canEditCase) return;
    const file = attachmentFiles[idx];
    if (!file) return;
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    const uploading = !!attachmentUploading[key];
    if (uploading) {
      qaCaseSetToastWarning("该附件正在上传，无法删除");
      return;
    }
    const assetId = attachmentAssetMap[key];
    try {
      // 如果已存在对应 assetId，先调用接口删除后端资产
      if (assetId) {
        await caseService.deleteWorkspaceAsset(String(workspaceSlug), assetId);
      }
      // 本地状态同步移除
      setAttachmentFiles((prev) => prev.filter((_, i) => i !== idx));
      if (assetId) {
        setAttachmentAssetIds((prev) => prev.filter((id) => id !== assetId));
      }
      setAttachmentAssetMap((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
      qaCaseSetToastSuccess("附件已删除");
    } catch (e: any) {
      qaCaseSetToastError(e, t, "附件删除失败");
    }
  };

  const uploadAttachmentViaProjectAssetEndpoint = async (file: File) => {
    if (!canEditCase) return;
    try {
      if (!workspaceSlug || (!templateMode && !projectIdStr)) {
        qaCaseSetToastWarning("缺少必要参数(workspaceSlug, projectId)，无法上传附件");
        return;
      }
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      setAttachmentUploading((prev) => ({ ...prev, [key]: true }));

      let assetId: string;
      if (templateMode) {
        // 模板库：workspace 级一条龙（presign→S3→PATCH）；编辑态 case 已存在，
        // entity_identifier 直接绑 caseId，presign 即落正式路径，免 rebind 与 putAssetCaseId
        const signed = await fileService.uploadWorkspaceAsset(
          String(workspaceSlug),
          { entity_type: EFileAssetType.CASE_ATTACHMENT, entity_identifier: String(caseId) },
          file
        );
        assetId = String(signed.asset_id);
      } else {
        // 1. 获取签名（固定 entity_type 为 CASE_ATTACHMENT）
        const meta = await getFileMetaDataForUpload(file);
        const presignResp = await caseService.post(
          `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectIdStr}/`,
          {
            ...meta,
            entity_type: "CASE_ATTACHMENT",
            entity_identifier: "",
          }
        );
        const signed = presignResp?.data ?? presignResp;

        // 2. 直传到对象存储
        const payload = generateFileUploadPayload(signed, file);
        await fileUploadService.uploadFile(signed.upload_data.url, payload);

        // 3. 标记已上传
        await caseService.patch(
          `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectIdStr}/${signed.asset_id}/`
        );
        // 4. 记录case_id
        await caseService.putAssetCaseId(String(workspaceSlug), String(signed.asset_id), {
          case_id: String(caseId),
        });
        assetId = String(signed.asset_id);
      }
      // 记录 assetId，用于提交与删除
      setAttachmentAssetIds((prev) => [...prev, assetId]);
      setAttachmentAssetMap((prev) => ({ ...prev, [key]: assetId }));
      // 记录文件信息，便于展示
      // file.id = String(signed.asset_id);
      setAttachmentFiles((prev) => [...prev, file]);
      try {
        const refreshed = await caseService.getCaseAssetList(String(workspaceSlug), String(caseId));
        setCaseAttachments(Array.isArray(refreshed) ? refreshed : []);
      } catch {}
      qaCaseSetToastSuccess(`附件 ${file.name} 上传完成`);
    } catch (e: any) {
      qaCaseSetToastError(e, t, "附件上传失败");
    } finally {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      setAttachmentUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditCase) return;
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setAttachmentFiles((prev) => [...prev, ...files]);
      // 逐个文件进行三段式上传
      files.forEach((file) => uploadAttachmentViaProjectAssetEndpoint(file));
    }

    // 重置 input 值，允许同名文件重复选择
    e.target.value = "";
  };

  // 新增：删除附件
  const handleRemoveCaseAttachment = async (attachmentId: string) => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId) return;
    if (!attachmentId) return;
    try {
      await caseService.deleteWorkspaceAsset(String(workspaceSlug), String(attachmentId));
      setCaseAttachments((prev) => prev.filter((a) => String(a?.id) !== String(attachmentId)));
    } catch {}
  };

  // 新增：下载附件
  const handleDownloadAttachment = async (attachment: any) => {
    const aid = String(attachment?.id ?? "");
    if (!workspaceSlug || !caseId || !aid) return;
    try {
      const resp = await caseService.getCaseAsset(String(workspaceSlug), String(caseId), aid);
      const blob = resp?.data as Blob;
      const filename = String(attachment?.attributes?.name ?? "附件");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
  };
  // 新增：状态 Tag 颜色映射
  const getCaseStateTagColor = (text: string): "blue" | "green" | "red" | "default" => {
    switch (text) {
      case "待评审":
        return "blue";
      case "已通过":
        return "green";
      case "已拒绝":
        return "red";
      default:
        return "default";
    }
  };

  // 新增：四个下拉框的本地值状态（从 caseData 同步，类型统一为字符串）
  const [assignee, setAssignee] = React.useState<string | undefined>(undefined);
  const [stateValue, setStateValue] = React.useState<string | undefined>(undefined);
  const [typeValue, setTypeValue] = React.useState<string | undefined>(undefined);
  const [priorityValue, setPriorityValue] = React.useState<string | undefined>(undefined);
  const [preconditionValue, setPreconditionValue] = React.useState<string | undefined>(undefined);
  const [remarkValue, setRemarkValue] = React.useState<string | undefined>(undefined);
  const [modeValue, setModeValue] = React.useState<number>(0);
  const [textDescriptionValue, setTextDescriptionValue] = React.useState<string>("");
  const [textResultValue, setTextResultValue] = React.useState<string>("");
  // 新增：测试步骤本地状态（与 StepsEditor 交互）
  const [stepsValue, setStepsValue] = React.useState<{ description?: string; result?: string }[]>([
    { description: "", result: "" },
  ]);

  // 新增：枚举数据状态与拉取逻辑（参考 create-modal）
  const [enumsData, setEnumsData] = React.useState<{
    case_test_type?: Record<string, string>;
    case_type?: Record<string, string>;
    case_priority?: Record<string, string>;
    case_state?: Record<string, string>;
    plan_case_result?: Record<string, string>;
  }>({});
  const fetchEnums = async (seq?: number) => {
    if (!workspaceSlug) return;
    try {
      const enums = await getEnums(String(workspaceSlug));
      if (seq && seq !== loadSeqRef.current) return;
      setEnumsData({
        case_test_type: enums.case_test_type || {},
        case_type: enums.case_type || {},
        case_priority: enums.case_priority || {},
        case_state: enums.case_state || {},
        plan_case_result: enums.plan_case_result || {},
      });
    } catch {
      if (seq && seq !== loadSeqRef.current) return;
      setEnumsData({
        case_test_type: {},
        case_type: {},
        case_priority: {},
        case_state: {},
        plan_case_result: {},
      });
    }
  };

  const [caseVersions, setCaseVersions] = React.useState<{ id: string; version: number; created_at?: string }[]>([]);
  const [loadingCaseVersions, setLoadingCaseVersions] = React.useState<boolean>(false);
  const fetchCaseVersions = async (seq?: number) => {
    if (!workspaceSlug || !caseId) return;
    setLoadingCaseVersions(true);
    try {
      const data = await caseService.getCaseVersions(String(workspaceSlug), String(caseId));
      if (seq && seq !== loadSeqRef.current) return;
      setCaseVersions(Array.isArray(data) ? data : []);
    } catch {
      if (seq && seq !== loadSeqRef.current) return;
      setCaseVersions([]);
    } finally {
      if (seq && seq !== loadSeqRef.current) return;
      setLoadingCaseVersions(false);
    }
  };

  const [reviewEnums, setReviewEnums] = React.useState<
    Record<string, Record<string, { label: string; color: string }>>
  >({});
  const fetchReviewEnums = async (seq?: number) => {
    if (!workspaceSlug) return;
    try {
      const data = await reviewService.getReviewEnums(String(workspaceSlug));
      if (seq && seq !== loadSeqRef.current) return;
      setReviewEnums(data || {});
    } catch {
      if (seq && seq !== loadSeqRef.current) return;
      setReviewEnums({});
    }
  };

  type TLatestExecRecord = {
    id?: string | number;
    name?: string;
    result?: string;
    created_by?: string | null;
    created_at?: string;
  };
  const [latestExec, setLatestExec] = React.useState<TLatestExecRecord | null>(null);
  const fetchLatestExec = async (seq?: number) => {
    if (!workspaceSlug || !caseId) return;
    try {
      const res = await caseService.getCaseExecuteRecord(String(workspaceSlug), String(caseId));
      const list: TLatestExecRecord[] = Array.isArray((res as any)?.data)
        ? (res as any).data
        : Array.isArray(res)
          ? (res as any)
          : [];
      if (seq && seq !== loadSeqRef.current) return;
      if (list.length === 0) {
        setLatestExec(null);
        return;
      }
      const sorted = [...list].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      setLatestExec(sorted[0]);
    } catch {
      if (seq && seq !== loadSeqRef.current) return;
      setLatestExec(null);
    }
  };

  const handleChangeTestType = async (v: string) => {
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;
    setCaseData((prev: any) => (prev ? { ...prev, test_type: Number(v) } : prev));
    try {
      await persistCase({ id: String(caseId), test_type: Number(v) });
    } catch (e) {
      qaCaseSetToastError(e, t, "更新测试类型失败");
    }
  };

  const hydrateFromCaseData = (data: any) => {
    setTitle(data?.name ?? "");
    setCodeValue(data?.code ?? "");

    setAssignee(normalizeId(data?.assignee));
    setStateValue(normalizeId(data?.state));
    setTypeValue(normalizeId(data?.type));
    setPriorityValue(normalizeId(data?.priority));

    setPreconditionValue(data?.precondition ?? "");
    setRemarkValue(data?.remark ?? "");
    setModeValue(typeof data?.mode === "number" ? data.mode : 0);
    setTextDescriptionValue(data?.text_description ?? "");
    setTextResultValue(data?.text_result ?? "");

    setStepsValue(Array.isArray(data?.steps) && data.steps.length > 0 ? data.steps : [{ description: "", result: "" }]);
  };

  const fetchCaseData = async (seq?: number) => {
    if (!workspaceSlug || !caseId) return;
    try {
      const data = await caseService.getCase(String(workspaceSlug), caseId);
      if (seq && seq !== loadSeqRef.current) return;
      setCaseData(data);
      setLabelList(Array.isArray(data?.labels) ? data.labels : []);
      hydrateFromCaseData(data);
    } catch {
      if (seq && seq !== loadSeqRef.current) return;
      setCaseData(null);
      setLabelList([]);
      hydrateFromCaseData(null);
    }
  };

  React.useEffect(() => {
    loadSeqRef.current += 1;
    const seq = loadSeqRef.current;

    if (!open || !caseId || !workspaceSlug) {
      setInitialLoading(false);
      setInitialReady(false);
      setCaseData(null);
      setLabelList([]);
      hydrateFromCaseData(null);
      setCaseAttachments([]);
      setAttachmentFiles([]);
      setCaseVersions([]);
      setReviewEnums({});
      setLatestExec(null);
      return;
    }

    setInitialReady(false);
    setInitialLoading(true);

    // 模板库模式：附件已放开（workspace 级）；版本/评审/执行等项目语境数据仍不拉取
    Promise.allSettled([
      fetchCaseData(seq),
      fetchEnums(seq),
      ...(templateMode
        ? [fetchAttachments(seq)]
        : [fetchAttachments(seq), fetchCaseVersions(seq), fetchReviewEnums(seq), fetchLatestExec(seq)]),
    ]).finally(() => {
      if (seq !== loadSeqRef.current) return;
      setInitialLoading(false);
      setInitialReady(true);
    });
  }, [open, caseId, workspaceSlug, templateMode]);

  // 切换到“执行”页时自动拉取执行记录（模板库模式无该 tab，不拉取）
  React.useEffect(() => {
    if (!templateMode && activeTab === "execution") {
      fetchExecRecords();
    }
  }, [activeTab, workspaceSlug, caseId, templateMode]);

  // 生成选项（参考 create-modal）
  const caseTypeOptions = React.useMemo(
    () =>
      Object.entries(enumsData.case_type || {}).map(([value, label]) => ({
        value,
        label, // 保持字符串，直接用于过滤
        title: String(label), // 备用：统一用于 optionFilterProp
      })),
    [enumsData.case_type]
  );
  const casePriorityOptions = React.useMemo(
    () =>
      Object.entries(enumsData.case_priority || {}).map(([value, label]) => ({
        value,
        label, // 保持字符串，直接用于过滤
        title: String(label),
      })),
    [enumsData.case_priority]
  );
  const caseStateOptions = React.useMemo(
    () =>
      Object.entries(enumsData.case_state || {}).map(([value, label]) => {
        const text = String(label);
        return {
          value,
          // 用 Tag 展示状态，同时支持选择后在选择框中以 Tag 形式回显
          label: <Tag color={getCaseStateTagColor(text)}>{text}</Tag>,
          title: text, // 供搜索过滤使用
        };
      }),
    [enumsData.case_state]
  );

  // 维护人选项（复用 useMember 逻辑），显示 icon + 名字
  const {
    getUserDetails,
    workspace: { workspaceMemberIds, isUserSuspended },
  } = useMember();
  const assigneeOptions = React.useMemo(
    () =>
      (workspaceMemberIds ?? []).map((userId) => {
        const user = getUserDetails(userId);
        const name = user?.display_name ?? "";
        return {
          value: userId,
          // 使用 Tooltip + 省略样式，保证选项和选择框回显一致
          label: (
            <Tooltip title={name} placement="top">
              <span className="flex min-w-0 items-center gap-1">
                <LucideIcons.User size={14} className="text-gray-500 shrink-0" />
                <span className="max-w-[160px] truncate">{name}</span>
              </span>
            </Tooltip>
          ),
          title: name, // 供搜索过滤使用
          disabled: isUserSuspended(userId, workspaceSlug || ""),
        };
      }),
    [workspaceMemberIds, getUserDetails, isUserSuspended, workspaceSlug]
  );

  // 新增：失焦更新（各字段）
  const handleBlurAssignee = async () => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;
    if (assignee === normalizeId(caseData?.assignee)) return;
    try {
      await persistCase({ id: caseId, assignee });
      setCaseData((prev: any) => (prev ? { ...prev, assignee } : prev));
    } catch (e) {
      qaCaseSetToastError(e, t, "更新负责人失败");
    }
  };

  const handleUpdateAssine = async (v: any) => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;

    if (v === normalizeId(caseData?.assignee)) return;
    try {
      await persistCase({ id: caseId, assignee: v });
      setCaseData((prev: any) => (prev ? { ...prev, assignee: normalizeId(v) } : prev));
      setAssignee(normalizeId(v));
    } catch (e) {
      qaCaseSetToastError(e, t, "更新负责人失败");
    }
  };

  const handleBlurState = async () => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;
    if (stateValue === normalizeId(caseData?.state)) return;
    try {
      await persistCase({ id: caseId, state: stateValue });
      setCaseData((prev: any) => (prev ? { ...prev, state: stateValue } : prev));
    } catch (e) {
      qaCaseSetToastError(e, t, "更新状态失败");
    }
  };

  const handleBlurType = async () => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;
    if (typeValue === normalizeId(caseData?.type)) return;
    try {
      await persistCase({ id: caseId, type: typeValue });
      setCaseData((prev: any) => (prev ? { ...prev, type: typeValue } : prev));
    } catch (e) {
      qaCaseSetToastError(e, t, "更新类型失败");
    }
  };

  const handleBlurPriority = async () => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;
    if (priorityValue === normalizeId(caseData?.priority)) return;
    try {
      await persistCase({ id: caseId, priority: priorityValue });
      setCaseData((prev: any) => (prev ? { ...prev, priority: priorityValue } : prev));
    } catch (e) {
      qaCaseSetToastError(e, t, "更新优先级失败");
    }
  };

  const handleSaveBasicInfo = async (data: {
    precondition: string;
    steps: any[];
    mode: number;
    textDescription: string;
    textResult: string;
    remark: string;
  }) => {
    if (!canEditCase) return;
    if (!workspaceSlug || !caseId || (!templateMode && !projectIdStr)) return;

    const payload: any = {};
    let hasChange = false;

    const normalizeText = (text: any) => (text === null || text === undefined ? "" : String(text));

    if (normalizeText(data.precondition) !== normalizeText(caseData?.precondition)) {
      payload.precondition = data.precondition;
      hasChange = true;
    }

    if (normalizeText(data.remark) !== normalizeText(caseData?.remark)) {
      payload.remark = data.remark;
      hasChange = true;
    }

    if ((typeof caseData?.mode === "number" ? caseData.mode : 0) !== data.mode) {
      payload.mode = data.mode;
      hasChange = true;
    }

    if (data.mode === 1) {
      if (normalizeText(data.textDescription) !== normalizeText(caseData?.text_description)) {
        payload.text_description = data.textDescription;
        hasChange = true;
      }
      if (normalizeText(data.textResult) !== normalizeText(caseData?.text_result)) {
        payload.text_result = data.textResult;
        hasChange = true;
      }
    } else {
      const oldSteps = Array.isArray(caseData?.steps) ? caseData.steps : [];
      const mapRows = (rows: { description?: string; result?: string }[]) =>
        (rows || []).map((r) => ({ description: r?.description ?? "", result: r?.result ?? "" }));
      const filterEmpty = (rows: { description: string; result: string }[]) =>
        rows.filter((r) => !(r.description.trim() === "" && r.result.trim() === ""));

      const nextSteps = filterEmpty(mapRows(data.steps));
      const prevStepsRaw = mapRows(oldSteps);

      if (JSON.stringify(nextSteps) !== JSON.stringify(prevStepsRaw)) {
        payload.steps = nextSteps;
        hasChange = true;
      }
    }

    if (!hasChange) return;

    try {
      await persistCase({ id: caseId, ...payload });
      setCaseData((prev: any) => (prev ? { ...prev, ...payload } : prev));
      qaCaseSetToastSuccess("保存成功");
    } catch (e: any) {
      qaCaseSetToastError(e, t, "保存失败");
    }
  };

  const peekShellClassName = cn(
    "absolute z-10 flex flex-col overflow-hidden bg-surface-1 shadow-[0_4px_16px_rgba(16,24,40,0.12)] transition-all duration-300",
    "inset-y-0 right-0 w-full border-l border-subtle md:w-[72%]"
  );

  // 全屏（独立页面）链接：与工作项的 MoveDiagonal 跳转独立详情页保持一致
  const fullScreenUrl =
    workspaceSlug && caseId
      ? templateMode
        ? `/${workspaceSlug}/templates/test-cases/case/${caseId}`
        : projectIdStr
          ? `/${workspaceSlug}/projects/${projectIdStr}/testhub/cases/${caseId}`
          : undefined
      : undefined;

  // 渲染加载状态（等所有数据请求完成后再展示内容）
  if (!initialReady || initialLoading || !caseData) {
    const loadingContent =
      !initialReady || initialLoading ? (
        <Spin size="large" />
      ) : (
        <div className="text-sm text-secondary">暂无数据或加载失败</div>
      );
    if (isPage) {
      return (
        <div className="flex h-full min-h-0 w-full flex-col items-center justify-center bg-surface-1">
          {loadingContent}
        </div>
      );
    }
    return createPortal(
      <div className="fixed inset-0 z-[1100]" aria-modal="true" role="dialog" data-prevent-outside-click="true">
        <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
        <div className={`${peekShellClassName} items-center justify-center`}>{loadingContent}</div>
      </div>,
      document.body
    );
  }

  // 内容区域：左右布局（抽屉与独立页共用同一结构）
  const detailContent = (
        <div className="flex min-h-0 flex-1">
          {/* 左侧：2/3宽度 */}
          <div className="h-full w-[73%] overflow-y-auto px-6 py-4">
            <TitleInput
              disabled={!canEditCase}
              value={title}
              onChange={setTitle}
              onBlur={handleBlurTitle}
              code={codeValue}
              onCodeChange={setCodeValue}
              onCodeBlur={handleBlurCode}
            />
            <CaseMetaForm
              disabled={!canEditCase}
              // 模板库模式无项目语境：不传 projectId，成员下拉走工作区成员
              projectId={!templateMode && projectId ? String(projectId) : undefined}
              assignee={assignee}
              onAssigneeChange={(v) => handleUpdateAssine(v)}
              onAssigneeBlur={handleBlurAssignee}
              assigneeOptions={assigneeOptions}
              stateValue={stateValue}
              onStateChange={(v) => setStateValue(normalizeId(v))}
              onStateBlur={handleBlurState}
              caseStateOptions={caseStateOptions}
              typeValue={typeValue}
              onTypeChange={(v) => setTypeValue(normalizeId(v))}
              onTypeBlur={handleBlurType}
              caseTypeOptions={caseTypeOptions}
              priorityValue={priorityValue}
              onPriorityChange={(v) => setPriorityValue(normalizeId(v))}
              onPriorityBlur={handleBlurPriority}
              casePriorityOptions={casePriorityOptions}
              labelList={labelList}
              onCreateLabel={handleCreateLabel}
              onDeleteLabel={handleDeleteLabel}
            />
            {/* Menu 导航 */}
            <div className="mt-3">
              <div className="border-gray-200 flex items-center justify-between border-b pr-2">
                <nav className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab("basic")}
                    className={`-mb-px border-b-2 px-2 py-3 text-sm leading-5 font-medium transition-colors ${
                      activeTab === "basic"
                        ? "border-accent-strong text-accent-primary"
                        : "border-transparent text-secondary hover:text-accent-primary"
                    }`}
                  >
                    基本信息
                  </button>
                  {/* 模板用例只有「基本信息」：其余 tab 均为项目语境，模板库模式不渲染 */}
                  {!templateMode && (
                    <>
                  <button
                    type="button"
                    onClick={() => setActiveTab("req-link")}
                    className={`-mb-px border-b-2 px-2 py-3 text-sm leading-5 font-medium transition-colors ${
                      activeTab === "req-link"
                        ? "border-accent-strong text-accent-primary"
                        : "border-transparent text-secondary hover:text-accent-primary"
                    }`}
                  >
                    需求
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("work")}
                    className={`-mb-px border-b-2 px-2 py-3 text-sm leading-5 font-medium transition-colors ${
                      activeTab === "work"
                        ? "border-accent-strong text-accent-primary"
                        : "border-transparent text-secondary hover:text-accent-primary"
                    }`}
                  >
                    工作项
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("defect")}
                    className={`-mb-px border-b-2 px-2 py-3 text-sm leading-5 font-medium transition-colors ${
                      activeTab === "defect"
                        ? "border-accent-strong text-accent-primary"
                        : "border-transparent text-secondary hover:text-accent-primary"
                    }`}
                  >
                    缺陷
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("execution")}
                    className={`-mb-px border-b-2 px-2 py-3 text-sm leading-5 font-medium transition-colors ${
                      activeTab === "execution"
                        ? "border-accent-strong text-accent-primary"
                        : "border-transparent text-secondary hover:text-accent-primary"
                    }`}
                  >
                    执行
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("review")}
                    className={`-mb-px border-b-2 px-2 py-3 text-sm leading-5 font-medium transition-colors ${
                      activeTab === "review"
                        ? "border-accent-strong text-accent-primary"
                        : "border-transparent text-secondary hover:text-accent-primary"
                    }`}
                  >
                    评审
                  </button>
                    </>
                  )}
                  {/* 附件走 workspace 级链路，模板库模式同样可用 */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("attachments")}
                    className={`-mb-px border-b-2 px-2 py-3 text-sm leading-5 font-medium transition-colors ${
                      activeTab === "attachments"
                        ? "border-accent-strong text-accent-primary"
                        : "border-transparent text-secondary hover:text-accent-primary"
                    }`}
                  >
                    附件
                  </button>
                </nav>
                <div className="flex-shrink-0 pt-2">
                  {activeTab === "req-link" && (
                    <button
                      type="button"
                      onClick={() => setIsRequirementModalOpen(true)}
                      disabled={!canEditCase}
                      className="rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      添加需求
                    </button>
                  )}
                  {activeTab === "work" && (
                    <button
                      type="button"
                      onClick={() => handleOpenSelectModal("Task")}
                      disabled={!canEditCase}
                      className="rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      添加工作项
                    </button>
                  )}
                  {activeTab === "defect" && (
                    <button
                      type="button"
                      onClick={() => handleOpenSelectModal("Bug")}
                      disabled={!canEditCase}
                      className="rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      添加缺陷
                    </button>
                  )}
                  {activeTab === "attachments" && (
                    <button
                      type="button"
                      onClick={handlePickAttachments}
                      disabled={!canEditCase}
                      className="rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      添加附件
                    </button>
                  )}
                </div>
              </div>
            </div>

            {false}

            {activeTab === "basic" && (
              <BasicInfoPanel
                caseId={caseId}
                canEdit={canEditCase}
                templateMode={templateMode}
                preconditionValue={preconditionValue ?? ""}
                stepsValue={stepsValue}
                modeValue={modeValue}
                textDescriptionValue={textDescriptionValue}
                textResultValue={textResultValue}
                remarkValue={remarkValue ?? ""}
                onSave={handleSaveBasicInfo}
                activityContent={
                  // 活动 feed 依赖项目语境（projectId），模板库模式隐藏
                  !templateMode && caseId && workspaceSlug && projectIdStr ? (
                    <TestCaseActivityTab
                      workspaceSlug={String(workspaceSlug)}
                      projectId={projectIdStr}
                      caseId={String(caseId)}
                    />
                  ) : null
                }
              />
            )}
            {activeTab === "execution" && caseId && (
              <div>
                <div className="border-gray-200 overflow-hidden rounded">
                  <div className="overflow-x-auto">
                    <Table
                      size="middle"
                      rowKey={(r: TExecRecord) => String(r.id ?? `${r.name}-${r.created_at}`)}
                      dataSource={execList.slice((execPage - 1) * execPageSize, execPage * execPageSize)}
                      loading={execLoading}
                      pagination={{
                        current: execPage,
                        pageSize: execPageSize,
                        total: execTotal,
                        showSizeChanger: true,
                        showQuickJumper: true,
                        pageSizeOptions: execPageSizeOptions.map(String),
                        showTotal: (t, range) => `第 ${range[0]}-${range[1]} 条，共 ${t} 条`,
                        selectComponentClass: (props: any) => <Select {...props} dropdownStyle={{ zIndex: 1200 }} />,
                        onChange: (p) => setExecPage(p),
                        onShowSizeChange: (_c, s) => {
                          setExecPageSize(s);
                          setExecPage(1);
                        },
                      }}
                      columns={[
                        { title: "计划名称", dataIndex: "name", key: "name" },
                        {
                          title: "执行结果",
                          dataIndex: "result",
                          key: "result",
                          render: (label: string) => {
                            const color = (enumsData?.plan_case_result || {})[label];
                            return <Tag color={color}>{label || "-"}</Tag>;
                          },
                        },
                        {
                          title: "执行人",
                          dataIndex: "created_by",
                          key: "created_by",
                          render: (uid: string | null) => (
                            <MemberDropdown
                              multiple={false}
                              value={uid ?? null}
                              onChange={() => {}}
                              disabled={true}
                              placeholder={"未知用户"}
                              className="w-full text-sm"
                              buttonContainerClassName="w-full text-left p-0 cursor-default"
                              buttonVariant="transparent-with-text"
                              buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
                              showUserDetails={true}
                              optionsClassName="z-[1200]"
                            />
                          ),
                        },
                        {
                          title: "执行时间",
                          dataIndex: "created_at",
                          key: "created_at",
                          render: (v: string) => formatCNDateTime(v),
                        },
                        {
                          title: "",
                          key: "detail",
                          width: 80,
                          render: (_: unknown, record: TExecRecord) => (
                            <Button
                              type="link"
                              size="small"
                              onClick={() => {
                                setExecDetailRecord(record);
                                setExecDetailModalOpen(true);
                              }}
                            >
                              详情
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </div>

                  {execError && <div className="text-red-600 px-3 py-2 text-sm">{execError}</div>}
                </div>
              </div>
            )}
            <ExecutionRecordDetailModal
              open={execDetailModalOpen}
              onClose={() => {
                setExecDetailModalOpen(false);
                setExecDetailRecord(null);
              }}
              record={
                execDetailRecord && execDetailRecord.id != null
                  ? { id: String(execDetailRecord.id), steps: execDetailRecord.steps }
                  : null
              }
              records={execList.map((r) => ({
                id: String(r.id ?? ""),
                result: String(r.result ?? ""),
                reason: (r as any).reason,
                assignee: (r as any).assignee,
                created_by: r.created_by ?? null,
                created_at: r.created_at,
                steps: r.steps,
              }))}
              workspaceSlug={workspaceSlug}
            />
            {activeTab === "review" && caseId && (
              <CaseReviewRecordsTable workspaceSlug={String(workspaceSlug)} caseId={String(caseId)} />
            )}
            {activeTab === "req-link" && caseId && (
              <RequirementDisplayPanel
                caseId={String(caseId)}
                projectId={projectIdStr}
                canEdit={canEditCase}
                reloadToken={requirementReloadToken}
                onCountChange={(n) => setCurrentCount(n)}
              />
            )}
            {activeTab === "work" && caseId && (
              <WorkItemDisplayModal
                caseId={String(caseId)}
                defaultType="Task"
                reloadToken={reloadToken}
                onCountChange={(n) => setCurrentCount(n)}
              />
            )}
            {activeTab === "defect" && caseId && (
              <WorkItemDisplayModal
                caseId={String(caseId)}
                defaultType="Bug"
                reloadToken={reloadToken}
                onCountChange={(n) => setCurrentCount(n)}
              />
            )}
            {activeTab === "attachments" && (
              <AttachmentsPanel
                attachmentsLoading={attachmentsLoading}
                canEdit={canEditCase}
                caseAttachments={caseAttachments}
                fileInputRef={fileInputRef}
                onFilesChosen={handleFilesChosen}
                onDownloadAttachment={handleDownloadAttachment}
                onRemoveCaseAttachment={(id) => handleRemoveCaseAttachment(id)}
              />
            )}
          </div>
          <SideInfoPanel
            caseData={caseData}
            caseVersions={caseVersions}
            loadingCaseVersions={loadingCaseVersions}
            enumsData={enumsData}
            reviewEnums={reviewEnums}
            latestExec={latestExec}
            onChangeTestType={handleChangeTestType}
            hideProjectSections={templateMode}
          />
        </div>
  );

  // 工作项/需求选择器均为项目语境，模板库模式不渲染
  const selectorModals = (
    <>
      {!templateMode && (
        <WorkItemSelectModal
          isOpen={isWorkItemModalOpen}
          workspaceSlug={String(workspaceSlug ?? "")}
          onClose={() => setIsWorkItemModalOpen(false)}
          onConfirm={handleWorkItemConfirm}
          forceTypeName={forceTypeName}
          initialSelectedIssues={preselectedIssues}
          caseId={String(caseId ?? "")}
        />
      )}

      {/* 「需求」tab（requirement 域）的选择器。与上面的工作项选择器是两套数据，别合并 */}
      {!templateMode && (
        <RequirementSelectModal
          isOpen={isRequirementModalOpen}
          caseId={String(caseId ?? "")}
          projectId={projectIdStr}
          onClose={() => setIsRequirementModalOpen(false)}
          onConfirm={handleRequirementConfirm}
        />
      )}
    </>
  );

  // 独立页面形态：不走 portal、无遮罩/头部/底部操作条，直接平铺同一套内容结构
  if (isPage) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-1">
        {detailContent}
        {selectorModals}
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[1100]" aria-modal="true" role="dialog" data-prevent-outside-click="true">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className={peekShellClassName}>
        <ModalHeader onClose={onClose} caseId={String(caseId ?? "")} fullScreenUrl={fullScreenUrl} />
        {detailContent}
      </div>
      {selectorModals}
    </div>,
    document.body
  );
}

export default function UpdateModal(props: UpdateModalProps) {
  if (!props.open || !props.caseId) return null;
  return <UpdateModalBody {...props} />;
}
