import { useEffect, useState } from "react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { ProjectAnnouncementService } from "@/services/project";

const announcementService = new ProjectAnnouncementService();

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
  const [createForm, setCreateForm] = useState({ name: "", description: "" });
  const [isCreating, setIsCreating] = useState(false);

  const handleClose = () => {
    setCreateForm({ name: "", description: "" });
    onClose();
  };

  const handleCreateAnnouncement = async () => {
    if (!workspaceSlug || !projectId) return;
    if (!createForm.name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "提交失败",
        message: "请填写公告标题。",
      });
      return;
    }
    setIsCreating(true);
    try {
      await announcementService.createAnnouncement(workspaceSlug, projectId, {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
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
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "提交失败",
          message: "新增公告失败，请稍后重试。",
        });
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIXL}
      className="h-[80vh] max-h-[80vh]"
    >
      <div className="p-5 h-full flex flex-col gap-5">
        <div className="text-base font-medium">新增公告</div>
        <div className="space-y-2">
          <div className="text-sm text-primary">标题</div>
          <Input
            value={createForm.name}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="请输入公告标题"
            className="w-full"
          />
        </div>
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <TextArea
            value={createForm.description}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="请输入公告描述"
            rows={5}
            className="flex-1 min-h-0 overflow-y-auto vertical-scrollbar scrollbar-sm"
          />
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
  announcement: TProjectAnnouncement | null;
};

export const AnnouncementDetailModal = ({
  isOpen,
  onClose,
  announcement,
}: AnnouncementDetailModalProps) => {
  const [localAnnouncement, setLocalAnnouncement] = useState<TProjectAnnouncement | null>(null);

  useEffect(() => {
    if (announcement) {
      setLocalAnnouncement(announcement);
    }
  }, [announcement]);

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIXL}
      className="h-[80vh] max-h-[80vh]"
    >
      <div className="p-5 h-full flex flex-col gap-5">
        <div className="text-base font-medium">公告详情</div>
        <div className="space-y-2">
          <div className="text-sm text-primary">
            <span className="text-xl font-semibold text-primary break-all pl-3">{localAnnouncement?.name || "-"}</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <TextArea
            value={localAnnouncement?.description?.trim() || ""}
            readOnly
            rows={5}
            className="flex-1 min-h-0 overflow-y-auto vertical-scrollbar scrollbar-sm border-none bg-transparent shadow-none ring-0"
          />
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
