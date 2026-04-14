"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
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
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-placeholder" />
          <span>项目背景</span>
        </div>
      }
      open={isOpen}
      onCancel={handleClose}
      footer={
        editing ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={handleClose}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              保存
            </Button>
          </div>
        ) : null
      }
      width={960}
      styles={{ body: { height: 640, padding: 0 } }}
      destroyOnClose
    >
      <div className="flex h-full flex-col">
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
