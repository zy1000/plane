"use client";

import * as React from "react";
import { Checkbox } from "antd";
import { CloudUpload, Maximize2, Paperclip } from "lucide-react";
import { Button } from "@plane/propel/button";
import { getResultTone, PendingFileChip } from "./execution-file-ui";
import type { PendingFile } from "./use-pending-execution-files";

type Props = {
  /** 执行结果枚举：结果名 → 颜色名，已去掉「未执行」 */
  resultOptions: Record<string, string>;
  result: string | null;
  onResultChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  onExpandReason: () => void;
  pendingFiles: PendingFile[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  autoNext: boolean;
  onAutoNextChange: (value: boolean) => void;
  /** 仅执行人可提交 */
  canSubmit: boolean;
  submitLoading: boolean;
  onSubmit: () => void;
  onCreateDefect: () => void;
};

/**
 * 测试执行页底部「本次执行」：结果、原因、附件放在同一块里一起提交。
 * 附件只暂存在浏览器，提交结果成功后才上传并绑定到这次执行记录。
 */
export const ExecutionResultComposer: React.FC<Props> = (props) => {
  const {
    resultOptions,
    result,
    onResultChange,
    reason,
    onReasonChange,
    onExpandReason,
    pendingFiles,
    onAddFiles,
    onRemoveFile,
    autoNext,
    onAutoNextChange,
    canSubmit,
    submitLoading,
    onSubmit,
    onCreateDefect,
  } = props;
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  // dragenter/dragleave 会在子元素间反复触发，用计数判断是否真的离开
  const dragDepthRef = React.useRef(0);
  const [dragging, setDragging] = React.useState(false);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const handleDragEnter = (e: React.DragEvent) => {
    if (!canSubmit || !hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!canSubmit || !hasFiles(e)) return;
    e.preventDefault();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!canSubmit || !hasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!canSubmit || !hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onAddFiles(files);
  };

  return (
    <div
      className="sticky bottom-0 flex w-full shrink-0 flex-col gap-3 border-t border-subtle bg-surface-1 px-4 py-4 font-body"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-14 font-semibold text-primary">本次执行</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(resultOptions).map(([value, color]) => {
            const tone = getResultTone(color);
            const selected = result === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={!canSubmit}
                onClick={() => onResultChange(value)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-13 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected ? `${tone.selected} font-medium` : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1"
                }`}
              >
                <span className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
                {value}
              </button>
            );
          })}
        </div>
      </div>

      {dragging ? (
        <div className="flex h-10 items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-accent-strong bg-accent-subtle text-14 font-medium text-accent-primary">
          <CloudUpload size={18} />
          松开即可添加到本次执行
        </div>
      ) : (
        <div className="flex items-center gap-0.5 rounded-lg border border-strong bg-surface-1 pr-1 pl-3 focus-within:border-accent-strong">
          {/* 仍用 textarea：全屏弹窗里能输入换行，单行 input 会把换行吞掉 */}
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            onDoubleClick={onExpandReason}
            onKeyDownCapture={(e) => {
              if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Escape" || e.key === "Tab") return;
              e.stopPropagation();
            }}
            disabled={!canSubmit}
            rows={1}
            placeholder="请输入原因"
            aria-label="执行原因"
            className="block min-w-0 flex-1 resize-none bg-transparent py-[8px] text-14 leading-[22px] text-primary outline-none placeholder:text-placeholder disabled:cursor-not-allowed"
          />
          <button
            type="button"
            aria-label="添加附件"
            title="添加附件"
            disabled={!canSubmit}
            onClick={() => fileInputRef.current?.click()}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip size={17} />
          </button>
          <button
            type="button"
            aria-label="全屏输入"
            title="全屏输入"
            disabled={!canSubmit}
            onClick={onExpandReason}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-placeholder transition-colors hover:bg-layer-1 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Maximize2 size={15} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) onAddFiles(files);
              // 清空以便再次选择同一个文件
              e.target.value = "";
            }}
          />
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div className="flex max-h-[104px] flex-wrap gap-2 overflow-y-auto vertical-scrollbar scrollbar-sm">
          {pendingFiles.map((pf) => (
            <PendingFileChip key={pf.id} file={pf.file} onRemove={() => onRemoveFile(pf.id)} />
          ))}
        </div>
      )}

      {!canSubmit && <div className="text-12 text-danger-primary">当前用例仅执行人可提交执行结果</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox checked={autoNext} onChange={(e) => onAutoNextChange(e.target.checked)}>
          <span className="text-13 text-secondary">提交后切换下一条</span>
        </Checkbox>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="xl"
            className="h-9 px-4"
            title="为当前用例创建一个缺陷工作项"
            onClick={onCreateDefect}
          >
            新增缺陷
          </Button>
          <Button
            variant="primary"
            size="xl"
            className="h-9 gap-2 px-4"
            disabled={!canSubmit || submitLoading}
            onClick={onSubmit}
          >
            {submitLoading ? "提交中..." : "提交结果"}
            {!submitLoading && pendingFiles.length > 0 && (
              <span
                className="-mr-1.5 inline-flex h-[22px] items-center gap-0.5 rounded-full bg-white/20 pr-2 pl-1.5 text-12"
                aria-label={`含 ${pendingFiles.length} 个附件`}
              >
                <Paperclip size={12} />
                {pendingFiles.length}
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
