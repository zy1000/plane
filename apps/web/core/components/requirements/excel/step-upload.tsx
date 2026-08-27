"use client";

/**
 * 导入弹窗 Step 1：下载模板 + 选择文件。
 *
 * 与工作项导入相比**没有字段映射这一步** —— Excel 的列名就是需求类型的列名，映射由
 * 后端按名字完成，不需要用户再手工连一遍线。
 */

import React from "react";
import { Alert, Button } from "antd";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useTranslation } from "@plane/i18n";

type TProps = {
  file: File | null;
  isDownloadingTemplate: boolean;
  onDownloadTemplate: () => void;
  onPickFile: (file: File | null) => void;
  error: string | null;
};

const RULE_KEYS = [
  "requirement_excel.upload.rule_sequence",
  "requirement_excel.upload.rule_member",
  "requirement_excel.upload.rule_parent",
  "requirement_excel.upload.rule_module",
  "requirement_excel.upload.rule_form",
  "requirement_excel.upload.rule_skipped",
];

export function RequirementExcelStepUpload({
  file,
  isDownloadingTemplate,
  onDownloadTemplate,
  onPickFile,
  error,
}: TProps) {
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="text-14 font-medium text-primary">{t("requirement_excel.upload.template_title")}</div>
        <p className="mt-1 text-12 text-secondary">{t("requirement_excel.upload.template_hint")}</p>
        <Button className="mt-3" icon={<Download className="size-3.5" />} loading={isDownloadingTemplate} onClick={onDownloadTemplate}>
          {t("requirement_excel.menu.template")}
        </Button>
      </section>

      <section className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="text-14 font-medium text-primary">{t("requirement_excel.upload.file_title")}</div>
        <p className="mt-1 text-12 text-secondary">{t("requirement_excel.upload.file_hint")}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          style={{ display: "none" }}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            // 清空 value，否则连选两次同一个文件不会触发 change
            event.target.value = "";
            if (selected) onPickFile(selected);
          }}
        />
        <div className="mt-3 flex items-center gap-3">
          <Button type={file ? "default" : "primary"} icon={<Upload className="size-3.5" />} onClick={() => inputRef.current?.click()}>
            {t(file ? "requirement_excel.upload.file_replace" : "requirement_excel.upload.file_action")}
          </Button>
          {file ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-12 text-primary">
              <FileSpreadsheet className="size-3.5 shrink-0 text-success-primary" />
              <span className="truncate">{file.name}</span>
            </span>
          ) : (
            <span className="text-12 text-placeholder">{t("requirement_excel.upload.no_file")}</span>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-subtle bg-layer-1 p-4">
        <div className="text-13 font-medium text-primary">{t("requirement_excel.upload.rules_title")}</div>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-12 text-secondary">
          {RULE_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </section>

      {error && <Alert type="error" showIcon message={error} />}
    </div>
  );
}
