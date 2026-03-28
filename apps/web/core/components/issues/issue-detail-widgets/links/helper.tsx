/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueLink, TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import type { TLinkOperations } from "../../issue-detail/links";

export const useLinkOperations = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  issueServiceType: TIssueServiceType
): TLinkOperations => {
  const { createLink, updateLink, removeLink } = useIssueDetail(issueServiceType);
  // i18n
  const { t } = useTranslation();

  const handleLinkOperations: TLinkOperations = useMemo(
    () => ({
      create: async (data: Partial<TIssueLink>) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await createLink(workspaceSlug, projectId, issueId, data);
          setToast({
            message: t("links.toasts.created.message"),
            type: TOAST_TYPE.SUCCESS,
            title: t("links.toasts.created.title"),
          });
        } catch (error: any) {
          setToast({
            message: error?.data?.error ?? t("links.toasts.not_created.message"),
            type: TOAST_TYPE.ERROR,
            title: t("links.toasts.not_created.title"),
          });
          throw error;
        }
      },
      update: async (linkId: string, data: Partial<TIssueLink>) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await updateLink(workspaceSlug, projectId, issueId, linkId, data);
          setToast({
            message: t("links.toasts.updated.message"),
            type: TOAST_TYPE.SUCCESS,
            title: t("links.toasts.updated.title"),
          });
        } catch (error: any) {
          setToast({
            message: error?.data?.error ?? t("links.toasts.not_updated.message"),
            type: TOAST_TYPE.ERROR,
            title: t("links.toasts.not_updated.title"),
          });
          throw error;
        }
      },
      remove: async (linkId: string) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await removeLink(workspaceSlug, projectId, issueId, linkId);
          setToast({
            message: t("links.toasts.removed.message"),
            type: TOAST_TYPE.SUCCESS,
            title: t("links.toasts.removed.title"),
          });
        } catch (error) {
          const currentError = isProjectPermissionError(error)
            ? {
                title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
                message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
                  ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
                  : undefined,
              }
            : {
                title: t("links.toasts.not_removed.title"),
                message: t("links.toasts.not_removed.message"),
              };
          setToast({
            message: currentError.message,
            type: TOAST_TYPE.ERROR,
            title: currentError.title,
          });
        }
      },
    }),
    [workspaceSlug, projectId, issueId, createLink, updateLink, removeLink, t]
  );

  return handleLinkOperations;
};
