"use client";

import * as React from "react";
import { Spin } from "antd";
import { ArrowRight, Download } from "lucide-react";
import { renderFormattedDate } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { useMember } from "@/hooks/store/use-member";
import { FileTypeBadge, formatFileSize, getResultTone, PendingFileChip } from "./execution-file-ui";
import type { ExecAttachment, ExecRecord } from "./execution-records";
import type { PendingFile } from "./use-pending-execution-files";

type Props = {
  pendingFiles: PendingFile[];
  onRemovePending: (id: string) => void;
  /** 切回基本信息页签去提交 */
  onGoSubmit: () => void;
  /** 当前计划用例的全部执行记录（按时间倒序） */
  records: ExecRecord[];
  recordsLoading: boolean;
  /** 执行结果 → 颜色名 */
  resultColorMap: Record<string, string>;
  onDownloadExecutionFile: (file: ExecAttachment) => void;
  /** 用例本身的附件 */
  caseAttachments: any[];
  onDownloadCaseAttachment: (attachment: any) => void;
};

const FileRow: React.FC<{ name: string; size: number; onDownload: () => void }> = ({ name, size, onDownload }) => (
  <div className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-[7px] transition-colors hover:bg-layer-1">
    <FileTypeBadge name={name} size="lg" />
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-14 leading-5 text-primary" title={name}>
        {name}
      </span>
      <span className="text-12 leading-[17px] text-placeholder">{formatFileSize(size)}</span>
    </div>
    <button
      type="button"
      aria-label={`下载 ${name}`}
      title="下载"
      onClick={onDownload}
      className="flex size-[30px] shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-2 hover:text-primary"
    >
      <Download size={16} />
    </button>
  </div>
);

const SectionTitle: React.FC<{ title: string; count: number; extra?: React.ReactNode }> = ({ title, count, extra }) => (
  <div className="mb-1.5 flex items-baseline justify-between">
    <span className="text-14 font-semibold text-primary">
      {title}
      <span className="ml-1.5 text-13 font-normal text-placeholder">{count}</span>
    </span>
    {extra}
  </div>
);

const Dot = () => <span className="size-[3px] shrink-0 rounded-full bg-[var(--txt-placeholder)]" />;

/**
 * 附件页签：本次待提交 / 各次执行的附件 / 用例附件 三处来源分开列。
 * 底部「添加附件」传的是执行附件，提交前就能在这里看到，免得误以为传丢了。
 */
export const ExecutionAttachmentsPanel: React.FC<Props> = (props) => {
  const {
    pendingFiles,
    onRemovePending,
    onGoSubmit,
    records,
    recordsLoading,
    resultColorMap,
    onDownloadExecutionFile,
    caseAttachments,
    onDownloadCaseAttachment,
  } = props;
  const { getUserDetails } = useMember();

  const executionGroups = records
    .map((r, idx) => ({ record: r, sequence: records.length - idx, files: r.attachments ?? [] }))
    .filter((g) => g.files.length > 0);
  const executionFileCount = executionGroups.reduce((n, g) => n + g.files.length, 0);
  const isEmpty = pendingFiles.length === 0 && executionFileCount === 0 && caseAttachments.length === 0;

  if (isEmpty) {
    return recordsLoading ? (
      <div className="flex justify-center py-12">
        <Spin size="small" />
      </div>
    ) : (
      <div className="py-12 text-center text-14 text-placeholder">暂无附件</div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {pendingFiles.length > 0 && (
        <div className="rounded-[10px] border border-warning-subtle bg-warning-subtle px-3.5 pt-3 pb-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-14 font-semibold text-primary">
              本次执行
              <span className="inline-flex h-5 items-center rounded-full bg-surface-1 px-2 text-12 font-medium text-warning-primary">
                待提交
              </span>
            </span>
            <button
              type="button"
              onClick={onGoSubmit}
              className="inline-flex items-center gap-1 text-13 font-medium text-accent-primary hover:underline"
            >
              去提交结果
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((pf) => (
              <PendingFileChip
                key={pf.id}
                file={pf.file}
                onRemove={() => onRemovePending(pf.id)}
                className="bg-surface-1"
              />
            ))}
          </div>
        </div>
      )}

      {executionFileCount > 0 && (
        <div className="flex flex-col">
          <SectionTitle title="执行附件" count={executionFileCount} />
          {executionGroups.map(({ record, sequence, files }, groupIdx) => {
            const uid = record.assignee ? String(record.assignee) : record.created_by ? String(record.created_by) : null;
            const name = (uid && getUserDetails(uid)?.display_name) || "未知用户";
            const time = record.created_at ? renderFormattedDate(record.created_at, "yyyy-MM-dd HH:mm") : "";
            return (
              <div key={record.id} className="flex flex-col">
                <div
                  className={`flex flex-wrap items-center gap-2 pb-1 text-13 text-tertiary ${groupIdx === 0 ? "pt-2.5" : "pt-3.5"}`}
                >
                  <span className="font-medium text-primary">第 {sequence} 次执行</span>
                  <Dot />
                  {uid && <ButtonAvatars showTooltip={false} userIds={uid} size="sm" />}
                  <span>{name}</span>
                  {time && (
                    <>
                      <Dot />
                      <span>{time}</span>
                    </>
                  )}
                  {record.result && (
                    <>
                      <Dot />
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-2 rounded-full ${getResultTone(resultColorMap[record.result]).dot}`} />
                        {record.result}
                      </span>
                    </>
                  )}
                </div>
                {files.map((f) => (
                  <FileRow key={f.id} name={f.name} size={f.size} onDownload={() => onDownloadExecutionFile(f)} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {executionFileCount > 0 && caseAttachments.length > 0 && <div className="border-t border-subtle" />}

      {caseAttachments.length > 0 && (
        <div className="flex flex-col">
          <SectionTitle
            title="用例附件"
            count={caseAttachments.length}
            extra={<span className="text-12 text-placeholder">来自用例</span>}
          />
          {caseAttachments.map((a) => {
            const name = String(a?.attributes?.name || a?.filename || a?.id);
            return (
              <FileRow
                key={String(a?.id)}
                name={name}
                size={Number(a?.attributes?.size ?? a?.size ?? 0)}
                onDownload={() => onDownloadCaseAttachment(a)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
