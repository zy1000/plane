/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueFieldLibraryItem } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueFieldLibrary } from "@/hooks/store/use-issue-field-library";
import type { TIssueType, TTypeExtraField } from "@/services/project/project-issue-type.service";
// local imports
import {
  FIELD_KIND_FILTERS,
  FieldKindIcon,
  getFieldKindLabel,
  getFieldOptionsSummary,
  IssueTypeTag,
  RequiredMark,
} from "./field-display";

type TKindFilter = "all" | TIssueFieldLibraryItem["field_type"];

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  /** 标题旁的类型标签 */
  issueType?: Pick<TIssueType, "name" | "logo_props">;
  /** 当前类型已有的字段：已绑定的库字段、同名私有字段都不能再选 */
  typeFields: TTypeExtraField[];
  onClose: () => void;
  /** 失败时抛出，弹窗保持打开 */
  onSubmit: (libraryFieldIds: string[]) => Promise<unknown>;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: unknown; detail?: unknown };
    if (typeof payload.error === "string") return payload.error;
    if (typeof payload.detail === "string") return payload.detail;
  }
  return fallback;
};

/** 「从字段库添加」：勾选工作区通用字段批量绑定到当前类型 */
export function LibraryFieldPickerModal({ isOpen, workspaceSlug, issueType, typeFields, onClose, onSubmit }: Props) {
  const { fields, isLoading, hasLoaded, error } = useIssueFieldLibrary(isOpen ? workspaceSlug : undefined);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<TKindFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 打开时聚焦搜索框：不指定时 Headless UI 会聚焦右上角的关闭按钮
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    setKind("all");
    setSelectedIds([]);
  }, [isOpen]);

  /** 已绑定的库字段，或与本类型私有字段同名的库字段 */
  const isAdded = useMemo(() => {
    const boundIds = new Set(typeFields.map((field) => field.library_field_id).filter(Boolean));
    const privateNames = new Set(
      typeFields.filter((field) => !field.library_field_id).map((field) => field.name.trim())
    );
    return (field: TIssueFieldLibraryItem) => boundIds.has(field.id) || privateNames.has(field.name.trim());
  }, [typeFields]);

  const kindFilters = useMemo(
    () => FIELD_KIND_FILTERS.filter((filter) => fields.some((field) => field.field_type === filter.value)),
    [fields]
  );

  const visibleFields = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return fields.filter(
      (field) =>
        (kind === "all" || field.field_type === kind) && (!keyword || field.name.toLowerCase().includes(keyword))
    );
  }, [fields, kind, search]);

  const toggle = (fieldId: string) =>
    setSelectedIds((current) =>
      current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId]
    );

  const handleSubmit = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      // 按库里的顺序绑定，新行在类型里的先后与字段库一致
      const orderedIds = fields.filter((field) => selectedIds.includes(field.id)).map((field) => field.id);
      await onSubmit(orderedIds);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已添加 ${orderedIds.length} 个字段` });
      onClose();
    } catch (submitError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "添加失败",
        message: getErrorMessage(submitError, "无法添加字段，请稍后重试。"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderList = () => {
    if (isLoading || !hasLoaded) {
      return (
        <Loader className="space-y-2 px-6 py-4">
          <Loader.Item height="48px" />
          <Loader.Item height="48px" />
          <Loader.Item height="48px" />
        </Loader>
      );
    }
    if (error) return <div className="px-6 py-12 text-center text-13 text-danger-primary">{error}</div>;
    if (visibleFields.length === 0) {
      return (
        <div className="px-6 py-12 text-center text-13 text-tertiary">
          {fields.length === 0 ? "字段库还没有字段" : "没有匹配的字段"}
        </div>
      );
    }
    return visibleFields.map((field) => {
      const added = isAdded(field);
      const checked = !added && selectedIds.includes(field.id);
      const summary = getFieldOptionsSummary(field);
      return (
        <button
          key={field.id}
          type="button"
          disabled={added}
          onClick={() => toggle(field.id)}
          className={cn(
            "flex min-h-16 w-full items-center gap-3.5 border-t border-subtle px-5 py-2.5 text-left first:border-t-0",
            added ? "cursor-default opacity-55" : checked ? "bg-accent-subtle" : "hover:bg-layer-1-hover"
          )}
        >
          <span
            className={cn(
              "grid size-[18px] shrink-0 place-items-center rounded-[5px]",
              added ? "bg-layer-3" : checked ? "bg-accent-primary" : "border-[1.5px] border-strong bg-surface-1"
            )}
          >
            {checked && <Check className="size-3 text-on-color" strokeWidth={3.2} />}
          </span>
          <FieldKindIcon field={field} />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-14 font-medium text-primary">{field.name}</span>
              {field.is_required && <RequiredMark />}
            </span>
            {summary && <span className="truncate text-12 text-tertiary">{summary}</span>}
          </span>
          <span className="w-[72px] shrink-0 text-13 text-secondary">{getFieldKindLabel(field)}</span>
          <span className="w-[92px] shrink-0 text-right text-13 text-tertiary">
            {added ? "已添加" : field.used_by.length > 0 ? `用于 ${field.used_by.length} 个类型` : "未使用"}
          </span>
        </button>
      );
    });
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
      initialFocus={searchInputRef}
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2.5 px-6 pt-5">
          <h2 className="text-20 font-semibold text-primary">从字段库添加</h2>
          {issueType && <IssueTypeTag name={issueType.name} icon={issueType.logo_props?.icon} className="font-medium" />}
          <button
            type="button"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-6 pt-4 pb-3.5">
          <label className="flex h-10 items-center gap-2.5 rounded-lg border border-subtle px-3 text-placeholder focus-within:border-accent-strong">
            <Search className="size-4 shrink-0" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索字段"
              className="w-full bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
            />
          </label>
          {kindFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {[{ value: "all" as const, label: `全部 ${fields.length}` }, ...kindFilters].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setKind(filter.value)}
                  className={cn(
                    "h-[30px] rounded-full border px-3 text-13",
                    kind === filter.value
                      ? "border-accent-strong bg-accent-subtle font-medium text-accent-primary"
                      : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1-hover"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-[470px] overflow-y-auto border-t border-subtle">{renderList()}</div>

        <div className="flex items-center gap-2.5 border-t border-subtle px-6 py-4">
          <span className="mr-auto text-14 text-secondary">
            已选 <b className="font-semibold text-primary">{selectedIds.length}</b> 个
          </span>
          <Button variant="secondary" size="xl" className="px-3" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="xl"
            className="px-3"
            onClick={() => void handleSubmit()}
            loading={isSubmitting}
            disabled={selectedIds.length === 0}
          >
            {selectedIds.length > 0 ? `添加 ${selectedIds.length} 个字段` : "添加字段"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
