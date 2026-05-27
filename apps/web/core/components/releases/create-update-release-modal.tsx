/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IRelease } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { ReleaseForm } from "@/components/releases/release-form";
import { formatReleaseUpdateError } from "@/components/releases/use-release-error-message";
import { useRelease } from "@/hooks/store/use-release";
import useKeypress from "@/hooks/use-keypress";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  data?: IRelease;
  workspaceSlug: string;
  projectId: string;
};

export const CreateUpdateReleaseModal = observer(function CreateUpdateReleaseModal(props: Props) {
  const { isOpen, onClose, data, workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { createRelease, updateReleaseDetails } = useRelease();
  const { isMobile } = usePlatformOS();

  const handleClose = () => {
    onClose();
  };

  const handleCreate = async (payload: Partial<IRelease>) => {
    if (!workspaceSlug || !projectId) return;
    await createRelease(workspaceSlug.toString(), projectId.toString(), payload)
      .then(() => {
        handleClose();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: t("project_release.created_success") ?? "Release created successfully.",
        });
      })
      .catch((err) => {
        if (isProjectPermissionError(err)) {
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
            message: err?.detail ?? err?.error ?? "Release could not be created. Please try again.",
          });
        }
      });
  };

  const handleUpdate = async (payload: Partial<IRelease>) => {
    if (!workspaceSlug || !projectId || !data) return;
    await updateReleaseDetails(workspaceSlug.toString(), projectId.toString(), data.id, payload)
      .then(() => {
        handleClose();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: t("project_release.updated_success") ?? "Release updated successfully.",
        });
      })
      .catch((err) => {
        if (isProjectPermissionError(err)) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
            message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
              ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
              : undefined,
          });
        } else {
          const { title, message } = formatReleaseUpdateError(err);
          setToast({
            type: TOAST_TYPE.ERROR,
            title,
            message,
          });
        }
      });
  };

  const handleFormSubmit = async (formData: Partial<IRelease>) => {
    if (!workspaceSlug || !projectId) return;
    if (!data) await handleCreate(formData);
    else await handleUpdate(formData);
  };

  useKeypress("Escape", () => {
    if (isOpen) handleClose();
  });

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <ReleaseForm
        key={`${isOpen ? "open" : "closed"}-${data?.id ?? "new"}`}
        handleFormSubmit={handleFormSubmit}
        handleClose={handleClose}
        isUpdate={!!data}
        projectId={projectId}
        data={data}
        isMobile={isMobile}
      />
    </ModalCore>
  );
});
