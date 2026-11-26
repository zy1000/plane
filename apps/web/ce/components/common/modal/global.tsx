/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense } from "react";
import { observer } from "mobx-react";
import { FilestorePreviewHost } from "@/components/filestore/filestore-preview-host";

const ProfileSettingsModal = lazy(() =>
  import("@/components/settings/profile/modal").then((module) => ({
    default: module.ProfileSettingsModal,
  }))
);

type TGlobalModalsProps = {
  workspaceSlug: string;
};

/**
 * GlobalModals component manages all workspace-level modals across Plane applications.
 *
 * This includes:
 * - Profile settings modal
 * - 文件模块的文件预览（系统里点到「复制链接」的地址时，在当前页面弹出）
 */
export const GlobalModals = observer(function GlobalModals(_props: TGlobalModalsProps) {
  return (
    <>
      <Suspense fallback={null}>
        <ProfileSettingsModal />
      </Suspense>
      <FilestorePreviewHost />
    </>
  );
});
