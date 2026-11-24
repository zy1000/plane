/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MultiSelectDropdown } from "@plane/ui";
import { cn } from "@plane/utils";

export type TInlineSelectOption = {
  id: string;
  label: string;
  /** 经团队拿到：显示为已勾、不可取消 */
  locked?: boolean;
  /** 右侧小字 */
  hint?: string;
};

type Props = {
  /** 可编辑的已选 id（不含 locked 项） */
  value: string[];
  options: TInlineSelectOption[];
  /** 收起时单元格里显示的内容（标签） */
  display: ReactNode;
  disabled?: boolean;
  searchPlaceholder: string;
  /** 下拉收起且选择有变化时调用一次 */
  onSave: (ids: string[]) => Promise<void>;
};

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * 成员表单元格里的多选：点开勾选，收起时有变化才保存一次（不是每勾一下就请求）。
 * 不可编辑时只显示 display。
 */
export function MemberInlineMultiSelect(props: Props) {
  const { value, options, display, disabled = false, searchPlaceholder, onSave } = props;
  const [draft, setDraft] = useState<string[]>(value);
  const [isSaving, setIsSaving] = useState(false);
  // onClose 由下拉内部触发，用 ref 读最新草稿，避免拿到旧闭包
  const draftRef = useRef<string[]>(value);

  if (disabled) return <>{display}</>;

  const lockedIds = options.filter((option) => option.locked).map((option) => option.id);
  const optionById = new Map(options.map((option) => [option.id, option]));

  const updateDraft = (ids: string[]) => {
    const next = ids.filter((id) => !lockedIds.includes(id));
    draftRef.current = next;
    setDraft(next);
  };

  const handleOpen = () => updateDraft(value);

  const handleClose = () => {
    const next = draftRef.current;
    if (sameIds(next, value)) return;
    setIsSaving(true);
    void onSave(next).finally(() => setIsSaving(false));
  };

  return (
    <MultiSelectDropdown
      value={[...draft, ...lockedIds]}
      onChange={updateDraft}
      options={options.map((option) => ({ value: option.id, data: option, disabled: option.locked }))}
      onOpen={handleOpen}
      onClose={handleClose}
      disabled={isSaving}
      disableSorting
      keyExtractor={(option) => (option.data as TInlineSelectOption).id}
      queryArray={["label"]}
      inputPlaceholder={searchPlaceholder}
      containerClassName="w-full"
      buttonContainerClassName="w-full"
      buttonContent={(isOpen) => (
        <div
          className={cn(
            "group/cell flex w-full cursor-pointer items-center gap-1 rounded border border-transparent px-1 py-0.5 -mx-1 text-left hover:border-subtle-1",
            { "border-accent-strong": isOpen, "opacity-60": isSaving }
          )}
        >
          <span className="min-w-0 flex-1">{display}</span>
          <ChevronDown
            className={cn("size-3 shrink-0 text-tertiary opacity-0 group-hover/cell:opacity-100", { "opacity-100": isOpen })}
          />
        </div>
      )}
      optionsContainerClassName="w-56"
      renderItem={({ value: id, selected }) => {
        const option = optionById.get(id);
        if (!option) return null;
        return (
          <div
            className={cn("flex w-full items-center gap-2 text-13", option.locked ? "text-tertiary" : "text-primary")}
            title={option.hint}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.hint && <span className="shrink-0 text-11 text-tertiary">{option.hint}</span>}
            {selected && <Check className="size-3.5 shrink-0" />}
          </div>
        );
      }}
    />
  );
}
