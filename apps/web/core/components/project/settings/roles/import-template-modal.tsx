/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { FolderKanban, XIcon } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import type { IWorkspaceRole } from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  templates: IWorkspaceRole[];
  isTemplatesLoading: boolean;
  onImport: (workspaceRoleId: string) => Promise<void>;
};

export function ImportTemplateModal({ isOpen, onClose, templates, isTemplatesLoading, onImport }: Props) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setSelectedId(null);
    onClose();
  };

  const handleImport = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    try {
      await onImport(selectedId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "导入成功", message: "项目角色已从模板创建" });
      handleClose();
    } catch (err: unknown) {
      if (isProjectPermissionError(err)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        const errObj = err as Record<string, string | string[]>;
        const msg = errObj?.error
          ? String(Array.isArray(errObj.error) ? errObj.error[0] : errObj.error)
          : "导入失败，请稍后重试";
        setToast({ type: TOAST_TYPE.ERROR, title: "导入失败", message: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XL} className="flex min-h-[32rem] flex-col">
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-subtle">
          <div className="min-w-0 flex-1">
            <h3 className="text-body-lg-medium text-primary">从工作区模板导入</h3>
            <p className="mt-0.5 text-body-xs-regular text-tertiary">选择一个项目角色模板，导入后会在本项目创建对应角色</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors hover:bg-layer-1-hover hover:text-secondary"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isTemplatesLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-layer-transparent-hover" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-layer-1">
                <FolderKanban className="size-4 text-placeholder" />
              </div>
              <p className="text-body-sm-medium text-secondary">暂无项目角色模板</p>
              <p className="mt-1 text-body-xs-regular text-tertiary">
                请先在工作区设置中创建"项目角色模板"
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {templates.map((template) => {
                const isSelected = selectedId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedId(template.id)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors duration-150",
                      isSelected
                        ? "border-accent-primary/40 bg-accent-primary/6"
                        : "border-subtle hover:border-primary/20 hover:bg-layer-1-hover"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FolderKanban className={cn("size-3.5 shrink-0", isSelected ? "text-accent-primary" : "text-placeholder")} />
                      <p className={cn("text-body-sm-semibold", isSelected ? "text-accent-primary" : "text-primary")}>
                        {template.name}
                      </p>
                    </div>
                    {template.description?.trim() && (
                      <p className="pl-5 text-body-xs-regular text-tertiary line-clamp-1">{template.description}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        {templates.length > 0 && (
          <div className="shrink-0 border-t border-subtle px-6 py-4">
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="base" type="button" onClick={handleClose} disabled={isSubmitting}>
                取消
              </Button>
              <Button
                variant="primary"
                size="base"
                type="button"
                disabled={!selectedId || isSubmitting}
                loading={isSubmitting}
                onClick={() => void handleImport()}
              >
                导入
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalCore>
  );
}
