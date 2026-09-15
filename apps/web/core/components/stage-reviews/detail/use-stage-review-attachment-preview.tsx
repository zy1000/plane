/**
 * 评审附件的预览：xmind 走思维导图弹窗，Office / PDF 走 OnlyOffice 只读预览，图片直接放大。
 *
 * 照 issues/attachment/use-issue-attachment-preview.tsx 改的。差别只有取址：评审附件不进工作项 store，
 * 图片与 xmind 的文件地址由调用方传进来的 getFileURL 换预签名地址。
 */
import { useCallback, useState, type ReactNode } from "react";
import { Modal, Typography } from "antd";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TStageReviewAttachment } from "@plane/types";
import { XmindPreviewModal } from "@/components/filestore/xmind-preview-modal";
import { OnlyOfficePreviewModal } from "@/components/onlyoffice/onlyoffice-preview-modal";
import { isImageSupported, isOnlyOfficeSupported, isXmindSupported } from "@/utils/onlyoffice";

const I18N = "stage_review";

export const useStageReviewAttachmentPreview = ({
  workspaceSlug,
  projectId,
  getFileURL,
}: {
  workspaceSlug: string;
  projectId: string;
  getFileURL: (assetId: string) => Promise<string | undefined>;
}) => {
  const { t } = useTranslation();
  const [officeAsset, setOfficeAsset] = useState<TStageReviewAttachment | null>(null);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [xmindAsset, setXmindAsset] = useState<TStageReviewAttachment | null>(null);
  const [image, setImage] = useState<{ src: string; name: string } | null>(null);

  const requestPreview = useCallback(
    async (asset: TStageReviewAttachment) => {
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
        try {
          const src = await getFileURL(asset.id);
          if (!src) throw new Error();
          setImage({ src, name: asset.name });
        } catch {
          setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.detail.preview_failed`) });
        }
        return;
      }
      setToast({ type: TOAST_TYPE.INFO, title: t(`${I18N}.detail.preview_unsupported`) });
    },
    [getFileURL, t]
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
          projectId={projectId}
          assetId={officeAsset.id}
          fileName={officeAsset.name}
        />
      )}
      <XmindPreviewModal
        open={Boolean(xmindAsset)}
        asset={xmindAsset ? { id: xmindAsset.id, name: xmindAsset.name } : null}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onClose={() => setXmindAsset(null)}
        getFileURL={xmindAsset ? () => getFileURL(xmindAsset.id).then((url) => url ?? "") : undefined}
        hideOpenInNewTab
      />
      <Modal
        open={Boolean(image)}
        onCancel={() => setImage(null)}
        footer={null}
        modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
        width="100vw"
        style={{ top: 0, paddingBottom: 0 }}
        styles={{ body: { padding: 0 } }}
        destroyOnHidden
        title={
          <Typography.Text strong style={{ marginTop: -16, marginBottom: -16 }}>
            {image?.name}
          </Typography.Text>
        }
      >
        <div
          className="flex items-center justify-center overflow-auto bg-surface-2 p-4"
          style={{ height: "calc(100vh - 56px)" }}
        >
          {image && <img src={image.src} alt={image.name} className="max-h-full max-w-full object-contain" />}
        </div>
      </Modal>
    </>
  );

  return { requestPreview, previewModals };
};
