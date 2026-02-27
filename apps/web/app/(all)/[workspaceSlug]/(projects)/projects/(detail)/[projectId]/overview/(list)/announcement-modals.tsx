import { useEffect, useState } from "react";
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
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "提交失败",
        message: "新增公告失败，请稍后重试。",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
    >
      <div className="p-5 space-y-5">
        <div className="text-lg font-medium">新增公告</div>
        <div className="space-y-2">
          <div className="text-sm text-custom-text-200">标题</div>
          <Input
            value={createForm.name}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="请输入公告标题"
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm text-custom-text-200">描述</div>
          <TextArea
            value={createForm.description}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="请输入公告描述"
            rows={5}
            className="min-h-[320px] max-h-[320px] overflow-y-auto vertical-scrollbar scrollbar-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" loading={isCreating} onClick={handleCreateAnnouncement}>
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
      width={EModalWidth.XXXL}
    >
      <div className="p-5 space-y-5">
        <div className="text-lg font-medium">公告详情</div>
        <div className="space-y-2">
          <div className="text-sm text-custom-text-200">标题</div>
          <div className="text-sm text-custom-text-100 break-all">{localAnnouncement?.name || "-"}</div>
        </div>
        <div className="space-y-2">
          <div className="text-sm text-custom-text-200">描述</div>
          <TextArea
            value={localAnnouncement?.description?.trim() || ""}
            readOnly
            rows={5}
            className="min-h-[120px] max-h-[320px] overflow-y-auto vertical-scrollbar scrollbar-sm"
          />
        </div>
        <div className="flex justify-end">
          <Button variant="neutral-primary" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
