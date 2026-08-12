import { useCallback, useState } from "react";
import { Button, Modal, Typography } from "antd";
import { CloseOutlined, ExportOutlined } from "@ant-design/icons";
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
  // 可选：自定义获取文件 URL（issue 附件等非 filestore 场景透传到内容组件）
  getFileURL?: () => Promise<string>;
  // 可选：隐藏「在新标签页打开」入口（非 filestore 场景没有对应的独立预览页）
  hideOpenInNewTab?: boolean;
};

export const XmindPreviewModal = ({
  open,
  asset,
  workspaceSlug,
  projectId,
  onClose,
  getFileURL,
  hideOpenInNewTab = false,
}: TXmindPreviewModalProps) => {
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
      modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
      width="100vw"
      style={{ top: 0, paddingBottom: 0 }}
      styles={{
        body: { padding: 0 },
        content: { padding: 0 },
        header: { padding: "8px 12px", margin: 0 },
      }}
      destroyOnHidden
      closable={false}
      title={
        <div className="flex min-w-0 items-center gap-2">
          <Typography.Text strong ellipsis>{`预览：${displayName}`}</Typography.Text>
          <div className="ml-auto flex items-center gap-1">
            {!hideOpenInNewTab && (
              <Button
                type="text"
                size="small"
                title="在新标签页打开"
                aria-label="在新标签页打开"
                icon={<ExportOutlined />}
                disabled={!asset?.id}
                onClick={handleOpenInNewTab}
              />
            )}
            <Button
              type="text"
              size="small"
              title="关闭"
              aria-label="关闭"
              icon={<CloseOutlined />}
              onClick={onClose}
            />
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col overflow-hidden" style={{ height: "calc(100vh - 40px)" }}>
        <XmindPreviewContent
          asset={asset}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          ready={isModalReady && open}
          getFileURL={getFileURL}
        />
      </div>
    </Modal>
  );
};
