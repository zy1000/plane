import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { ProjectAnnouncementService } from "@/services/project";
import { WorkspaceService } from "@/services/workspace.service";

const announcementService = new ProjectAnnouncementService();
const workspaceService = new WorkspaceService();

export type TProjectAnnouncement = {
  id: string;
  name: string;
  description?: string | null;
  project: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | { id?: string; display_name?: string; email?: string } | null;
  updated_by?: string | { id?: string; display_name?: string; email?: string } | null;
};

type CreateAnnouncementModalProps = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  onSuccess: () => void;
};

export const CreateAnnouncementModal = ({
  isOpen,
  onClose,
  workspaceSlug,
  projectId,
  onSuccess,
}: CreateAnnouncementModalProps) => {
  const { t } = useTranslation();
  const editorRef = useRef<EditorRefApi | null>(null);
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString() ?? "";

  const handleClose = () => {
    setName("");
    onClose();
  };

  const handleCreateAnnouncement = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    if (!name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "提交失败", message: "请填写公告标题。" });
      return;
    }
    const descriptionHtml = editorRef.current?.getDocument().html ?? "";
    setIsCreating(true);
    try {
      await announcementService.createAnnouncement(workspaceSlug, projectId, {
        name: name.trim(),
        description: descriptionHtml,
        project: projectId,
      });
      handleClose();
      onSuccess();
    } catch (error) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: "提交失败", message: "新增公告失败，请稍后重试。" });
      }
    } finally {
      setIsCreating(false);
    }
  }, [workspaceSlug, projectId, name, onSuccess, t]);

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIIXL}
      className="h-[88vh] max-h-[88vh]"
    >
      <div className="flex h-full flex-col gap-5 p-5">
        <div className="text-base font-medium">新增公告</div>
        <div className="space-y-2">
          <div className="text-sm text-primary">标题</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入公告标题"
            className="w-full"
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="text-sm text-primary">描述</div>
          {workspaceId && (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-subtle-1 vertical-scrollbar scrollbar-sm">
              <RichTextEditor
                ref={editorRef}
                editable
                id={`create-announcement-${projectId}`}
                initialValue="<p></p>"
                value={null}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                projectId={projectId}
                dragDropEnabled
                onChange={() => {}}
                placeholder={(isFocused, value) =>
                  isFocused ? "添加公告描述..." : value ? "" : "点击添加公告描述"
                }
                searchMentionCallback={async (payload) =>
                  await workspaceService.searchEntity(workspaceSlug, {
                    ...payload,
                    project_id: projectId,
                  })
                }
                containerClassName="h-full pl-10"
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
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            取消
          </Button>
          <Button variant="primary" loading={isCreating} onClick={handleCreateAnnouncement}>
            保存
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};

type AnnouncementDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  announcement: TProjectAnnouncement | null;
};

export const AnnouncementDetailModal = ({
  isOpen,
  onClose,
  workspaceSlug,
  projectId,
  announcement,
}: AnnouncementDetailModalProps) => {
  const [localAnnouncement, setLocalAnnouncement] = useState<TProjectAnnouncement | null>(null);
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString() ?? "";

  useEffect(() => {
    if (announcement) {
      setLocalAnnouncement(announcement);
    }
  }, [announcement]);

  const descriptionHtml = localAnnouncement?.description?.trim() || "<p></p>";

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIIXL}
      className="h-[88vh] max-h-[88vh]"
    >
      <div className="flex h-full flex-col gap-5 p-5">
        <div className="flex flex-shrink-0 items-center justify-between gap-3">
          <div className="text-base font-medium">公告详情</div>
          <button
            type="button"
            className="rounded-md p-1.5 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-4 shrink-0" />
          </button>
        </div>
        <div className="space-y-2">
          <span className="break-all pl-3 text-xl font-semibold text-primary">
            {localAnnouncement?.name || "-"}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {workspaceId && (
            <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
              <RichTextEditor
                editable={false}
                id={`detail-announcement-${localAnnouncement?.id ?? "empty"}`}
                initialValue={descriptionHtml}
                value={null}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                projectId={projectId}
                dragDropEnabled={false}
                onChange={() => {}}
                containerClassName="h-full"
                uploadFile={async () => ""}
                duplicateFile={async () => ""}
              />
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
