/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import {
  PROJECT_ERROR_MESSAGES,
  PROJECT_VIEWS_DELETE_PERMISSION_KEY,
  isProjectPermissionError,
} from "@plane/constants";
// types
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProjectView } from "@plane/types";
// ui
import { AlertModalCore } from "@plane/ui";
// hooks
import { useProjectView } from "@/hooks/store/use-project-view";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  data: IProjectView;
  isOpen: boolean;
  onClose: () => void;
};

export const DeleteProjectViewModal = observer(function DeleteProjectViewModal(props: Props) {
  const { data, isOpen, onClose } = props;
  // states
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  // router
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();
  // store hooks
  const { deleteView } = useProjectView();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { t } = useTranslation();
  const canDeleteView = allowProjectPermissionKeys(
    [PROJECT_VIEWS_DELETE_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );
  const handleClose = () => {
    onClose();
    setIsDeleteLoading(false);
  };

  const handleDeleteView = async () => {
    if (!workspaceSlug || !projectId) return;
    if (!canDeleteView) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
        message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
          ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
          : undefined,
      });
      return;
    }
    try {
      setIsDeleteLoading(true);
      await deleteView(workspaceSlug.toString(), projectId.toString(), data.id);
      handleClose();
      router.push(`/${workspaceSlug}/projects/${projectId}/views`);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "View deleted successfully.",
      });
    } catch (error: unknown) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "View could not be deleted. Please try again.",
        });
      }
    }
    setIsDeleteLoading(false);
  };

  return (
    <AlertModalCore
      handleClose={handleClose}
      handleSubmit={handleDeleteView}
      isSubmitDisabled={!canDeleteView}
      isSubmitting={isDeleteLoading}
      isOpen={isOpen}
      title={t("project_views.delete_view.title")}
      content={<>{t("project_views.delete_view.content")}</>}
    />
  );
});
