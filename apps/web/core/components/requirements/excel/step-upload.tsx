"use client";

/**
 * 导入弹窗 Step 1：下载模板 + 选择文件（点选或拖入）。
 *
 * 与工作项导入相比**没有字段映射这一步** —— Excel 的列名就是需求类型的列名，映射由
 * 后端按名字完成，不需要用户再手工连一遍线。
 */

import React from "react";
import { CircleAlert, Download, FileSpreadsheet, Info, Upload, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";

type TProps = {
  file: File | null;
  isDownloadingTemplate: boolean;
  onDownloadTemplate: () => void;
  onPickFile: (file: File | null) => void;
  error: string | null;
};

/** 左列是短标签，右列是规则正文（正文 key 沿用原来的整句说明，只去掉了打头的「xx」） */
const RULES = [
  { label: "requirement_excel.upload.rule_label_sequence", body: "requirement_excel.upload.rule_sequence" },
  { label: "requirement_excel.upload.rule_label_member", body: "requirement_excel.upload.rule_member" },
  { label: "requirement_excel.upload.rule_label_parent", body: "requirement_excel.upload.rule_parent" },
  { label: "requirement_excel.upload.rule_label_module", body: "requirement_excel.upload.rule_module" },
  { label: "requirement_excel.upload.rule_label_form", body: "requirement_excel.upload.rule_form" },
  { label: "requirement_excel.upload.rule_label_skipped", body: "requirement_excel.upload.rule_skipped" },
];

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function RequirementExcelStepUpload({
  file,
  isDownloadingTemplate,
  onDownloadTemplate,
  onPickFile,
  error,
}: TProps) {
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  /** 拖进来的不是 .xlsx 时的本地提示；点选走 accept 过滤，到不了这里 */
  const [typeError, setTypeError] = React.useState<string | null>(null);

  const openPicker = () => inputRef.current?.click();

  const acceptFile = (selected: File | null | undefined) => {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".xlsx")) {
      setTypeError(t("requirement_excel.upload.only_xlsx"));
      return;
    }
    setTypeError(null);
    onPickFile(selected);
  };

  const limits = t("requirement_excel.upload.limits");
  const shownError = typeError ?? error;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center gap-3.5 rounded-lg bg-surface-2 px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-subtle bg-surface-1 text-secondary">
          <FileSpreadsheet className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-14 font-medium text-primary">{t("requirement_excel.upload.template_question")}</div>
          <p className="mt-0.5 text-13 text-tertiary">{t("requirement_excel.upload.template_hint")}</p>
        </div>
        <Button
          variant="secondary"
          size="lg"
          prependIcon={<Download />}
          loading={isDownloadingTemplate}
          onClick={onDownloadTemplate}
        >
          {t("requirement_excel.menu.template")}
        </Button>
      </section>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          // 清空 value，否则连选两次同一个文件不会触发 change
          event.target.value = "";
          acceptFile(selected);
        }}
      />
      <div
        role={file ? undefined : "button"}
        tabIndex={file ? undefined : 0}
        onClick={file ? undefined : openPicker}
        onKeyDown={
          file
            ? undefined
            : (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPicker();
                }
              }
        }
        onDragOver={(event) => {
          event.preventDefault();
          if (!isDragging) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          acceptFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex flex-col items-center gap-3.5 rounded-xl border-[1.5px] border-dashed p-5 transition-colors",
          isDragging ? "border-accent-strong bg-accent-subtle" : "border-accent-subtle bg-accent-subtle/40",
          !file && "cursor-pointer hover:border-accent-strong"
        )}
      >
        {file ? (
          <>
            <div className="flex w-full items-center gap-3 rounded-lg border border-subtle bg-surface-1 px-3.5 py-3 shadow-raised-100">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-success-subtle text-11 font-bold text-success-primary">
                XLSX
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-14 font-medium text-primary" title={file.name}>
                  {file.name}
                </div>
                <div className="mt-0.5 text-12 text-tertiary">{formatFileSize(file.size)}</div>
              </div>
              <Button variant="secondary" size="lg" onClick={openPicker}>
                {t("requirement_excel.upload.file_replace")}
              </Button>
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                onClick={() => {
                  setTypeError(null);
                  onPickFile(null);
                }}
                aria-label={t("requirement_excel.upload.remove_file")}
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-13 text-tertiary">
              {t("requirement_excel.upload.drop_replace_hint")} · {limits}
            </p>
          </>
        ) : (
          <>
            <span className="grid size-10 place-items-center rounded-full bg-surface-1 text-accent-primary">
              <Upload className="size-5" />
            </span>
            <div className="text-center">
              <p className="text-14 text-primary">
                {t("requirement_excel.upload.drop_hint")}{" "}
                <span className="font-medium text-accent-primary">{t("requirement_excel.upload.drop_action")}</span>
              </p>
              <p className="mt-1 text-13 text-tertiary">{limits}</p>
            </div>
          </>
        )}
      </div>

      {shownError && (
        <div className="flex items-start gap-2 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-13 text-danger-primary">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{shownError}</span>
        </div>
      )}

      <section>
        <div className="mb-1 flex items-center gap-1.5 text-13 font-semibold text-primary">
          <Info className="size-[15px] text-tertiary" />
          {t("requirement_excel.upload.rules_title")}
        </div>
        <dl>
          {RULES.map((rule) => (
            <div key={rule.label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-t border-subtle py-2">
              <dt className="text-13 leading-[21px] font-semibold text-primary">{t(rule.label)}</dt>
              <dd className="text-13 leading-[21px] text-secondary">{t(rule.body)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
