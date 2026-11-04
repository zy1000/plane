/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane web imports
import type { RootStore } from "@/plane-web/store/root.store";
// store
import type { IMemberRootStore } from "@/store/member";
import type { IBaseProjectMemberStore } from "@/store/member/project/base-project-member.store";
import { BaseProjectMemberStore } from "@/store/member/project/base-project-member.store";

export type IProjectMemberStore = IBaseProjectMemberStore;

export class ProjectMemberStore extends BaseProjectMemberStore implements IProjectMemberStore {
  constructor(_memberRoot: IMemberRootStore, rootStore: RootStore) {
    super(_memberRoot, rootStore);
  }

  /**
   * @description Processes the removal of a member from a project
   * This method handles the cleanup of member data from the project member map
   * @param projectId - The ID of the project to remove the member from
   * @param userId - The ID of the user to remove from the project
   */
  processMemberRemoval = (projectId: string, userId: string) => this.handleMemberRemoval(projectId, userId);
}
