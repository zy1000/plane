/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
import type { ILinkDetails } from "@plane/types";
import { ModulesLinksListItem } from "@/components/modules";
import { useRelease } from "@/hooks/store/use-release";

type Props = {
  disabled?: boolean;
  handleDeleteLink: (linkId: string) => void;
  handleEditLink: (link: ILinkDetails) => void;
  releaseId: string;
};

export const ReleaseLinksList = observer(function ReleaseLinksList(props: Props) {
  const { releaseId, handleDeleteLink, handleEditLink, disabled } = props;
  const { getReleaseById } = useRelease();
  const currentRelease = getReleaseById(releaseId);
  const releaseLinks = currentRelease?.link_release;
  const memoizedDeleteLink = useCallback((id: string) => handleDeleteLink(id), [handleDeleteLink]);
  const memoizedEditLink = useCallback((link: ILinkDetails) => handleEditLink(link), [handleEditLink]);

  if (!releaseLinks) return null;

  return (
    <>
      {releaseLinks.map((link) => (
        <ModulesLinksListItem
          key={link.id}
          handleDeleteLink={() => memoizedDeleteLink(link.id)}
          handleEditLink={() => memoizedEditLink(link)}
          isEditingAllowed={!disabled}
          link={link}
        />
      ))}
    </>
  );
});
