/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// types
import type { TAttachmentUploadStatus } from "@/store/issue/issue-details/attachment.store";

export type TAttachmentOperations = {
  create: (file: File) => Promise<void>;
  remove: (attachmentId: string) => Promise<void>;
  download: (attachmentId: string) => Promise<void>;
};

export type TAttachmentSnapshot = {
  uploadStatus: TAttachmentUploadStatus[] | undefined;
};

export type TAttachmentHelpers = {
  operations: TAttachmentOperations;
  snapshot: TAttachmentSnapshot;
};

type TToastContent = {
  title: string;
  message?: string;
};

export const getAttachmentUploadErrorToast = (
  error: unknown,
  t: (key: string, values?: Record<string, string | number>) => string
): TToastContent => {
  if (isProjectPermissionError(error)) {
    return {
      title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
      message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
        ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
        : undefined,
    };
  }

  return {
    title: t("toast.error"),
    message: t("attachment.error"),
  };
};

const getAttachmentDeleteErrorToast = (
  error: unknown,
  t: (key: string, values?: Record<string, string | number>) => string
): TToastContent => {
  if (isProjectPermissionError(error)) {
    return {
      title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
      message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
        ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
        : undefined,
    };
  }

  return {
    title: "Attachment not removed",
    message: "The Attachment could not be removed",
  };
};

export const useAttachmentOperations = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  issueServiceType: TIssueServiceType = EIssueServiceType.ISSUES
): TAttachmentHelpers => {
  const { t } = useTranslation();
  const {
    attachment: { createAttachment, removeAttachment, downloadAttachment, getAttachmentsUploadStatusByIssueId },
  } = useIssueDetail(issueServiceType);

  const attachmentOperations: TAttachmentOperations = useMemo(
    () => ({
      create: async (file) => {
        if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
        await createAttachment(workspaceSlug, projectId, issueId, file);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Attachment uploaded",
          message: "The attachment has been successfully uploaded",
        });
      },
      remove: async (attachmentId) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await removeAttachment(workspaceSlug, projectId, issueId, attachmentId);
          setToast({
            message: "The attachment has been successfully removed",
            type: TOAST_TYPE.SUCCESS,
            title: "Attachment removed",
          });
        } catch (error) {
          const currentError = getAttachmentDeleteErrorToast(error, t);
          setToast({
            message: currentError.message,
            type: TOAST_TYPE.ERROR,
            title: currentError.title,
          });
        }
      },
      download: async (attachmentId) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          const downloadUrl = await downloadAttachment(workspaceSlug, projectId, issueId, attachmentId);
          if (!downloadUrl) throw new Error("Missing download URL");
          window.open(downloadUrl, "_blank", "noopener,noreferrer");
        } catch (error) {
          setToast({
            message: t("attachment.error"),
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
          });
        }
      },
    }),
    [workspaceSlug, projectId, issueId, createAttachment, removeAttachment, downloadAttachment, t]
  );
  const attachmentsUploadStatus = getAttachmentsUploadStatusByIssueId(issueId);

  return {
    operations: attachmentOperations,
    snapshot: { uploadStatus: attachmentsUploadStatus },
  };
};
