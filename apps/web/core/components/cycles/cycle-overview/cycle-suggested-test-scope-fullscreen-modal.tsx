/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { CloseOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import { ClipboardList, Pencil } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { TextArea } from "@plane/ui";
import { useCycle } from "@/hooks/store/use-cycle";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  value: string | null | undefined;
  canEdit: boolean;
  initialEditing?: boolean;
};

export const CycleSuggestedTestScopeFullscreenModal: FC<Props> = observer(function CycleSuggestedTestScopeFullscreenModal(
  props: Props
) {
  const { isOpen, onClose, workspaceSlug, projectId, cycleId, value, canEdit, initialEditing = false } = props;
  const { updateCycleDetails } = useCycle();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEditing(initialEditing);
      setDraft(value ?? "");
    }
  }, [isOpen, initialEditing, value]);

  const handleClose = useCallback(() => {
    setEditing(false);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateCycleDetails(workspaceSlug, projectId, cycleId, { suggested_test_scope: draft });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "保存成功" });
      setEditing(false);
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "保存失败", message: "保存建议测试范围失败，请稍后重试。" });
    } finally {
      setSaving(false);
    }
  }, [workspaceSlug, projectId, cycleId, draft, updateCycleDetails, handleClose]);

  return (
    <Modal
      title={
        <div className="flex min-h-11 items-center gap-2 pr-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-placeholder" />
          <span className="text-base font-medium text-primary">建议测试范围</span>
          <span className="text-sm font-normal text-placeholder">迭代建议测试范围说明</span>
        </div>
      }
      open={isOpen}
      onCancel={handleClose}
      closable
      closeIcon={
        <span className="inline-flex items-center gap-2 text-sm font-normal text-primary transition-colors">
          <CloseOutlined className="text-base text-inherit" />
          <span>退出全屏</span>
        </span>
      }
      footer={
        editing && canEdit ? (
          <div className="flex items-center justify-end gap-2 px-1 py-1">
            <Button variant="secondary" onClick={handleClose}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
          </div>
        ) : null
      }
      centered={false}
      width="100%"
      style={{ top: 0, padding: 0, margin: 0, maxWidth: "100vw" }}
      className="[&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:inline-flex [&_.ant-modal-close]:!h-auto [&_.ant-modal-close]:!w-auto [&_.ant-modal-close]:items-center [&_.ant-modal-close]:justify-center [&_.ant-modal-close]:rounded-md [&_.ant-modal-close]:px-2 [&_.ant-modal-close]:py-1.5 [&_.ant-modal-close]:transition-colors [&_.ant-modal-close]:hover:!bg-surface-2 [&_.ant-modal-close]:hover:!text-primary [&_.ant-modal-close]:group [&_.ant-modal-close-x]:!h-auto [&_.ant-modal-close-x]:!w-auto"
      classNames={{
        wrapper: "!p-0",
        header: "!mb-0 border-b border-subtle",
        ...(editing && canEdit ? { footer: "!mt-0 border-t border-subtle bg-surface-1" } : {}),
      }}
      styles={{
        content: {
          height: "100vh",
          maxHeight: "100vh",
          borderRadius: 0,
          boxShadow: "none",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          margin: 0,
        },
        header: {
          flexShrink: 0,
          margin: 0,
          borderRadius: 0,
          padding: "16px 20px",
          minHeight: 64,
          display: "flex",
          alignItems: "center",
        },
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        },
        ...(editing && canEdit ? { footer: { flexShrink: 0, margin: 0, padding: "12px 20px" } } : {}),
      }}
      destroyOnClose
      getContainer={() => document.body}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-1">
        {!editing && canEdit && (
          <div className="flex flex-shrink-0 items-center justify-end px-4 pt-2">
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3 w-3" />
              编辑
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm px-4 pb-3">
          {editing && canEdit ? (
            <TextArea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="填写建议测试范围..."
              className="min-h-[min(60vh,480px)] w-full resize-y rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary"
              rows={16}
            />
          ) : (
            <>
              {draft ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-secondary">{draft}</p>
              ) : (
                <div className="grid h-32 place-items-center text-sm text-placeholder">暂无建议测试范围</div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
});
