/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { PROJECT_RELEASES_ARCHIVE_PERMISSION_KEY } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  handleClose: () => void;
  isOpen: boolean;
};

export function ArchiveReleaseModal(props: Props) {
  const { workspaceSlug, projectId, releaseId, isOpen, handleClose } = props;
  const router = useAppRouter();
  const [isArchiving, setIsArchiving] = useState(false);
  const { getReleaseNameById, archiveRelease } = useRelease();
  const { allowProjectPermissionKeys } = useUserPermissions();

  const releaseName = getReleaseNameById(releaseId);
  const canArchiveRelease = allowProjectPermissionKeys(
    [PROJECT_RELEASES_ARCHIVE_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );

  const onClose = () => {
    setIsArchiving(false);
    handleClose();
  };

  const handleArchive = async () => {
    if (!canArchiveRelease) return;
    setIsArchiving(true);
    await archiveRelease(workspaceSlug, projectId, releaseId)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Archive success",
          message: "Your archives can be found in project archives.",
        });
        onClose();
        router.push(`/${workspaceSlug}/projects/${projectId}/releases`);
      })
      .catch(() =>
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Release could not be archived. Please try again.",
        })
      )
      .finally(() => setIsArchiving(false));
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="px-5 py-4">
        <h3 className="text-18 font-medium 2xl:text-20">Archive release {releaseName}</h3>
        <p className="mt-3 text-13 text-secondary">
          Are you sure you want to archive this release? You can restore it later from archives.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            tabIndex={1}
            onClick={handleArchive}
            loading={isArchiving}
            disabled={isArchiving || !canArchiveRelease}
          >
            {isArchiving ? "Archiving" : "Archive"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
