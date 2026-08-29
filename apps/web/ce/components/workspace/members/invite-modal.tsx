/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IWorkspaceBulkInviteFormData } from "@plane/types";
import { EModalWidth, EModalPosition, ModalCore } from "@plane/ui";
// components
import { InvitationModalActions } from "@/components/workspace/invite-modal/actions";
import { InvitationFields } from "@/components/workspace/invite-modal/fields";
import { InvitationForm } from "@/components/workspace/invite-modal/form";
// hooks
import { useWorkspaceRoles } from "@/hooks/store/use-workspace-roles";
import { useWorkspaceInvitationActions } from "@/hooks/use-workspace-invitation";

export type TSendWorkspaceInvitationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: IWorkspaceBulkInviteFormData) => Promise<void> | undefined;
};

export const SendWorkspaceInvitationModal = observer(function SendWorkspaceInvitationModal(
  props: TSendWorkspaceInvitationModalProps
) {
  const { isOpen, onClose, onSubmit } = props;
  // store hooks
  const { t } = useTranslation();
  // router
  const { workspaceSlug } = useParams();
  // derived values
  const { control, fields, formState, remove, onFormSubmit, handleClose, appendField } = useWorkspaceInvitationActions({
    onSubmit,
    onClose,
  });
  // 工作区自定义角色，供每行邀请选择
  const { roles, isLoading: isRolesLoading, fetchRoles } = useWorkspaceRoles(workspaceSlug?.toString(), "workspace");
  useSWR(isOpen && workspaceSlug ? `WORKSPACE_INVITE_MODAL_ROLES_${workspaceSlug.toString()}` : null, fetchRoles);

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <InvitationForm
        title={t("workspace_settings.settings.members.modal.title")}
        description={t("workspace_settings.settings.members.modal.description")}
        onSubmit={onFormSubmit}
        actions={
          <InvitationModalActions
            isSubmitting={formState.isSubmitting}
            handleClose={handleClose}
            appendField={appendField}
          />
        }
        className="p-5"
      >
        <InvitationFields
          workspaceSlug={workspaceSlug.toString()}
          fields={fields}
          control={control}
          formState={formState}
          remove={remove}
          roles={roles}
          isRolesLoading={isRolesLoading}
        />
      </InvitationForm>
    </ModalCore>
  );
});
