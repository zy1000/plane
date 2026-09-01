/**
 * 需求级附件的上传状态。从附件区里抽出来，因为上传入口不止一处：关联操作条上的
 * 「上传附件」按钮与附件列表的拖放区各开一个 dropzone，但「有哪些在飞」必须是同一份 ——
 * 列表为空时正是靠它把附件区（进度条）拉出来。
 *
 * 进度本身在 editor asset store 里，这里只记 blockId；按 blockId 读进度的是 observer 的附件区。
 */
import { useCallback, useState } from "react";
import type { FileRejection } from "react-dropzone";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementAssetRef } from "@plane/types";
import { useRequirementAssetUpload } from "@/components/requirements/use-requirement-asset-upload";
import { useFileSize } from "@/plane-web/hooks/use-file-size";

export type TRequirementAttachmentUploads = {
  /** 上传中的 blockId */
  uploadingIds: string[];
  maxFileSize: number;
  /** 直接接 useDropzone 的 onDrop：超限的先报错，其余逐个上传 */
  onDrop: (acceptedFiles: File[], rejectedFiles: FileRejection[]) => void;
};

export const useRequirementAttachmentUploads = ({
  workspaceSlug,
  entityId,
  onChange,
}: {
  workspaceSlug: string;
  /** 资产的归属方：产品或标准库的 id */
  entityId: string;
  /** 整组替换；给更新函数而不是新数组，排队与冲突重放都按最新的行算 */
  onChange: (updater: (current: TRequirementAssetRef[]) => TRequirementAssetRef[]) => void;
}): TRequirementAttachmentUploads => {
  const { t } = useTranslation();
  const { maxFileSize } = useFileSize();
  const uploadAsset = useRequirementAssetUpload({ workspaceSlug, entityId });
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);

  const uploadFile = useCallback(
    async (file: File) => {
      const blockId = uuidv4();
      setUploadingIds((current) => [...current, blockId]);
      try {
        const ref = await uploadAsset(file, false, blockId);
        onChange((current) => [...current, ref]);
      } catch (error) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("requirement_detail.attachments.toast_upload_failed"),
          message: (error as { error?: string } | null)?.error ?? file.name,
        });
      } finally {
        setUploadingIds((current) => current.filter((id) => id !== blockId));
      }
    },
    [onChange, t, uploadAsset]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: t("attachment.file_size_limit", { size: maxFileSize / 1024 / 1024 }),
        });
      }
      acceptedFiles.forEach((file) => void uploadFile(file));
    },
    [maxFileSize, t, uploadFile]
  );

  return { uploadingIds, maxFileSize, onDrop };
};
