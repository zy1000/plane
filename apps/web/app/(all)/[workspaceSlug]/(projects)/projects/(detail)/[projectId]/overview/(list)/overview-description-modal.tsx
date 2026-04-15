"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { CloseOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import { BookOpen, Pencil } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { EFileAssetType } from "@plane/types";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useProject } from "@/hooks/store/use-project";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  initialValue: string | undefined | null;
  initialEditing?: boolean;
};

export const OverviewDescriptionModal: React.FC<Props> = observer((props) => {
  const { isOpen, onClose, workspaceSlug, projectId, initialValue, initialEditing = false } = props;
  const editorRef = useRef<EditorRefApi | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { getWorkspaceBySlug } = useWorkspace();
  const { updateProject } = useProject();

  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString() ?? "";

  useEffect(() => {
    if (isOpen) setEditing(initialEditing);
  }, [isOpen, initialEditing]);

  const handleSave = useCallback(async () => {
    const html = editorRef.current?.getDocument().html;
    if (html == null) return;
    setSaving(true);
    try {
      await updateProject(workspaceSlug, projectId, { description_html: html });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "保存成功" });
      onClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "保存失败", message: "保存项目背景失败，请稍后重试。" });
    } finally {
      setSaving(false);
    }
  }, [workspaceSlug, projectId, updateProject, onClose]);

  const handleClose = () => {
    setEditing(false);
    onClose();
  };

  return (
    <Modal
      title={
        <div className="flex min-h-11 items-center gap-2 pr-2">
          <BookOpen className="h-4 w-4 shrink-0 text-placeholder" />
          <span className="text-base font-medium text-primary">项目背景</span>
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
        editing ? (
          <div className="flex items-center justify-end gap-2 px-1 py-1">
            <Button variant="secondary" onClick={handleClose}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
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
        ...(editing ? { footer: "!mt-0 border-t border-subtle bg-surface-1" } : {}),
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
        ...(editing ? { footer: { flexShrink: 0, margin: 0, padding: "12px 20px" } } : {}),
      }}
      destroyOnClose
      getContainer={() => document.body}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {!editing && (
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
        {workspaceId && (
          <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm p-2">
            <RichTextEditor
              ref={editorRef}
              editable={editing}
              id={projectId}
              initialValue={initialValue ?? "<p></p>"}
              value={null}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              dragDropEnabled={editing}
              onChange={() => {}}
              placeholder={(isFocused, value) =>
                editing
                  ? isFocused
                    ? "添加项目背景..."
                    : value
                      ? ""
                      : "点击添加项目背景"
                  : value
                    ? ""
                    : "暂无项目背景"
              }
              searchMentionCallback={async (payload) =>
                await workspaceService.searchEntity(workspaceSlug, {
                  ...payload,
                  project_id: projectId,
                })
              }
              containerClassName="h-full"
              uploadFile={async (blockId, file) => {
                const { asset_id } = await uploadEditorAsset({
                  blockId,
                  data: { entity_identifier: projectId, entity_type: EFileAssetType.PROJECT_DESCRIPTION },
                  file,
                  projectId,
                  workspaceSlug,
                });
                return asset_id;
              }}
              duplicateFile={async (assetId) => {
                const { asset_id } = await duplicateEditorAsset({
                  assetId,
                  entityId: projectId,
                  entityType: EFileAssetType.PROJECT_DESCRIPTION,
                  projectId,
                  workspaceSlug,
                });
                return asset_id;
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
});
