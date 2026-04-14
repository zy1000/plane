"use client";

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Modal } from "antd";
import { BookOpen } from "lucide-react";
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
};

export const OverviewDescriptionModal: React.FC<Props> = observer((props) => {
  const { isOpen, onClose, workspaceSlug, projectId, initialValue } = props;
  const editorRef = useRef<EditorRefApi | null>(null);
  const [saving, setSaving] = useState(false);

  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { getWorkspaceBySlug } = useWorkspace();
  const { updateProject } = useProject();

  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString() ?? "";

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

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-placeholder" />
          <span>项目背景</span>
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            保存
          </Button>
        </div>
      }
      width={960}
      styles={{ body: { height: 640, padding: 0 } }}
      destroyOnClose
    >
      {workspaceId && (
        <div className="h-full overflow-y-auto vertical-scrollbar scrollbar-sm p-2">
          <RichTextEditor
            ref={editorRef}
            editable
            id={projectId}
            initialValue={initialValue ?? "<p></p>"}
            value={null}
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            dragDropEnabled
            onChange={() => {}}
            placeholder={(isFocused, value) => (isFocused ? "添加项目背景..." : value ? "" : "点击添加项目背景")}
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
    </Modal>
  );
});
