/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import type { IWorkspaceMyAccess } from "@plane/types";
import { Button } from "@plane/ui";
import { IdentityBar } from "./identity-bar";
import { PermissionsSection } from "./permissions-section";
import { SourcesSection } from "./sources-section";
import { VisibilitySection } from "./visibility-section";

type Props = {
  data: IWorkspaceMyAccess | undefined;
  error: unknown;
  isLoading: boolean;
  onRetry: () => void;
};

/** 内容区：最宽 1120px，和权限组详情页同一套视觉 */
function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 text-14">{children}</div>;
}

const SKELETON_CARD = "rounded-xl border border-subtle bg-surface-1";

function MyAccessSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div className="flex flex-col gap-10 animate-pulse" role="status">
      <div className="h-7 w-24 rounded bg-layer-1" />
      <div className={`flex items-center gap-4 px-6 py-5 ${SKELETON_CARD}`}>
        <div className="size-12 rounded-full bg-layer-1" />
        <div className="flex-1">
          <div className="h-5 w-40 rounded bg-layer-1" />
          <div className="mt-2 h-3 w-64 rounded bg-layer-1" />
        </div>
        {[1, 2, 3].map((item) => (
          <div key={item} className="hidden w-28 md:block">
            <div className="h-3 w-12 rounded bg-layer-1" />
            <div className="mt-2 h-4 w-24 rounded bg-layer-1" />
          </div>
        ))}
      </div>
      <div>
        <div className="h-5 w-32 rounded bg-layer-1" />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          {[1, 2].map((item) => (
            <div key={item} className={`h-56 px-5 py-4 ${SKELETON_CARD}`}>
              <div className="h-7 w-20 rounded bg-layer-1" />
              <div className="mt-5 space-y-3">
                <div className="h-3 w-full rounded bg-layer-1" />
                <div className="h-3 w-5/6 rounded bg-layer-1" />
                <div className="h-3 w-2/3 rounded bg-layer-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="h-5 w-32 rounded bg-layer-1" />
        <div className="mt-4 flex flex-col gap-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className={`h-[52px] ${SKELETON_CARD}`} />
          ))}
        </div>
      </div>
      <div>
        <div className="h-5 w-32 rounded bg-layer-1" />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className={`h-32 ${SKELETON_CARD}`} />
          ))}
        </div>
      </div>
      <span className="sr-only">{loadingLabel}</span>
    </div>
  );
}

/** 工作区设置 › 我的权限：身份条 / 我能看到什么 / 我能做什么 / 权限来自哪里 */
export const MyAccessRoot = observer(function MyAccessRoot({ data, error, isLoading, onRetry }: Props) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();

  if (isLoading) {
    return (
      <Shell>
        <MyAccessSkeleton loadingLabel={t("workspace_settings.settings.my_access.loading")} />
      </Shell>
    );
  }

  if (error || !data || !workspaceSlug) {
    return (
      <Shell>
        <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-subtle px-6 text-center">
          <div className="grid size-11 place-items-center rounded-lg bg-danger-subtle">
            <AlertCircle className="size-5 text-danger-primary" />
          </div>
          <h2 className="mt-4 text-body-md-medium text-primary">
            {t("workspace_settings.settings.my_access.error.title")}
          </h2>
          <p className="mt-1 max-w-md text-body-sm-regular text-secondary">
            {t("workspace_settings.settings.my_access.error.description")}
          </p>
          <Button variant="neutral-primary" size="md" className="mt-4" prependIcon={<RefreshCw />} onClick={onRetry}>
            {t("workspace_settings.settings.my_access.error.retry")}
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-20 font-semibold text-primary">{t("workspace_settings.settings.my_access.title")}</h1>
      <IdentityBar data={data} />
      <VisibilitySection visibility={data.visibility} />
      <PermissionsSection workspaceSlug={workspaceSlug} data={data} />
      <SourcesSection workspaceSlug={workspaceSlug} data={data} />
    </Shell>
  );
});
