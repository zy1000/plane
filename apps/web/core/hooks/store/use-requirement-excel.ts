/**
 * 需求条目的 Excel 导入 / 导出。
 *
 * 两个 hook 拆开是因为它们的生命周期不同：导出是一次性动作，挂在页面工具栏上；导入是
 * 一个带状态机的弹窗（上传 → 校验预览 → 确认）。
 *
 * 产品需求与标准库条目共用同一组后端端点（挂在 BaseRequirementRowViewSet 上），差异
 * 只有一个 `scope`，所以这里也不分叉。
 */

import { useCallback, useEffect, useState } from "react";
import type {
  TRequirementExcelImportResponse,
  TRequirementExcelScope,
  TRequirementExcelValidation,
  TRequirementFilter,
} from "@plane/types";
import { downloadBlob } from "@/components/issues/export/utils";
import { RequirementService } from "@/services/requirement.service";
import { RequirementTypeService } from "@/services/requirement-type.service";

const requirementService = new RequirementService();
const requirementTypeService = new RequirementTypeService();

export const getRequirementExcelErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string[] | string };
    if (payload.error) return payload.error;
    if (Array.isArray(payload.detail)) return payload.detail.join("；");
    if (typeof payload.detail === "string") return payload.detail;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

type TExcelTarget = {
  workspaceSlug: string;
  scope: TRequirementExcelScope;
  entityId: string;
};

type TExportArgs = TExcelTarget & {
  /** 跟随当前视图：搜索、筛选、以及类型视图下的那一个需求类型 */
  search?: string;
  filters?: TRequirementFilter[];
  requirementTypeIds?: string[];
};

export const useRequirementExcelExport = (args: TExportArgs) => {
  const { workspaceSlug, scope, entityId, search, filters, requirementTypeIds } = args;
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const exportExcel = useCallback(async () => {
    if (!workspaceSlug || !entityId) return;
    setIsExporting(true);
    try {
      const { blob, filename } = await requirementService.exportRequirementsExcel(workspaceSlug, scope, entityId, {
        search,
        filters,
        requirementTypeIds,
      });
      downloadBlob(blob, filename);
    } finally {
      setIsExporting(false);
    }
  }, [workspaceSlug, scope, entityId, search, filters, requirementTypeIds]);

  /**
   * 空产品一条需求都没有，`requirementTypeIds` 也就是空的，后端拿不到任何需求类型、
   * 给不出表头。这时退回工作区里所有启用的类型 —— 冷启动正是最需要模板的时候。
   */
  const downloadTemplate = useCallback(async () => {
    if (!workspaceSlug || !entityId) return;
    setIsDownloadingTemplate(true);
    try {
      let typeIds = requirementTypeIds ?? [];
      if (typeIds.length === 0 && scope === "product") {
        const types = await requirementTypeService.listRequirementTypes(workspaceSlug);
        typeIds = types.filter((item) => item.is_active).map((item) => item.id);
      }
      const { blob, filename } = await requirementService.exportRequirementsExcel(workspaceSlug, scope, entityId, {
        requirementTypeIds: typeIds,
        template: true,
      });
      downloadBlob(blob, filename);
    } finally {
      setIsDownloadingTemplate(false);
    }
  }, [workspaceSlug, scope, entityId, requirementTypeIds]);

  return { isExporting, isDownloadingTemplate, exportExcel, downloadTemplate };
};

export type TRequirementExcelImportStep = "upload" | "validate";

type TImportArgs = TExcelTarget & {
  isOpen: boolean;
  onImported?: (response: TRequirementExcelImportResponse) => void | Promise<void>;
};

export const useRequirementExcelImport = (args: TImportArgs) => {
  const { isOpen, workspaceSlug, scope, entityId, onImported } = args;

  const [step, setStep] = useState<TRequirementExcelImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<TRequirementExcelValidation | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 关闭即重置：留着上一次的校验结果，下次打开会先闪一屏过期数据
  useEffect(() => {
    if (isOpen) return;
    setStep("upload");
    setFile(null);
    setValidation(null);
    setSelectedRowKeys([]);
    setIsValidating(false);
    setIsImporting(false);
    setError(null);
  }, [isOpen]);

  const pickFile = useCallback((selected: File | null) => {
    setFile(selected);
    setValidation(null);
    setSelectedRowKeys([]);
    setError(null);
  }, []);

  const validate = useCallback(async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setIsValidating(true);
    setError(null);
    try {
      const response = await requirementService.validateRequirementExcelImport(
        workspaceSlug,
        scope,
        entityId,
        formData
      );
      setValidation(response);
      // 默认勾上所有能导的行，剩下的让用户自己判断
      setSelectedRowKeys((response.results ?? []).filter((row) => row.passed).map((row) => row.row_key));
      setStep("validate");
    } catch (requestError) {
      setError(getRequirementExcelErrorMessage(requestError, "校验失败，请检查文件后重试。"));
    } finally {
      setIsValidating(false);
    }
  }, [file, workspaceSlug, scope, entityId]);

  const confirmImport = useCallback(async () => {
    if (!file || selectedRowKeys.length === 0) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("row_keys", JSON.stringify(selectedRowKeys));
    setIsImporting(true);
    setError(null);
    try {
      const response = await requirementService.importRequirementsExcel(workspaceSlug, scope, entityId, formData);
      await onImported?.(response);
      return response;
    } catch (requestError) {
      setError(getRequirementExcelErrorMessage(requestError, "导入失败，请稍后重试。"));
      // 后端把逐行结果一起回传了，直接换上去，用户不必重新走一遍校验
      const payload = requestError as TRequirementExcelValidation | undefined;
      if (payload?.results) setValidation(payload);
      return undefined;
    } finally {
      setIsImporting(false);
    }
  }, [file, selectedRowKeys, workspaceSlug, scope, entityId, onImported]);

  return {
    step,
    file,
    validation,
    selectedRowKeys,
    isValidating,
    isImporting,
    error,
    setStep,
    pickFile,
    setSelectedRowKeys,
    validate,
    confirmImport,
  };
};
