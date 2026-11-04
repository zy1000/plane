/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectPermissionGroup } from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { MODAL_FIELD_CLASS, ModalFieldError, ModalFieldLabel } from "@/components/common/form-modal";
import { errorMessage } from "./shared";

type Props = {
  isOpen: boolean;
  /** 给了就是编辑（改名称 / 描述），没给是新建 */
  group?: TProjectPermissionGroup | null;
  /** 新建时「复制自」的候选 */
  copySources: TProjectPermissionGroup[];
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; copy_from?: string | null }) => Promise<unknown>;
};

/** 新建 / 编辑项目权限组（名称必填；新建可选「复制自」某个组的权限起步） */
export function ProjectPermissionGroupFormModal({ isOpen, group, copySources, onClose, onSubmit }: Props) {
  const isEdit = Boolean(group);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(group?.name ?? "");
    setDescription(group?.description ?? "");
    setCopyFrom(null);
    setNameError(undefined);
  }, [group, isOpen]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("请填写名称");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({ name: trimmed, description: description.trim(), ...(isEdit ? {} : { copy_from: copyFrom }) });
      setToast({ type: TOAST_TYPE.SUCCESS, title: isEdit ? "已保存" : "已新建权限组" });
      onClose();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: isEdit ? "保存失败" : "新建失败", message: errorMessage(error, "请稍后重试") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyLabel = copySources.find((source) => source.id === copyFrom)?.name;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="border-b border-subtle px-6 py-4">
          <h3 className="text-18 font-semibold text-primary">{isEdit ? "编辑权限组" : "新建权限组"}</h3>
        </div>
        <div className="flex flex-col gap-5 px-6 py-5">
          <div>
            <ModalFieldLabel htmlFor="permission-group-name" required>
              名称
            </ModalFieldLabel>
            <input
              id="permission-group-name"
              autoFocus
              value={name}
              maxLength={255}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(undefined);
              }}
              placeholder="请输入名称"
              className={cn(MODAL_FIELD_CLASS, nameError ? "border-danger-strong" : "border-subtle", "bg-surface-1 outline-none focus:border-accent-strong")}
            />
            <ModalFieldError message={nameError} />
          </div>
          <div>
            <ModalFieldLabel htmlFor="permission-group-description">描述</ModalFieldLabel>
            <textarea
              id="permission-group-description"
              value={description}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="请输入描述"
              className="w-full resize-none rounded-[10px] border border-subtle bg-surface-1 px-3.5 py-2.5 text-14 outline-none focus:border-accent-strong"
            />
          </div>
          {!isEdit && (
            <div>
              <ModalFieldLabel>复制权限自</ModalFieldLabel>
              <CustomSelect
                value={copyFrom}
                onChange={(value: string | null) => setCopyFrom(value)}
                label={<span className={copyLabel ? "text-primary" : "text-placeholder"}>{copyLabel ?? "不复制"}</span>}
                buttonClassName={cn(MODAL_FIELD_CLASS, "flex items-center justify-between border-subtle")}
                // 浮层 portal 到 body，w-full 会撑满整屏；按字段宽度（弹窗 576 - 两侧 24）给定宽
                optionsClassName="w-[528px] max-w-[calc(100vw-5rem)]"
                input
              >
                <CustomSelect.Option value={null}>不复制</CustomSelect.Option>
                {copySources.map((source) => (
                  <CustomSelect.Option key={source.id} value={source.id}>
                    {source.name}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-6 py-4">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {isEdit ? "保存" : "新建"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
