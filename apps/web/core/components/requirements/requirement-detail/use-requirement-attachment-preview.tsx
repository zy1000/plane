/**
 * 需求级附件的预览：xmind 走思维导图弹窗，Office / PDF 走 OnlyOffice 只读预览，图片直接放大。
 *
 * 照 issues/attachment/use-issue-attachment-preview.tsx 改的。差别只有取址：需求附件挂在
 * 产品 / 标准库上没有 project_id，所以下载地址走工作区级资产端点（getEditorAssetDownloadSrc），
 * OnlyOffice 走工作区级只读预览端点（OnlyOfficePreviewModal 不传 projectId）。
 */
import { useCallback, useState, type ReactNode } from "react";
import { Modal, Typography } from "antd";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementAssetRef } from "@plane/types";
import { getEditorAssetDownloadSrc, getEditorAssetSrc } from "@plane/utils";
import { XmindPreviewModal } from "@/components/filestore/xmind-preview-modal";
import { OnlyOfficePreviewModal } from "@/components/onlyoffice/onlyoffice-preview-modal";
import { isImageSupported, isOnlyOfficeSupported, isXmindSupported } from "@/utils/onlyoffice";

export const useRequirementAttachmentPreview = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const { t } = useTranslation();
  const [officeAsset, setOfficeAsset] = useState<TRequirementAssetRef | null>(null);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [xmindAsset, setXmindAsset] = useState<TRequirementAssetRef | null>(null);
  const [imageAsset, setImageAsset] = useState<TRequirementAssetRef | null>(null);

  const requestPreview = useCallback(
    (asset: TRequirementAssetRef) => {
      if (isXmindSupported(asset.name)) {
        setXmindAsset(asset);
        return;
      }
      if (isOnlyOfficeSupported(asset.name)) {
        setOfficeAsset(asset);
        setOfficeOpen(true);
        return;
      }
      if (isImageSupported(asset.name)) {
        setImageAsset(asset);
        return;
      }
      setToast({
        type: TOAST_TYPE.INFO,
        title: t("requirement_detail.attachments.preview_unsupported"),
      });
    },
    [t]
  );

  const previewModals: ReactNode = (
    <>
      {officeAsset && (
        <OnlyOfficePreviewModal
          open={officeOpen}
          onClose={() => setOfficeOpen(false)}
          afterOpenChange={(visible) => {
            if (!visible) setOfficeAsset(null);
          }}
          workspaceSlug={workspaceSlug}
          assetId={officeAsset.asset_id}
          fileName={officeAsset.name}
        />
      )}
      <XmindPreviewModal
        open={Boolean(xmindAsset)}
        asset={xmindAsset ? { id: xmindAsset.asset_id, name: xmindAsset.name } : null}
        workspaceSlug={workspaceSlug}
        onClose={() => setXmindAsset(null)}
        getFileURL={
          xmindAsset
            ? () => Promise.resolve(getEditorAssetDownloadSrc({ assetId: xmindAsset.asset_id, workspaceSlug }) ?? "")
            : undefined
        }
        hideOpenInNewTab
      />
      <Modal
        open={Boolean(imageAsset)}
        onCancel={() => setImageAsset(null)}
        footer={null}
        modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
        width="100vw"
        style={{ top: 0, paddingBottom: 0 }}
        styles={{ body: { padding: 0 } }}
        destroyOnHidden
        title={
          <Typography.Text strong style={{ marginTop: -16, marginBottom: -16 }}>
            {`${t("requirement_detail.attachments.preview")}：${imageAsset?.name ?? ""}`}
          </Typography.Text>
        }
      >
        <div
          className="flex items-center justify-center overflow-auto bg-surface-2 p-4"
          style={{ height: "calc(100vh - 56px)" }}
        >
          {imageAsset && (
            <img
              src={getEditorAssetSrc({ assetId: imageAsset.asset_id, workspaceSlug })}
              alt={imageAsset.name}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
      </Modal>
    </>
  );

  return { requestPreview, previewModals };
};
