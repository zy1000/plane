/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
// plane imports
import { EPageAccess, PROJECT_TRACKER_ELEMENTS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage, TPageNavigationTabs } from "@plane/types";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { usePageStore } from "@/plane-web/hooks/store";

type Props = {
  pageType: TPageNavigationTabs;
  projectId: string;
  storeType: EPageStoreType;
  workspaceSlug: string;
};

/** 笔记列表「公开 / 私有 / 已归档」页签行右端的新建按钮；在「私有」页签下新建的是私有笔记 */
export const PagesListCreateButton = observer(function PagesListCreateButton(props: Props) {
  const { pageType, projectId, storeType, workspaceSlug } = props;
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const router = useRouter();
  const { canCurrentUserCreatePage, createPage } = usePageStore(storeType);

  const handleCreatePage = async () => {
    if (!canCurrentUserCreatePage || isCreatingPage) return;

    setIsCreatingPage(true);

    const payload: Partial<TPage> = {
      access: pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
    };

    await createPage(payload)
      .then((res) => {
        router.push(`/${workspaceSlug}/projects/${projectId}/pages/${res?.id}`);
      })
      .catch((err) => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "错误！",
          message: err?.data?.error || "笔记创建失败，请重试。",
        });
      })
      .finally(() => setIsCreatingPage(false));
  };

  return (
    <Button
      variant="primary"
      size="lg"
      onClick={handleCreatePage}
      loading={isCreatingPage}
      disabled={!canCurrentUserCreatePage || isCreatingPage}
      data-ph-element={PROJECT_TRACKER_ELEMENTS.CREATE_HEADER_BUTTON}
    >
      {isCreatingPage ? "添加中" : "添加笔记"}
    </Button>
  );
});
