/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { PROJECT_ERROR_MESSAGES, STATE_GROUPS, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState, TStateGroups, TStateOperationsCallbacks } from "@plane/types";
// components
import { StateForm } from "@/components/project-states";

type TStateCreate = {
  groupKey: TStateGroups;
  shouldTrackEvents?: boolean;
  createStateCallback: TStateOperationsCallbacks["createState"];
  handleClose: () => void;
};

export const StateCreate = observer(function StateCreate(props: TStateCreate) {
  const { groupKey, createStateCallback, handleClose } = props;
  const { t } = useTranslation();

  // states
  const [loader, setLoader] = useState(false);

  const onCancel = () => {
    setLoader(false);
    handleClose();
  };

  const onSubmit = async (formData: Partial<IState>) => {
    if (!groupKey) return { status: "error" };

    try {
      const response = await createStateCallback({ ...formData, group: groupKey });

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "State created successfully.",
      });
      handleClose();
      return { status: "success" };
    } catch (error) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
        return { status: "error" };
      }
      const err = error as { name?: string | string[]; error?: string };
      const nameDuplicate =
        (typeof err?.name === "string" && (err.name.includes("already") || err.name.includes("taken"))) ||
        (Array.isArray(err?.name) &&
          err.name[0] &&
          (String(err.name[0]).includes("already") || String(err.name[0]).includes("taken")));
      if (nameDuplicate) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "State with that name already exists. Please try again with another name.",
        });
        return { status: "already_exists" };
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.error ?? "State could not be created. Please try again.",
      });
      return { status: "error" };
    }
  };

  return (
    <StateForm
      data={{ name: "", description: "", color: STATE_GROUPS[groupKey].color }}
      onSubmit={onSubmit}
      onCancel={onCancel}
      buttonDisabled={loader}
      buttonTitle={loader ? `Creating` : `Create`}
    />
  );
});
