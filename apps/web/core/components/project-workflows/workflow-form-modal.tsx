/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState, useEffect } from "react";
import { Button, Input } from "@plane/ui";
import type { TWorkflow } from "@/services/project/project-workflow.service";

type TWorkflowFormModalProps = {
  isOpen: boolean;
  workflow?: TWorkflow;
  issueTypeId: string;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; issue_type_id: string }) => Promise<void>;
  isSubmitDisabled?: boolean;
};

export const WorkflowFormModal: FC<TWorkflowFormModalProps> = ({
  isOpen,
  workflow,
  issueTypeId,
  onClose,
  onSubmit,
  isSubmitDisabled = false,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const isEditing = Boolean(workflow);

  useEffect(() => {
    if (isOpen) {
      setName(workflow?.name ?? "");
      setDescription(workflow?.description ?? "");
      setErrors({});
    }
  }, [isOpen, workflow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrors({ name: "工作流名称不能为空" });
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({ name: trimmedName, description: description.trim(), issue_type_id: issueTypeId });
      onClose();
    } catch {
      // parent handles error
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-subtle bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-subtle px-6 py-4">
          <h3 className="text-base font-semibold text-primary">{isEditing ? "编辑工作流" : "新建工作流"}</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-secondary">
              名称 <span className="text-danger-primary">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({});
              }}
              placeholder="输入工作流名称"
              className="w-full"
              autoFocus
            />
            {errors.name && <p className="text-xs text-danger-primary">{errors.name}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-secondary">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入工作流描述"
              rows={3}
              className="w-full resize-none rounded-md border border-subtle bg-transparent px-3 py-2 text-sm text-primary placeholder:text-placeholder focus:border-accent-primary focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="neutral-primary" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={isSubmitting} disabled={isSubmitDisabled}>
              {isEditing ? "保存" : "创建"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
