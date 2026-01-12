"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, Table, Tabs, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DownloadOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import { CaseService } from "@/services/qa/case.service";

type ValidationRow = {
  row_number: number;
  title: string;
  passed: boolean;
  error_reason: string;
};

type ValidationResponse = {
  total_count: number;
  passed_count: number;
  all_passed: boolean;
  results: ValidationRow[];
};

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  repositoryId: string;
  onSuccess?: () => void | Promise<void>;
};

const caseService = new CaseService();

export function ImportCaseModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, repositoryId, onSuccess } = props;

  const [currentStep, setCurrentStep] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [resultTab, setResultTab] = useState<"all" | "failed">("all");

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      setFile(null);
      setValidation(null);
      setValidating(false);
      setImporting(false);
      setDownloadingTemplate(false);
      setResultTab("all");
    }
  }, [isOpen]);

  const columns: ColumnsType<ValidationRow> = useMemo(
    () => [
      { title: "行数", dataIndex: "row_number", key: "row_number", width: 90 },
      { title: "标题", dataIndex: "title", key: "title", ellipsis: true },
      {
        title: "验证结果",
        dataIndex: "passed",
        key: "passed",
        width: 120,
        render: (v: boolean) => (
          <span className={v ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
            {v ? "通过" : "不通过"}
          </span>
        ),
      },
      {
        title: "错误原因",
        dataIndex: "error_reason",
        key: "error_reason",
        render: (v: string) => (v ? <span className="text-red-600">{v}</span> : <span className="text-custom-text-400">-</span>),
      },
    ],
    []
  );

  const openPicker = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    if (selected) {
      setFile(selected);
      setValidation(null);
    }
    e.target.value = "";
  };

  const handleValidate = async () => {
    if (!file) {
      message.error("请先选择文件");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("repository_id", repositoryId);

    setValidating(true);
    try {
      const res = await caseService.validateImportCase(workspaceSlug, formData);
      setValidation(res?.data ?? null);
      setResultTab("all");
      setCurrentStep(1);
    } catch (err: any) {
      message.error(err?.error || "校验失败");
    } finally {
      setValidating(false);
    }
  };

  const downloadFailureCsv = (rows: Array<{ name?: string; error?: string }>) => {
    const headers = ["用例名称", "失败原因"];
    const csvContent = [
      headers.join(","),
      ...rows.map((item: any) => `"${item.name || ""}","${item.error || ""}"`),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `导入失败记录_${new Date().getTime()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await caseService.downloadImportTemplate(workspaceSlug);
      const blob = res?.data as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "用例模板.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      message.error(err?.error || "下载失败");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      message.error("请先选择文件");
      return;
    }
    if (!validation?.all_passed) {
      message.error("存在未通过的校验项，请重新上传文件");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("repository_id", repositoryId);

    setImporting(true);
    try {
      const res = await caseService.importCase(workspaceSlug, formData);
      const fail = res?.data?.fail ?? [];
      if (Array.isArray(fail) && fail.length > 0) {
        message.warning(`导入完成，有 ${fail.length} 条数据导入失败，详情请查看下载的文件`);
        downloadFailureCsv(fail);
      } else {
        message.success("导入成功");
      }
      await onSuccess?.();
      handleClose();
    } catch (err: any) {
      message.error(err?.error || "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-between w-full">
      <Button onClick={handleClose}>取消</Button>
      <div className="flex items-center gap-2">
        {currentStep === 1 && (
          <Button
            onClick={() => {
              setCurrentStep(0);
            }}
            disabled={validating || importing}
          >
            上一步
          </Button>
        )}
        {currentStep === 0 && (
          <Button type="primary" onClick={handleValidate} disabled={!file || validating || importing} loading={validating}>
            下一步
          </Button>
        )}
        {currentStep === 1 && (
          <Button type="primary" onClick={handleImport} disabled={!validation?.all_passed || importing} loading={importing}>
            开始导入
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      title="导入用例"
      footer={footer}
      width={920}
      destroyOnClose
    >
      {currentStep === 0 && (
        <div className="rounded-lg border border-custom-border-200 bg-custom-background-100 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-base font-medium text-custom-text-100">1. 下载模板</div>
                <div className="mt-1 text-sm text-custom-text-300">请先下载模板并按模板格式填写测试用例。</div>
              </div>
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate} loading={downloadingTemplate}>
                下载模板
              </Button>
            </div>

            <div className="h-px bg-custom-border-200" />

            <div>
              <div className="text-base font-medium text-custom-text-100">2. 上传文件</div>
              <div className="mt-1 text-sm text-custom-text-300">支持 .xlsx 文件（与模板保持一致）。</div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-custom-text-200">已选择文件</div>
                  <div className="mt-1 truncate text-sm text-custom-text-300">{file ? file.name : "-"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="primary" icon={<UploadOutlined />} onClick={openPicker}>
                    选择上传
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    accept=".xlsx,.xls"
                    onChange={onFileChange}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="rounded-lg border border-custom-border-200 bg-custom-background-100 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-medium text-custom-text-100">校验结果</div>
              <div className="mt-1 text-sm text-custom-text-300">
                {validation
                  ? `通过 ${validation.passed_count}/${validation.total_count} 行`
                  : "暂无结果"}
              </div>
            </div>
            {validation && (
              <div
                className={
                  validation.all_passed
                    ? "px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium"
                    : "px-3 py-1 rounded-full bg-red-50 text-red-700 text-sm font-medium"
                }
              >
                {validation.all_passed ? "全部通过，可开始导入" : "存在未通过项，请返回重新上传"}
              </div>
            )}
          </div>

          <div className="mt-4">
            <Tabs
              activeKey={resultTab}
              onChange={(k) => setResultTab(k as "all" | "failed")}
              items={[
                { key: "all", label: "全部" },
                { key: "failed", label: "未通过" },
              ]}
            />
            <Table
              dataSource={
                resultTab === "failed"
                  ? (validation?.results ?? []).filter((r) => !r.passed)
                  : validation?.results ?? []
              }
              columns={columns}
              rowKey={(r) => String(r.row_number)}
              size="middle"
              pagination={false}
              bordered
              scroll={{ y: 360 }}
              rowClassName={(r) => (r.passed ? "bg-emerald-50/30" : "bg-red-50/30")}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
