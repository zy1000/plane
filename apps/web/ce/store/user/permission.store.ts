/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RootStore } from "@/plane-web/store/root.store";
import { BaseUserPermissionStore } from "@/store/user/base-permissions.store";
import type { IBaseUserPermissionStore } from "@/store/user/base-permissions.store";

export type IUserPermissionStore = IBaseUserPermissionStore;

export class UserPermissionStore extends BaseUserPermissionStore implements IUserPermissionStore {
  constructor(store: RootStore) {
    super(store);
  }

  fetchWorkspaceLevelProjectEntities = (workspaceSlug: string, projectId: string): void => {
    void this.store.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);
  };
}
