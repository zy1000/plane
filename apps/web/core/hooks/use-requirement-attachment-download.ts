import { useCallback } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { FileService } from "@/services/file.service";
import type { TRequirementAttachment } from "@/services/requirement.service";

const fileService = new FileService();

export function useRequirementAttachmentDownload(workspaceSlug?: string, productId?: string) {
  const download = useCallback(
    (attachment: TRequirementAttachment) => {
      if (!workspaceSlug || !productId || !attachment.id) {
        setToast({ type: TOAST_TYPE.ERROR, title: "下载失败", message: "附件下载信息不完整，请刷新后重试。" });
        return;
      }
      const downloadUrl = fileService.getProductAssetDownloadUrl(workspaceSlug, productId, attachment.id);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    },
    [productId, workspaceSlug]
  );

  return { download };
}
