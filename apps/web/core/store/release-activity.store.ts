/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TReleaseActivity } from "@plane/types";
import { ReleaseActivityService } from "@/services/release-activity.service";
import type { CoreRootStore } from "./root.store";

export interface IReleaseActivityStore {
  activitiesByReleaseId: Record<string, TReleaseActivity[]>;
  loaderByReleaseId: Record<string, boolean>;
  fetchedByReleaseId: Record<string, boolean>;
  getActivitiesByReleaseId: (releaseId: string) => TReleaseActivity[];
  isLoadingByReleaseId: (releaseId: string) => boolean;
  fetchActivities: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string
  ) => Promise<TReleaseActivity[]>;
}

export class ReleaseActivityStore implements IReleaseActivityStore {
  activitiesByReleaseId: Record<string, TReleaseActivity[]> = {};
  loaderByReleaseId: Record<string, boolean> = {};
  fetchedByReleaseId: Record<string, boolean> = {};

  releaseActivityService: ReleaseActivityService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      activitiesByReleaseId: observable,
      loaderByReleaseId: observable,
      fetchedByReleaseId: observable,
      fetchActivities: action,
    });
    this.releaseActivityService = new ReleaseActivityService();
  }

  getActivitiesByReleaseId = computedFn(
    (releaseId: string): TReleaseActivity[] => this.activitiesByReleaseId[releaseId] ?? []
  );

  isLoadingByReleaseId = computedFn((releaseId: string): boolean => !!this.loaderByReleaseId[releaseId]);

  fetchActivities = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string
  ): Promise<TReleaseActivity[]> => {
    runInAction(() => {
      this.loaderByReleaseId[releaseId] = true;
    });
    try {
      const response = await this.releaseActivityService.getReleaseActivities(
        workspaceSlug,
        projectId,
        releaseId
      );
      const sorted = [...(response ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      runInAction(() => {
        this.activitiesByReleaseId[releaseId] = sorted;
        this.fetchedByReleaseId[releaseId] = true;
      });
      return sorted;
    } finally {
      runInAction(() => {
        this.loaderByReleaseId[releaseId] = false;
      });
    }
  };
}
