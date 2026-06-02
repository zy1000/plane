/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TCycleActivity } from "@plane/types";
import { CycleActivityService } from "@/services/cycle-activity.service";
import type { CoreRootStore } from "./root.store";

export interface ICycleActivityStore {
  activitiesByCycleId: Record<string, TCycleActivity[]>;
  loaderByCycleId: Record<string, boolean>;
  fetchedByCycleId: Record<string, boolean>;
  getActivitiesByCycleId: (cycleId: string) => TCycleActivity[];
  isLoadingByCycleId: (cycleId: string) => boolean;
  fetchActivities: (
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ) => Promise<TCycleActivity[]>;
}

export class CycleActivityStore implements ICycleActivityStore {
  activitiesByCycleId: Record<string, TCycleActivity[]> = {};
  loaderByCycleId: Record<string, boolean> = {};
  fetchedByCycleId: Record<string, boolean> = {};

  cycleActivityService: CycleActivityService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      activitiesByCycleId: observable,
      loaderByCycleId: observable,
      fetchedByCycleId: observable,
      fetchActivities: action,
    });
    this.cycleActivityService = new CycleActivityService();
  }

  getActivitiesByCycleId = computedFn(
    (cycleId: string): TCycleActivity[] => this.activitiesByCycleId[cycleId] ?? []
  );

  isLoadingByCycleId = computedFn((cycleId: string): boolean => !!this.loaderByCycleId[cycleId]);

  fetchActivities = async (
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TCycleActivity[]> => {
    runInAction(() => {
      this.loaderByCycleId[cycleId] = true;
    });
    try {
      const response = await this.cycleActivityService.getCycleActivities(
        workspaceSlug,
        projectId,
        cycleId
      );
      const sorted = [...(response ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      runInAction(() => {
        this.activitiesByCycleId[cycleId] = sorted;
        this.fetchedByCycleId[cycleId] = true;
      });
      return sorted;
    } finally {
      runInAction(() => {
        this.loaderByCycleId[cycleId] = false;
      });
    }
  };
}
