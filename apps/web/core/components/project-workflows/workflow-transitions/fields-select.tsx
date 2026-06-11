/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Tag } from "lucide-react";
import { cn } from "@plane/utils";
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";

type TFieldsSelectProps = {
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  value: string[];
  onChange: (fieldIds: string[]) => void;
  disabled?: boolean;
};

export const FieldsSelect: FC<TFieldsSelectProps> = ({
  workspaceSlug,
  projectId,
  issueTypeId,
  value,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { fields, isLoading } = useIssueTypeExtraFields(workspaceSlug, projectId, issueTypeId, undefined, { lite: true });

  const filteredFields = useMemo(() => {
    const list = fields ?? [];
    if (!search) return list;
    return list.filter((field) => field.name.toLowerCase().includes(search.toLowerCase()));
  }, [fields, search]);

  const summary = value.length === 0 ? "无需必填" : `${value.length} 个字段`;

  const handleToggle = (fieldId: string) => {
    if (value.includes(fieldId)) {
      onChange(value.filter((id) => id !== fieldId));
      return;
    }
    onChange([...value, fieldId]);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent-primary/50 hover:bg-surface-2",
          isOpen && "border-accent-primary/50"
        )}
      >
        <Tag className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
        <span className="flex-1 truncate text-left text-primary">{summary}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 flex-shrink-0 text-secondary transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[260px] rounded-md border border-subtle bg-surface-1 shadow-lg">
          <div className="border-b border-subtle p-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索字段"
              className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/50"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {isLoading ? (
              <p className="px-2 py-2 text-xs text-tertiary">加载中...</p>
            ) : filteredFields.length === 0 && search ? (
              <p className="px-2 py-2 text-xs text-tertiary">无匹配字段</p>
            ) : filteredFields.length === 0 ? (
              <p className="px-2 py-2 text-xs text-tertiary">该工作项类型暂无可选字段</p>
            ) : (
              filteredFields.map((field) => {
                const isSelected = value.includes(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => handleToggle(field.id)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1"
                  >
                    <div
                      className={cn(
                        "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                        isSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                      )}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <span className="truncate text-primary">{field.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
