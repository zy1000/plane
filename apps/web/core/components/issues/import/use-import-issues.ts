/**
 * 工作项导入弹窗的状态管理 Hook。
 *
 * 状态机：
 *   upload   → 选择文件 + 配置字段映射；可点「下一步」走 validate
 *   validate → 展示校验结果，勾选行后可点「开始导入」
 *
 * Service 调用：
 *   - downloadImportTemplate：下载标准模板
 *   - inspectImportFile：上传后获取列名与推荐映射
 *   - validateImport：携带映射做行级校验
 *   - bulkImport：携带映射 + 勾选行号正式导入
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";
import { IssueService } from "@/services/issue";
import { IMPORT_FIELD_DEFINITIONS, MULTI_MAP_FIELDS } from "./constants";
import type {
  BulkImportResponse,
  FieldMapping,
  ImportFieldKey,
  ImportStep,
  InspectResponse,
  ValidationResponse,
  ValidationRow,
} from "./types";
import { IGNORE_FIELD } from "./types";

type UseImportIssuesArgs = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  onSuccess?: () => void | Promise<void>;
  onClose: () => void;
};

const issueService = new IssueService();

export function useImportIssues(args: UseImportIssuesArgs) {
  const { isOpen, workspaceSlug, projectId, onSuccess, onClose } = args;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [inspect, setInspect] = useState<InspectResponse | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep("upload");
      setFile(null);
      setInspect(null);
      setMapping({});
      setValidation(null);
      setSelectedRowKeys([]);
      setDownloadingTemplate(false);
      setInspecting(false);
      setValidating(false);
      setImporting(false);
    }
  }, [isOpen]);

  const openPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (!selected) return;

      setFile(selected);
      setValidation(null);
      setSelectedRowKeys([]);

      const formData = new FormData();
      formData.append("file", selected);
      setInspecting(true);
      try {
        const data: InspectResponse = await issueService.inspectImportFile(workspaceSlug, projectId, formData);
        setInspect(data);
        setMapping((data?.suggested_mapping ?? {}) as FieldMapping);
      } catch (error: any) {
        message.error(error?.error || "解析 Excel 失败");
        setInspect(null);
        setMapping({});
      } finally {
        setInspecting(false);
      }
    },
    [workspaceSlug, projectId]
  );

  const downloadTemplate = useCallback(async () => {
    setDownloadingTemplate(true);
    try {
      const response = await issueService.downloadImportTemplate(workspaceSlug, projectId);
      const blob = response?.data as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "工作项导入模板.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      message.error(error?.error || "下载模板失败");
    } finally {
      setDownloadingTemplate(false);
    }
  }, [workspaceSlug, projectId]);

  // 字段映射的客户端校验：必填字段必须各被映射到恰好一列，其它字段最多一列。
  const mappingError = useMemo<string | null>(() => {
    const counter: Record<string, number> = {};
    for (const value of Object.values(mapping ?? {})) {
      if (value === IGNORE_FIELD) continue;
      counter[value] = (counter[value] ?? 0) + 1;
    }
    for (const def of IMPORT_FIELD_DEFINITIONS) {
      const count = counter[def.key] ?? 0;
      if (def.required && count === 0) return `必填属性「${def.label}」未配置映射`;
      if (count > 1 && !MULTI_MAP_FIELDS.has(def.key)) return `属性「${def.label}」映射了多列`;
    }
    return null;
  }, [mapping]);

  const updateMapping = useCallback((column: string, value: ImportFieldKey | typeof IGNORE_FIELD) => {
    setMapping((prev) => ({ ...prev, [column]: value }));
  }, []);

  const handleValidate = useCallback(async () => {
    if (!file) {
      message.error("请先选择文件");
      return;
    }
    if (mappingError) {
      message.error(mappingError);
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));

    setValidating(true);
    try {
      const data: ValidationResponse = await issueService.validateImport(workspaceSlug, projectId, formData);
      setValidation(data);
      const passedRows = (data?.results ?? []).filter((r) => r.passed).map((r) => r.row_number);
      setSelectedRowKeys(passedRows);
      setStep("validate");
    } catch (error: any) {
      message.error(error?.error || "校验失败");
    } finally {
      setValidating(false);
    }
  }, [file, mapping, mappingError, workspaceSlug, projectId]);

  const handleImport = useCallback(async () => {
    if (!file) {
      message.error("请先选择文件");
      return;
    }
    if (selectedRowKeys.length === 0) {
      message.error("请至少勾选一行进行导入");
      return;
    }
    const passedRows = new Set(
      (validation?.results ?? []).filter((r) => r.passed).map((r) => r.row_number)
    );
    const hasFailedSelected = selectedRowKeys.some((row) => !passedRows.has(row));
    if (hasFailedSelected) {
      message.error("所选行中存在未通过校验的项，请取消勾选后重试");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));
    formData.append("row_numbers", JSON.stringify(selectedRowKeys));

    setImporting(true);
    try {
      const data: BulkImportResponse = await issueService.bulkImport(workspaceSlug, projectId, formData);
      if (data.success_count > 0) {
        message.success(`成功导入 ${data.success_count} 条工作项`);
      }
      if (data.failed && data.failed.length > 0) {
        message.warning(`有 ${data.failed.length} 条数据导入失败`);
      }
      await onSuccess?.();
      onClose();
    } catch (error: any) {
      const fallback = error?.error || "导入失败";
      const failed: any[] = error?.failed ?? [];
      if (failed.length > 0) {
        message.error(`${fallback}：${failed[0]?.error ?? "请检查后重试"}`);
      } else {
        message.error(fallback);
      }
    } finally {
      setImporting(false);
    }
  }, [file, mapping, selectedRowKeys, validation, workspaceSlug, projectId, onSuccess, onClose]);

  return {
    // refs / state
    fileInputRef,
    step,
    file,
    inspect,
    mapping,
    mappingError,
    validation,
    selectedRowKeys,
    // loadings
    downloadingTemplate,
    inspecting,
    validating,
    importing,
    // actions
    openPicker,
    handleFileChange,
    downloadTemplate,
    updateMapping,
    handleValidate,
    handleImport,
    setSelectedRowKeys,
    setStep,
    // derived helpers
    passedRowKeys: useMemo<Set<number>>(
      () => new Set((validation?.results ?? []).filter((r: ValidationRow) => r.passed).map((r) => r.row_number)),
      [validation]
    ),
  };
}
