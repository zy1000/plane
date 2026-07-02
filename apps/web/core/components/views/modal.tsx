/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import {
  PROJECT_ERROR_MESSAGES,
  PROJECT_VIEWS_CREATE_PERMISSION_KEY,
  PROJECT_VIEWS_EDIT_PERMISSION_KEY,
  isProjectPermissionError,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// types
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProjectView } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// ui
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProjectView } from "@/hooks/store/use-project-view";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import { useAppRouter } from "@/hooks/use-app-router";
import useKeypress from "@/hooks/use-keypress";
// local imports
import { ProjectViewForm } from "./form";

type Props = {
  data?: IProjectView | null;
  isOpen: boolean;
  onClose: () => void;
  preLoadedData?: Partial<IProjectView> | null;
  workspaceSlug: string;
  projectId: string;
  isSubmitDisabled?: boolean;
};

export const CreateUpdateProjectViewModal = observer(function CreateUpdateProjectViewModal(props: Props) {
  const { data, isOpen, onClose, preLoadedData, workspaceSlug, projectId, isSubmitDisabled = false } = props;
  const { t } = useTranslation();
  // router
  const router = useAppRouter();
  // store hooks
  const { createView, updateView } = useProjectView();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const {
    issuesFilter: { mutateFilters },
  } = useIssues(EIssuesStoreType.PROJECT_VIEW);
  const { resetExpression } = useWorkItemFilters();

  const handleClose = () => {
    onClose();
  };

  const canCreateView = allowProjectPermissionKeys([PROJECT_VIEWS_CREATE_PERMISSION_KEY], workspaceSlug, projectId);
  const canEditView = allowProjectPermissionKeys([PROJECT_VIEWS_EDIT_PERMISSION_KEY], workspaceSlug, projectId);
  const canSubmit = data ? canEditView : canCreateView;
  const isSubmitBlocked = isSubmitDisabled || !canSubmit;

  const showPermissionError = () => {
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
      message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
        ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
        : undefined,
    });
  };

  const handleCreateView = async (payload: IProjectView) => {
    if (!canCreateView) {
      showPermissionError();
      return;
    }
    try {
      const res = await createView(workspaceSlug, projectId, payload);
      handleClose();
      router.push(`/${workspaceSlug}/projects/${projectId}/views/${res.id}`);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "View created successfully.",
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
        return;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to create view. Please try again.",
      });
    }
  };

  const handleUpdateView = async (payload: IProjectView) => {
    if (!canEditView) {
      showPermissionError();
      return;
    }
    try {
      const viewDetails = await updateView(workspaceSlug, projectId, data?.id as string, payload);
      mutateFilters(workspaceSlug, viewDetails.id, viewDetails);
      resetExpression(EIssuesStoreType.PROJECT_VIEW, viewDetails.id, viewDetails.rich_filters);
      handleClose();
    } catch (error: unknown) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
        return;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to update view. Please try again.",
      });
    }
  };

  const handleFormSubmit = async (formData: IProjectView) => {
    if (isSubmitBlocked) {
      showPermissionError();
      return;
    }
    if (!data) await handleCreateView(formData);
    else await handleUpdateView(formData);
  };

  useKeypress("Escape", () => {
    if (isOpen) handleClose();
  });

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <ProjectViewForm
        data={data}
        handleClose={handleClose}
        handleFormSubmit={handleFormSubmit}
        preLoadedData={preLoadedData}
        projectId={projectId}
        isSubmitDisabled={isSubmitBlocked}
        workspaceSlug={workspaceSlug}
      />
    </ModalCore>
  );
});
