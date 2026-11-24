"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, Plus, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSearchSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  MODULE_NAME_MAX_LENGTH,
  applyIndentKey,
  buildBulkPreview,
  type TBulkModuleItem,
  type TBulkModuleResult,
} from "./module-bulk-utils";
import { indexModuleTree } from "./module-tree-utils";
import type { TModuleTreeNode } from "./types";

/** 上级选「顶级」时的值 */
const TOP_LEVEL = "__top__";

type TParentOption = { key: string; label: string; path: string; depth: number };

const flattenParents = (nodes: TModuleTreeNode[], depth = 0, prefix = ""): TParentOption[] =>
  nodes
    .filter((node) => !node.virtual)
    .flatMap((node) => {
      const path = prefix ? `${prefix} / ${node.label}` : node.label;
      return [
        { key: node.key, label: node.label, path, depth },
        ...flattenParents(node.children ?? [], depth + 1, path),
      ];
    });

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    if (payload.error || payload.detail) return payload.error ?? payload.detail ?? "";
  }
  return "批量新建失败，请重试";
};

export type TModuleBulkCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** 当前模块树（用于选上级、预览已有模块）；「全部」「未归类」这类虚拟节点不要传或标 virtual */
  nodes: TModuleTreeNode[];
  /** 打开时默认的上级；null = 顶级 */
  defaultParentKey: string | null;
  /** 一级模块由产品分类管理时传 false：上级不能选「顶级」 */
  allowTopLevel?: boolean;
  onSubmit: (parentKey: string | null, items: TBulkModuleItem[]) => Promise<TBulkModuleResult>;
  /** 建完回调（父级 key 供调用方展开） */
  onCreated?: (parentKey: string | null, result: TBulkModuleResult) => void;
};

/**
 * 批量新建模块：选上级 → 每行一个名称、Tab 缩进为下级 → 右侧实时预览（已有灰、新增蓝 +，同级重名跳过）。
 * 8 处可编辑模块树共用，接口各自传 onSubmit。
 */
