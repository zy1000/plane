"use client";

/**
 * 导入弹窗 - Step 1：上传文件 + 字段映射。
 */

import React from "react";
import { Button, Spin } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { FieldMapping } from "./field-mapping";
import type { FieldMapping as FieldMappingType, ImportFieldKey, InspectResponse } from "./types";
import { IGNORE_FIELD } from "./types";

type Props = {
  file: File | null;
  inspect: InspectResponse | null;
  mapping: FieldMappingType;
  inspecting: boolean;
  downloadingTemplate: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onOpenPicker: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;
  onMappingChange: (column: string, value: ImportFieldKey | typeof IGNORE_FIELD) => void;
};

export function StepUpload(props: Props) {
  const {
    file,
    inspect,
    mapping,
    inspecting,
    downloadingTemplate,
    fileInputRef,
    onOpenPicker,
    onFileChange,
    onDownloadTemplate,
    onMappingChange,
  } = props;

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="1. 下载模板"
        description="请下载并按模板格式填写工作项。Excel 列名可与模板不同，下一步可手动映射到属性。"
        action={
          <Button icon={<DownloadOutlined />} onClick={onDownloadTemplate} loading={downloadingTemplate}>
            下载模板
          </Button>
        }
      />

      <Section
        title="2. 上传文件"
        description="支持 .xlsx / .xls 文件，单次最多 10000 行、最大 5 MB。"
        action={
          <Button type="primary" icon={<UploadOutlined />} onClick={onOpenPicker} loading={inspecting}>
            选择文件
          </Button>
        }
      >
        <div className="mt-1 truncate text-sm text-secondary">
          {file ? `已选择：${file.name}` : "未选择文件"}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          accept=".xlsx,.xls"
          onChange={onFileChange}
        />
      </Section>

      <Section title="3. 字段映射" description="选择 Excel 列对应的工作项属性，必填项标记为「必填」。">
        <Spin spinning={inspecting} tip="解析中">
          <FieldMapping
            headers={inspect?.headers ?? []}
            mapping={mapping}
            onChange={onMappingChange}
          />
        </Spin>
      </Section>
    </div>
  );
}

type SectionProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
};

function Section({ title, description, action, children }: SectionProps) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-medium text-primary">{title}</div>
          {description && <div className="mt-1 text-sm text-secondary">{description}</div>}
        </div>
        {action}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
