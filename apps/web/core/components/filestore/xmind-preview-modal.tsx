import { useCallback, useState } from "react";
import { Button, Modal, Typography } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import {
  XmindPreviewContent,
  getAssetDisplayName,
  type TXmindPreviewAsset,
} from "@/components/filestore/xmind-preview-content";

export type { TXmindPreviewAsset } from "@/components/filestore/xmind-preview-content";

type TXmindPreviewModalProps = {
  open: boolean;
  asset: TXmindPreviewAsset | null;
  workspaceSlug: string;
  projectId: string;
  onClose: () => void;
};

const MODAL_HEIGHT = "90vh";

export const XmindPreviewModal = ({ open, asset, workspaceSlug, projectId, onClose }: TXmindPreviewModalProps) => {
  const [isModalReady, setIsModalReady] = useState(false);

  const handleModalOpenChange = useCallback((visible: boolean) => {
    setIsModalReady(visible);
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    if (!asset?.id) return;
    const name = getAssetDisplayName(asset);
    const url =
      `/${encodeURIComponent(workspaceSlug)}` +
      `/projects/${encodeURIComponent(projectId)}` +
      `/filestore/xmind/${encodeURIComponent(asset.id)}` +
      `?name=${encodeURIComponent(name)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [asset, projectId, workspaceSlug]);

  const displayName = getAssetDisplayName(asset);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterOpenChange={handleModalOpenChange}
      footer={null}
      width="90vw"
      style={{
        top: "5vh",
        paddingBottom: 0,
        height: MODAL_HEIGHT,
      }}
      styles={{
        content: {
          height: MODAL_HEIGHT,
          maxHeight: MODAL_HEIGHT,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        },
        header: { padding: "16px 24px", marginBottom: 0, flexShrink: 0 },
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        },
      }}
      destroyOnClose
      title={
        <div className="flex items-center" style={{ paddingRight: 36 }}>
          <Typography.Text strong>{`预览：${displayName}`}</Typography.Text>
          <Button
            type="text"
            size="small"
            className="ml-auto"
            title="在新标签页打开"
            aria-label="在新标签页打开"
            icon={<ExportOutlined />}
            disabled={!asset?.id}
            onClick={handleOpenInNewTab}
          />
        </div>
      }
    >
      <XmindPreviewContent
        asset={asset}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        ready={isModalReady && open}
      />
    </Modal>
  );
};
