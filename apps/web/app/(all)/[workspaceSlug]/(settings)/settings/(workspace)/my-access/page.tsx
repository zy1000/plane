/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { MyAccessRoot } from "@/components/workspace/settings/my-access";
import { useWorkspaceMyAccess } from "@/hooks/store/use-workspace-my-access";
import type { Route } from "./+types/page";
import { MyAccessWorkspaceSettingsHeader } from "./header";

export default function MyAccessWorkspaceSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { data, error, isLoading, refetch } = useWorkspaceMyAccess(workspaceSlug);

  return (
    <SettingsContentWrapper header={<MyAccessWorkspaceSettingsHeader />}>
      <MyAccessRoot data={data} error={error} isLoading={isLoading} onRetry={refetch} />
    </SettingsContentWrapper>
  );
}
