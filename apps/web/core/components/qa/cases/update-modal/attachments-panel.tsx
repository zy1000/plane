"use client";

import React from "react";
import { Button, Modal, Table, Tooltip } from "antd";
import * as LucideIcons from "lucide-react";
import { convertBytesToSize, renderFormattedDate } from "@plane/utils";

type AttachmentsPanelProps = {
  attachmentsLoading: boolean;
  canEdit?: boolean;
  caseAttachments: any[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFilesChosen: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadAttachment: (attachment: any) => void;
  onRemoveCaseAttachment: (id: string) => void;
};

export function AttachmentsPanel(props: AttachmentsPanelProps) {
  const {
    attachmentsLoading,
    canEdit = true,
    caseAttachments,
    fileInputRef,
    onFilesChosen,
    onDownloadAttachment,
    onRemoveCaseAttachment,
  } = props;

  return (
    <section
      aria-label="附件"
      aria-busy={attachmentsLoading}
      className="rounded-b-md border-subtle ring-1 ring-transparent transition-colors focus-within:border-accent-subtle focus-within:ring-accent-subtle"
      role="group"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        aria-hidden="true"
        onChange={onFilesChosen}
      />
      <Table
          size="small"
          loading={attachmentsLoading}
          rowKey={(r: any) => String(r?.id ?? "")}
          dataSource={caseAttachments}
          pagination={false}
          rowClassName={() => "hover:bg-layer-1-hover"}
          onRow={(record: any) => ({
            tabIndex: 0,
            onKeyDown: (e) => {
              if ((e as React.KeyboardEvent).key === "Enter") onDownloadAttachment(record);
            },
          })}
          columns={[
            {
              title: "名称",
              dataIndex: ["attributes", "name"],
              render: (_: any, record: any) => {
                const name = String(record?.attributes?.name ?? record?.asset ?? "-");
                const sizeNum = Number(record?.attributes?.size ?? 0);
                const sizeText = (() => {
                  try {
                    return convertBytesToSize(sizeNum);
                  } catch {
                    return `${(sizeNum / 1024).toFixed(2)}KB`;
                  }
                })();
                const mime: string = String(record?.attributes?.type ?? "");
                const icon = (() => {
                  if (mime.startsWith("image/"))
                    return <LucideIcons.Image size={16} className="text-tertiary" aria-hidden="true" />;
                  if (mime.startsWith("video/"))
                    return <LucideIcons.Video size={16} className="text-tertiary" aria-hidden="true" />;
                  if (mime.startsWith("audio/"))
                    return <LucideIcons.Music size={16} className="text-tertiary" aria-hidden="true" />;
                  if (
                    mime === "text/plain" ||
                    mime === "application/pdf" ||
                    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  )
                    return <LucideIcons.FileText size={16} className="text-tertiary" aria-hidden="true" />;
                  if (
                    [
                      "application/zip",
                      "application/x-zip",
                      "application/x-zip-compressed",
                      "application/x-7z-compressed",
                      "application/x-rar",
                      "application/x-rar-compressed",
                      "application/x-tar",
                      "application/gzip",
                    ].includes(mime)
                  )
                    return <LucideIcons.Archive size={16} className="text-tertiary" aria-hidden="true" />;
                  return <LucideIcons.File size={16} className="text-tertiary" aria-hidden="true" />;
                })();
                return (
                  <div className="flex min-w-0 items-center gap-2">
                    {icon}
                    <span className="max-w-[360px] truncate text-sm text-secondary">{name}</span>
                    <span className="text-xs text-tertiary">{sizeText}</span>
                  </div>
                );
              },
            },
            {
              title: "类型",
              dataIndex: ["attributes", "type"],
              render: (v: any) => {
                const mime = String(v ?? "");
                if (mime.startsWith("image/")) return "图片";
                if (mime.startsWith("video/")) return "视频";
                if (mime.startsWith("audio/")) return "音频";
                if (mime === "text/plain") return "文本";
                if (mime === "application/pdf") return "PDF文档";
                if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "Word";
                return "-";
              },
            },
            {
              title: "上传时间",
              dataIndex: "created_at",
              render: (v: any) => {
                const dt = String(v ?? "");
                try {
                  return renderFormattedDate(dt, "YYYY年MM月DD日");
                } catch {
                  return dt;
                }
              },
            },
            {
              title: "操作",
              key: "actions",
              render: (_: any, record: any) => (
                <div className="flex items-center gap-3">
                  <Tooltip title="下载">
                    <Button
                      type="text"
                      aria-label="下载附件"
                      icon={
                        <LucideIcons.Download
                          size={16}
                          className="text-secondary hover:text-accent-primary"
                          aria-hidden="true"
                        />
                      }
                      onClick={() =>
                        Modal.confirm({
                          title: "下载附件",
                          content: `确认下载：${String(record?.attributes?.name ?? "附件")}`,
                          onOk: () => onDownloadAttachment(record),
                        })
                      }
                    />
                  </Tooltip>
                  <Tooltip title="删除">
                    <Button
                      type="text"
                      danger
                      aria-label="删除附件"
                      disabled={!canEdit}
                      icon={
                        <LucideIcons.Trash2
                          size={16}
                          className="text-secondary hover:text-danger-primary"
                          aria-hidden="true"
                        />
                      }
                      onClick={() =>
                        Modal.confirm({
                          title: "删除附件",
                          content: `确认删除：${String(record?.attributes?.name ?? "附件")}`,
                          onOk: () => onRemoveCaseAttachment(String(record?.id ?? "")),
                        })
                      }
                    />
                  </Tooltip>
                </div>
              ),
            },
          ]}
        />
    </section>
  );
}
