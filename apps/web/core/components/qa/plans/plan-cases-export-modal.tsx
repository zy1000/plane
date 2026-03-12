"use client";

import { useRef, useState, useEffect } from "react";
import { Modal, Checkbox, Button, message } from "antd";
import { PlanService } from "@/services/qa/plan.service";

type ExportFieldOption = { key: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  planId?: string | null;
  repositoryId?: string | null;
  moduleId?: string | null;
  selectedCaseIds?: string[];
};

const EXPORT_FIELD_OPTIONS: ExportFieldOption[] = [
  { key: "code", label: "用例编号" },
  { key: "name", label: "用例名称" },
  { key: "repository_name", label: "用例库" },
  { key: "result", label: "执行结果" },
  { key: "module_name", label: "模块" },
  { key: "type", label: "类型" },
  { key: "priority", label: "优先级" },
  { key: "test_type", label: "测试类型" },
  { key: "state", label: "状态" },
  { key: "precondition", label: "前置条件" },
  { key: "steps", label: "步骤" },
  { key: "text_description", label: "文本描述" },
  { key: "text_result", label: "文本结果" },
  { key: "remark", label: "备注" },
  { key: "assignee", label: "维护人" },
  { key: "created_at", label: "创建时间" },
  { key: "updated_at", label: "更新时间" },
];

const DEFAULT_SELECTED_FIELDS = ["code", "name", "repository_name", "result"];

export default function PlanCasesExportModal({
  open,
  onClose,
  workspaceSlug,
  planId,
  repositoryId,
  moduleId,
  selectedCaseIds,
}: Props) {
  const planService = useRef(new PlanService()).current;
  const [exporting, setExporting] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(DEFAULT_SELECTED_FIELDS);

  useEffect(() => {
    if (open) {
      setSelectedExportFields(DEFAULT_SELECTED_FIELDS);
    }
  }, [open]);

  const handleExport = async () => {
    if (!workspaceSlug || !planId) {
      message.error("缺少必要参数");
      return;
    }
    if (!selectedExportFields.length) {
      message.error("请至少选择一个字段");
      return;
    }
    try {
      setExporting(true);
      const payload: any = {
        plan_id: String(planId),
        fields: selectedExportFields,
      };
      if (repositoryId) payload.repository_id = String(repositoryId);
      if (moduleId) payload.module_id = String(moduleId);
      if (selectedCaseIds?.length) payload.ids = selectedCaseIds.map(String);
      const res = await planService.post(`/api/workspaces/${workspaceSlug}/test/plan/export/`, payload, {
        responseType: "blob",
      });
      const blob = res?.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().getTime();
      a.href = url;
      a.download = `计划用例导出_${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (e: any) {
      message.error(e?.detail || e?.message || "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      title="导出用例执行"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="ok" type="primary" loading={exporting} onClick={handleExport}>
          确定
        </Button>,
      ]}
    >
      <div className="space-y-2">
        <div className="text-sm text-secondary">选择需要导出的字段：</div>
        <div className="grid grid-cols-2 gap-y-2">
          {EXPORT_FIELD_OPTIONS.map((opt) => (
            <label key={opt.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedExportFields.includes(opt.key)}
                onChange={(ev) => {
                  const checked = ev.target.checked;
                  setSelectedExportFields((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(opt.key);
                    else next.delete(opt.key);
                    return Array.from(next);
                  });
                }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
