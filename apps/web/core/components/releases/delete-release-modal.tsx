/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IRelease } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  data: IRelease;
  isOpen: boolean;
  onClose: () => void;
};

export const DeleteReleaseModal = observer(function DeleteReleaseModal(props: Props) {
  const { data, isOpen, onClose } = props;
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const router = useAppRouter();
  const { workspaceSlug, projectId, releaseId } = useParams();
  const searchParams = useSearchParams();
  const peekRelease = searchParams.get("peekRelease");
  const { deleteRelease } = useRelease();
  const { t } = useTranslation();

  const handleClose = () => {
    onClose();
    setIsDeleteLoading(false);
  };

  const handleDeletion = async () => {
    if (!workspaceSlug || !projectId) return;

    setIsDeleteLoading(true);

    await deleteRelease(workspaceSlug.toString(), projectId.toString(), data.id)
      .then(() => {
        if (releaseId || peekRelease) router.push(`/${workspaceSlug}/projects/${data.project_id}/releases`);
        handleClose();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: "Release deleted successfully.",
        });
      })
      .catch((errors) => {
        const currentError = isProjectPermissionError(errors)
          ? PROJECT_ERROR_MESSAGES.permissionError
          : PROJECT_ERROR_MESSAGES.moduleDeleteError;
        setToast({
          title: t(currentError.i18n_title),
          type: TOAST_TYPE.ERROR,
          message: currentError.i18n_message ? t(currentError.i18n_message) : undefined,
        });
      })
      .finally(() => handleClose());
  };

  return (
    <AlertModalCore
      handleClose={handleClose}
      handleSubmit={handleDeletion}
      isSubmitting={isDeleteLoading}
      isOpen={isOpen}
      title="Delete release"
      content={
        <>
          Are you sure you want to delete <span className="font-medium text-primary">{data.name}</span>? This action
          cannot be undone.
        </>
      }
    />
  );
});
