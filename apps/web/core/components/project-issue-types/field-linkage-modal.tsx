/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import type { TFieldLinkage } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// components
import { IssueFieldPreview } from "@/components/template-management/issue-fields/issue-field-preview";
import type { TIssueType } from "@/services/project/project-issue-type.service";
import { compactLinkage, getLinkageError } from "@/utils/field-linkage";
import type { TLinkageField } from "@/utils/field-linkage";
// local imports
import { IssueTypeTag } from "./field-display";
import { getNormalizedSelectOptions } from "./field-form";
import type { TFieldFormState } from "./field-form";
import { FieldLinkageEditor } from "./field-linkage-editor";

type Props = {
  isOpen: boolean;
  /** 正在编辑的字段表单：字段名、类型、选项取自它，联动规则在弹窗里改草稿 */
  form: TFieldFormState;
  fieldId?: string;
  /** 同一个类型的字段：联动条件的候选来源 */
  fields: TLinkageField[];
  issueType?: Pick<TIssueType, "name" | "logo_props">;
  onClose: () => void;
  /** 写回字段表单，随字段一起保存 */
  onConfirm: (linkage: TFieldLinkage) => void;
};

/**
 * 类型私有字段的联动规则。行内表单的右栏放不下规则表，所以点「配置」在弹窗里改。
 * 私有字段只属于一个类型，「添加条件」里没有工作项类型。
 */
export function FieldLinkageModal({ isOpen, form, fieldId, fields, issueType, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState<TFieldLinkage>(form.linkage);
  const [error, setError] = useState<string | null>(null);
  const fieldName = form.name.trim() || "未命名字段";

  // 每次打开从表单当前的规则开始改；取消不写回
  useEffect(() => {
    if (!isOpen) return;
    setDraft(form.linkage);
    setError(null);
  }, [isOpen]);

  const handleConfirm = () => {
    const linkage = compactLinkage(draft);
    const linkageError = getLinkageError(linkage);
    if (linkageError) {
      setError(linkageError);
      return;
    }
    onConfirm(linkage);
    onClose();
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
      className="overflow-hidden border border-subtle"
    >
      <div className="flex max-h-[min(860px,calc(100dvh-2rem))] min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-6 py-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-18 font-semibold text-primary">联动规则</h2>
            {issueType ? (
              <IssueTypeTag
                name={`${issueType.name} · ${fieldName}`}
                icon={issueType.logo_props?.icon}
                className="min-w-0 shrink font-medium"
              />
            ) : (
              <span className="truncate rounded bg-layer-1 px-2 py-0.5 text-12 font-medium text-secondary">
                {fieldName}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-secondary hover:bg-layer-1-hover"
          >
            <X className="size-[18px]" />
          </button>
        </header>
        <div
          className="min-h-0 flex-1 space-y-6 overflow-y-auto border-t border-subtle px-6 py-7 sm:px-8"
          data-modal-wheel-scroll
        >
          <FieldLinkageEditor
            // 每次打开重新挂载：列顺序等界面状态跟着草稿一起重置
            key={String(isOpen)}
            fieldId={fieldId}
            fieldType={form.field_type}
            fields={fields}
            choices={getNormalizedSelectOptions(form.select_options).map((key) => ({ key, label: key }))}
            value={draft}
            onChange={(linkage) => {
              setDraft(linkage);
              setError(null);
            }}
          />
          <IssueFieldPreview form={{ ...form, linkage: draft }} fields={fields} fieldId={fieldId} />
        </div>
        {error && (
          <p role="alert" className="shrink-0 border-t border-subtle px-6 py-2.5 text-14 text-danger-primary sm:px-8">
            {error}
          </p>
        )}
        <footer className="flex shrink-0 items-center justify-end gap-2.5 border-t border-subtle px-6 py-4 sm:px-8">
          <Button type="button" variant="secondary" size="xl" className="px-3" onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="primary" size="xl" className="px-3" onClick={handleConfirm}>
            确定
          </Button>
        </footer>
      </div>
    </ModalCore>
  );
}
