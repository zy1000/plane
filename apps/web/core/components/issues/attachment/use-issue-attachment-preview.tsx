/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Modal, Typography, message } from "antd";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// components
import { XmindPreviewModal, type TXmindPreviewAsset } from "@/components/filestore/xmind-preview-modal";
import { OnlyOfficePreviewModal } from "@/components/onlyoffice/onlyoffice-preview-modal";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// services
import { IssueAttachmentService } from "@/services/issue";
// utils
import { isImageSupported, isOnlyOfficeSupported, isXmindSupported } from "@/utils/onlyoffice";

type TUseIssueAttachmentPreviewProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueServiceType?: TIssueServiceType;
};

export type TUseIssueAttachmentPreviewReturn = {
  requestPreview: (attachmentId: string) => Promise<void>;
  previewModals: ReactNode;
};

export const useIssueAttachmentPreview = ({
  workspaceSlug,
  projectId,
  issueId,
  issueServiceType = EIssueServiceType.ISSUES,
}: TUseIssueAttachmentPreviewProps): TUseIssueAttachmentPreviewReturn => {
  const {
    attachment: { getAttachmentById },
  } = useIssueDetail(issueServiceType);

  const attachmentService = useMemo(() => new IssueAttachmentService(issueServiceType), [issueServiceType]);

  const [officePreviewAttachmentId, setOfficePreviewAttachmentId] = useState<string | null>(null);
  const [officePreviewOpen, setOfficePreviewOpen] = useState(false);
  const [xmindPreviewAttachment, setXmindPreviewAttachment] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string } | null>(null);

  const officePreviewAttachment = officePreviewAttachmentId ? getAttachmentById(officePreviewAttachmentId) : undefined;

  const fetchAttachmentDownloadURL = useCallback(
    async (attachmentId: string) => {
      const url = await attachmentService.downloadIssueAttachment(workspaceSlug, projectId, issueId, attachmentId);
      if (!url) throw new Error("获取文件地址失败");
      return url;
    },
    [attachmentService, issueId, projectId, workspaceSlug]
  );

  const requestPreview = useCallback(
    async (attachmentId: string) => {
      const attachment = getAttachmentById(attachmentId);
      if (!attachment) return;
      const fileName = attachment.attributes?.name;

      if (isXmindSupported(fileName)) {
        setXmindPreviewAttachment({ id: attachmentId, name: String(fileName ?? "") });
        return;
      }
      if (isOnlyOfficeSupported(fileName)) {
        setOfficePreviewAttachmentId(attachmentId);
        setOfficePreviewOpen(true);
        return;
      }
      if (isImageSupported(fileName)) {
        try {
          const url = await fetchAttachmentDownloadURL(attachmentId);
          setImagePreview({ src: url, name: String(fileName ?? "图片") });
        } catch (error: any) {
          message.error(error?.message || "图片预览失败");
        }
        return;
      }
      message.warning("暂不支持预览此文件类型");
    },
    [fetchAttachmentDownloadURL, getAttachmentById]
  );

  const xmindGetFileURL = useMemo(() => {
    if (!xmindPreviewAttachment?.id) return undefined;
    const id = xmindPreviewAttachment.id;
    return () => fetchAttachmentDownloadURL(id);
  }, [fetchAttachmentDownloadURL, xmindPreviewAttachment?.id]);

  const xmindAsset: TXmindPreviewAsset | null = xmindPreviewAttachment
    ? { id: xmindPreviewAttachment.id, name: xmindPreviewAttachment.name }
    : null;

  const previewModals = (
    <>
      {officePreviewAttachmentId && officePreviewAttachment && (
        <OnlyOfficePreviewModal
          open={officePreviewOpen}
          onClose={() => setOfficePreviewOpen(false)}
          afterOpenChange={(visible) => {
            if (!visible) setOfficePreviewAttachmentId(null);
          }}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          assetId={officePreviewAttachmentId}
          fileName={officePreviewAttachment.attributes?.name}
        />
      )}
      <XmindPreviewModal
        open={Boolean(xmindPreviewAttachment)}
        asset={xmindAsset}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onClose={() => setXmindPreviewAttachment(null)}
        getFileURL={xmindGetFileURL}
        hideOpenInNewTab
      />
      <Modal
        open={Boolean(imagePreview)}
        onCancel={() => setImagePreview(null)}
        afterOpenChange={(visible) => {
          if (!visible) setImagePreview(null);
        }}
        footer={null}
        modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
        width="100vw"
        style={{ top: 0, paddingBottom: 0 }}
        styles={{ body: { padding: 0 } }}
        destroyOnClose
        title={
          <Typography.Text strong style={{ marginTop: -16, marginBottom: -16 }}>
            {`预览：${imagePreview?.name ?? "图片"}`}
          </Typography.Text>
        }
      >
        <div
          className="flex items-center justify-center overflow-auto bg-surface-2 p-4"
          style={{ height: "calc(100vh - 56px)" }}
        >
          {imagePreview?.src && (
            <img src={imagePreview.src} alt="attachment-preview" className="max-h-full max-w-full object-contain" />
          )}
        </div>
      </Modal>
    </>
  );

  return { requestPreview, previewModals };
};
