/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { IWorkspaceGroup } from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { XIcon } from "lucide-react";

type Props = {
  isOpen: boolean;
  group?: IWorkspaceGroup | null;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => Promise<void>;
};

export function GroupFormModal({ isOpen, group, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const isEditMode = Boolean(group);

  useEffect(() => {
    if (isOpen) {
      setName(group?.name ?? "");
      setDescription(group?.description ?? "");
      setNameError(null);
      setFormError(null);
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [isOpen, group]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(t("common.errors.required"));
      setFormError(null);
      return;
    }
    setIsSubmitting(true);
    setNameError(null);
    setFormError(null);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() });
      onClose();
    } catch (err: unknown) {
      const errObj = err as Record<string, string | string[]>;
      if (errObj?.name) {
        const nameMsg = Array.isArray(errObj.name) ? errObj.name[0] : errObj.name;
        setNameError(String(nameMsg));
        setFormError(null);
      } else {
        const msg = errObj?.detail ? String(errObj.detail) : t("common.errors.default.message");
        setFormError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 不传 handleClose：点击遮罩 / Escape 不关闭；通过右上角关闭、取消或提交成功调用 onClose
  return (
    <ModalCore
      isOpen={isOpen}
      position={EModalPosition.TOP}
      width={EModalWidth.XL}
      className="flex min-h-[24rem] flex-col"
    >
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-0">
          <h3 className="min-w-0 flex-1 pt-0.5 text-body-lg-medium text-primary">
            {isEditMode ? "编辑团队" : "新建团队"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200",
              "hover:bg-layer-1-hover hover:text-secondary",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-strong",
              isSubmitting && "pointer-events-none opacity-50"
            )}
            aria-label="关闭"
          >
            <XIcon className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 px-6 pb-6 pt-4">
          <div className="flex flex-col gap-1">
            <label className="text-body-sm-medium text-secondary" htmlFor="group-name">
              组名
              <span className="ml-0.5 text-danger-primary">*</span>
            </label>
            <Input
              ref={nameRef}
              id="group-name"
              name="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              hasError={Boolean(nameError)}
              placeholder="请输入团队名称"
              className="w-full text-body-sm-regular"
              maxLength={100}
            />
            {nameError ? <span className="text-caption-sm-regular text-danger-primary">{nameError}</span> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm-medium text-secondary" htmlFor="group-description">
              描述
            </label>
            <textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选：描述这个团队的用途"
              rows={6}
              className="min-h-[9.5rem] w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-body-sm-regular text-primary outline-none focus:border-primary placeholder:text-placeholder"
              maxLength={500}
            />
          </div>

          {formError ? <p className="text-caption-sm-regular text-danger-primary">{formError}</p> : null}

          <div className="mt-auto flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" size="base" type="button" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button variant="primary" size="base" type="submit" loading={isSubmitting}>
              {isEditMode ? "保存" : "创建"}
            </Button>
          </div>
        </form>
      </div>
    </ModalCore>
  );
}
