/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Loader } from "lucide-react";
import { CloseIcon } from "@plane/propel/icons";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IState, TStateOperationsCallbacks } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

type TStateDelete = {
  totalStates: number;
  state: IState;
  deleteStateCallback: TStateOperationsCallbacks["deleteState"];
  shouldTrackEvents?: boolean;
  disabled?: boolean;
};

export const StateDelete = observer(function StateDelete(props: TStateDelete) {
  const { totalStates, state, deleteStateCallback, disabled = false } = props;
  const { t } = useTranslation();
  // hooks
  const { isMobile } = usePlatformOS();
  // states
  const [isDeleteModal, setIsDeleteModal] = useState(false);
  const [isDelete, setIsDelete] = useState(false);
  // derived values
  const isDeleteDisabled = disabled || state.default || totalStates === 1;

  const handleDeleteState = async () => {
    if (isDeleteDisabled) return;

    setIsDelete(true);

    try {
      await deleteStateCallback(state.id);
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
        const e = error as { error?: string };
        const msg = e?.error;
        if (msg === "The state is not empty, only empty states can be deleted") {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message:
              "This state contains some work items within it, please move them to some other state to delete this state.",
          });
        } else if (msg === "Default state cannot be deleted") {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: "Default state cannot be deleted.",
          });
        } else {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: "State could not be deleted. Please try again.",
          });
        }
      }
    } finally {
      setIsDelete(false);
    }
  };

  return (
    <>
      <AlertModalCore
        handleClose={() => setIsDeleteModal(false)}
        handleSubmit={handleDeleteState}
        isSubmitting={isDelete}
        isOpen={isDeleteModal}
        title="Delete State"
        content={
          <>
            Are you sure you want to delete state- <span className="font-medium text-primary">{state?.name}</span>? All
            of the data related to the state will be permanently removed. This action cannot be undone.
          </>
        }
      />

      <button
        type="button"
        className={cn(
          "flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm transition-colors focus:outline-none",
          isDeleteDisabled ? "bg-surface-2 text-secondary" : "text-danger-primary hover:bg-layer-1"
        )}
        disabled={isDeleteDisabled}
        onClick={() => setIsDeleteModal(true)}
      >
        <Tooltip
          tooltipContent={
            disabled
              ? "You do not have permission to delete this state."
              : state.default
                ? "Cannot delete the default state."
                : totalStates === 1
                  ? `Cannot have an empty group.`
                  : ``
          }
          isMobile={isMobile}
          disabled={!isDeleteDisabled}
          className="focus:outline-none"
        >
          {isDelete ? <Loader className="h-3.5 w-3.5 text-secondary" /> : <CloseIcon className="h-3.5 w-3.5" />}
        </Tooltip>
      </button>
    </>
  );
});
