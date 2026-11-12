/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// local imports
import type { TFieldFormState } from "./field-form";

/** 「将移除」最多列出的选项数，超出只报总数 */
const REMOVED_PREVIEW_LIMIT = 10;

/** 多行文本 → 选项：每行一个，去首尾空格、去空行、去重，保持出现顺序 */
const parseOptions = (text: string): string[] =>
  Array.from(
    new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );

/**
 * 整体替换下拉选项。不在新列表里的选项按删除处理：默认值、可选项联动里对它的引用一并清掉；至少留一个空行。
 * 文本里看不出「改名」，改了字的那一行等于删旧加新。
 */
export function replaceSelectOptions(form: TFieldFormState, options: string[]): TFieldFormState {
  const kept = new Set(options);
  return {
    ...form,
    select_options: options.length > 0 ? options : [""],
    select_default_value: kept.has(form.select_default_value) ? form.select_default_value : "",
    select_default_values: form.select_default_values.filter((value) => kept.has(value)),
    linkage: form.linkage.options
      ? {
          ...form.linkage,
          options: {
            rules: form.linkage.options.rules.map((rule) => ({
              ...rule,
              options: rule.options.filter((value) => kept.has(value)),
            })),
          },
        }
      : form.linkage,
  };
}

type PanelProps = {
  options: string[];
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
  onConfirm: (options: string[]) => void;
};

/** 弹窗内容：每次打开重新挂载，草稿从当时的选项开始 */
function BulkEditPanel({ options, textareaRef, onClose, onConfirm }: PanelProps) {
  // 只取打开时的选项：确定后外面的表单已经变了，离场动画期间统计不跟着跳
  const [initial] = useState(options);
  const [text, setText] = useState(() => initial.join("\n"));

  // 光标落在末尾，方便接着往下加
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.scrollTop = textarea.scrollHeight;
  }, [textareaRef]);

  const next = parseOptions(text);
  const nextSet = new Set(next);
  const initialSet = new Set(initial);
  const addedCount = next.filter((option) => !initialSet.has(option)).length;
  const removed = initial.filter((option) => !nextSet.has(option));

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-subtle px-5 py-4">
        <h2 className="min-w-0 flex-1 truncate text-16 font-semibold text-primary">批量编辑选项</h2>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-2 px-5 py-5">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
          placeholder="每行输入一个选项"
          aria-label="选项，每行一个"
          className="block w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-14 leading-[22px] text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
        />
        <p className="text-12 text-tertiary">每行一个选项，空行和重复的选项会自动忽略。</p>
        {removed.length > 0 && (
          <p className="text-12 break-words text-danger-primary">
            将移除 {removed.length} 个选项：{removed.slice(0, REMOVED_PREVIEW_LIMIT).join("、")}
            {removed.length > REMOVED_PREVIEW_LIMIT ? " 等" : ""}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-subtle px-5 py-3">
        <span className="min-w-0 flex-1 truncate text-12 text-tertiary">
          共 {next.length} 个选项{addedCount > 0 ? `，新增 ${addedCount} 个` : ""}
        </span>
        <Button type="button" variant="secondary" size="xl" className="px-3" onClick={onClose}>
          取消
        </Button>
        <Button type="button" variant="primary" size="xl" className="px-3" onClick={() => onConfirm(next)}>
          确定
        </Button>
      </div>
    </div>
  );
}

type Props = {
  form: TFieldFormState;
  onChange: (form: TFieldFormState) => void;
  /** 入口按钮的样式：行内表单和字段库弹窗的字号不同 */
  className?: string;
};

/**
 * 下拉选项的「批量编辑」入口 + 弹窗：整份选项放进一个文本框，每行一个，确定后整体替换。
 * 类型属性的行内表单和字段库的编辑弹窗共用。
 */
export function FieldOptionsBulkEdit({ form, onChange, className }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const close = () => setIsOpen(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setIsOpen(true)}>
        批量编辑
      </button>
      <ModalCore
        isOpen={isOpen}
        handleClose={close}
        position={EModalPosition.CENTER}
        width={EModalWidth.XL}
        initialFocus={textareaRef}
      >
        <BulkEditPanel
          options={parseOptions(form.select_options.join("\n"))}
          textareaRef={textareaRef}
          onClose={close}
          onConfirm={(options) => {
            onChange(replaceSelectOptions(form, options));
            close();
          }}
        />
      </ModalCore>
    </>
  );
}