export const ModuleBulkCreateModal = ({
  isOpen,
  onClose,
  nodes,
  defaultParentKey,
  allowTopLevel = true,
  onSubmit,
  onCreated,
}: TModuleBulkCreateModalProps) => {
  const [parentKey, setParentKey] = useState<string>(TOP_LEVEL);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parentOptions = useMemo(() => flattenParents(nodes), [nodes]);
  const { nodeByKey } = useMemo(() => indexModuleTree(nodes), [nodes]);

  useEffect(() => {
    if (!isOpen) return;
    setRaw("");
    setError(null);
    const fallback = allowTopLevel ? TOP_LEVEL : (parentOptions[0]?.key ?? TOP_LEVEL);
    setParentKey(defaultParentKey && nodeByKey.has(defaultParentKey) ? defaultParentKey : fallback);
    // 只在打开时取一次默认值，树刷新不打断正在填的表单
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const isTop = parentKey === TOP_LEVEL;
  const parentNode = isTop ? undefined : nodeByKey.get(parentKey);
  const parentLabel = isTop ? "顶级" : (parentNode?.label ?? "");
  const existingChildren = useMemo(
    () => (isTop ? nodes.filter((node) => !node.virtual) : (parentNode?.children ?? [])),
    [isTop, nodes, parentNode]
  );
  const preview = useMemo(() => buildBulkPreview(raw, existingChildren), [raw, existingChildren]);
  const hasInput = preview.items.length > 0;
  const blocked = preview.tooLong.length > 0 || (isTop && !allowTopLevel);
  const canSubmit = preview.createCount > 0 && !blocked && !isSubmitting;

  const selectOptions = useMemo(
    () => [
      {
        value: TOP_LEVEL,
        query: "顶级",
        disabled: !allowTopLevel,
        content: (
          <span className="flex w-full items-center gap-2">
            <span className="flex-1">顶级</span>
            {!allowTopLevel && <span className="text-12 text-placeholder">一级由产品分类管理</span>}
          </span>
        ),
      },
      ...parentOptions.map((option) => ({
        value: option.key,
        query: option.path,
        content: (
          <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: option.depth * 16 }}>
            <Folder className="size-3.5 shrink-0 text-tertiary" strokeWidth={1.75} />
            <span className="truncate" title={option.path}>
              {option.label}
            </span>
          </span>
        ),
      })),
    ],
    [allowTopLevel, parentOptions]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const target = event.currentTarget;
    const next = applyIndentKey(target.value, target.selectionStart, target.selectionEnd, event.shiftKey);
    setRaw(next.value);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(next.start, next.end));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const target = isTop ? null : parentKey;
      const result = await onSubmit(target, preview.items);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已新建 ${result.created} 个模块` });
      onCreated?.(target, result);
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXXXL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-18 font-semibold text-primary">批量新建模块</h2>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover disabled:opacity-50"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="flex w-[420px] max-w-full flex-col gap-1.5">
          <span className="flex items-center gap-1 text-14 font-medium text-primary">
            上级模块
            <span className="text-danger-primary">*</span>
          </span>
          <CustomSearchSelect
            value={parentKey}
            onChange={(value: string) => setParentKey(value)}
            options={selectOptions}
            searchPlaceholder="搜索模块"
            maxHeight="md"
            input
            buttonClassName="h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-14"
            optionsClassName="w-[420px]"
            label={
              <span className="flex min-w-0 items-center gap-2 text-14 text-primary">
                <Folder className="size-4 shrink-0 text-tertiary" strokeWidth={1.75} />
                <span className="truncate">{parentLabel}</span>
              </span>
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline">
              <label
                htmlFor="module-bulk-names"
                className="flex flex-1 items-center gap-1 text-14 font-medium text-primary"
              >
                模块名称
                <span className="text-danger-primary">*</span>
              </label>
              <span className="text-12 text-tertiary">每行一个，Tab 缩进为下级</span>
            </div>
            <textarea
              id="module-bulk-names"
              ref={textareaRef}
              value={raw}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              spellCheck={false}
              onKeyDown={handleKeyDown}
              onChange={(event) => {
                setRaw(event.target.value);
                if (error) setError(null);
              }}
              placeholder={"载波通信\n\tHPLC\n\t双模\n无线通信\n\tLoRa"}
              className={cn(
                "h-[340px] w-full resize-none rounded-md border bg-surface-1 px-3 py-2.5 text-14 leading-[26px] text-primary outline-none [tab-size:4] placeholder:text-placeholder focus:border-accent-strong",
                error ? "border-danger-strong" : "border-subtle"
              )}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline">
              <span className="flex-1 text-14 font-medium text-primary">预览</span>
              <span className="text-12 text-tertiary">灰色为已有模块</span>
            </div>
            <div className="flex h-[340px] flex-col rounded-md bg-layer-1 px-3 py-2.5">
              <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto">
                {!isTop && parentNode && <PreviewRow label={parentNode.label} depth={0} isNew={false} />}
                {hasInput ? (
                  preview.rows.map((row) => (
                    <PreviewRow
                      key={row.key}
                      label={row.label}
                      depth={row.depth + (isTop ? 0 : 1)}
                      isNew={row.isNew}
                      tooLong={row.tooLong}
                    />
                  ))
                ) : (
                  <div className="pt-10 text-center text-13 text-placeholder">在左侧输入后这里显示结果</div>
                )}
              </div>
              {preview.skipped.length > 0 && (
                <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5 border-t border-subtle pt-2.5">
                  <span className="mr-1 text-12 text-secondary">跳过 {preview.skipped.length} 行</span>
                  {preview.skipped.map((item, index) => (
                    <span
                      key={`${item.name}-${index}`}
                      className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-layer-2 px-2 text-12 text-tertiary"
                    >
                      <span className="max-w-40 truncate line-through">{item.name}</span>
                      <span className="shrink-0">{item.reason === "exists" ? "已存在" : "重复"}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {error && <p className="-mt-2 text-12 text-danger-primary">{error}</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-subtle px-5 py-3">
        <span className="min-w-0 flex-1 truncate text-13 text-secondary">
          {preview.tooLong.length > 0 ? (
            <span className="text-danger-primary">
              有 {preview.tooLong.length} 个名称超过 {MODULE_NAME_MAX_LENGTH} 个字，改短后才能提交
            </span>
          ) : preview.createCount > 0 ? (
            <>
              {isTop ? "将新建 " : `将在「${parentLabel}」下新建 `}
              <b className="font-semibold text-primary">{preview.createCount}</b> 个模块
              {preview.maxDepth > 1 ? `，最深 ${preview.maxDepth} 级` : ""}
            </>
          ) : null}
        </span>
        <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
          取消
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={() => void handleSubmit()}
          loading={isSubmitting}
          disabled={!canSubmit}
        >
          {preview.createCount > 0 ? `新建 ${preview.createCount} 个模块` : "新建"}
        </Button>
      </div>
    </ModalCore>
  );
};

const PreviewRow = ({
  label,
  depth,
  isNew,
  tooLong = false,
}: {
  label: string;
  depth: number;
  isNew: boolean;
  tooLong?: boolean;
}) => (
  <div className="flex h-[26px] items-center gap-1.5 text-14" style={{ paddingLeft: depth * 20 }}>
    {isNew ? (
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded text-on-color",
          tooLong ? "bg-danger-primary" : "bg-accent-primary"
        )}
      >
        <Plus className="size-2.5" strokeWidth={3} />
      </span>
    ) : (
      <Folder className="size-4 shrink-0 text-placeholder" strokeWidth={1.75} />
    )}
    <span
      className={cn("truncate", isNew ? "font-medium text-primary" : "text-tertiary", tooLong && "text-danger-primary")}
      title={label}
    >
      {label}
    </span>
    {tooLong && <span className="shrink-0 text-12 text-danger-primary">超过 {MODULE_NAME_MAX_LENGTH} 字</span>}
  </div>
);
