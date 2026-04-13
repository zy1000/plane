/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, runInAction } from "mobx";
import type {
  TIssue,
  TLoader,
  ViewFlags,
  IssuePaginationOptions,
  TIssuesResponse,
  TBulkOperationsPayload,
} from "@plane/types";
import { getDistributionPathsPostUpdate } from "@plane/utils";
import { ReleaseService } from "@/services/release.service";
import type { IBaseIssuesStore } from "../helpers/base-issues.store";
import { BaseIssuesStore } from "../helpers/base-issues.store";
import type { IIssueRootStore } from "../root.store";
import type { IReleaseIssuesFilter } from "./filter.store";

export interface IReleaseIssues extends IBaseIssuesStore {
  viewFlags: ViewFlags;
  getIssueIds: (groupId?: string, subGroupId?: string) => string[] | undefined;
  fetchIssues: (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader,
    options: IssuePaginationOptions,
    releaseId: string,
    isExistingPaginationOptions?: boolean
  ) => Promise<TIssuesResponse | undefined>;
  fetchIssuesWithExistingPagination: (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader,
    releaseId: string
  ) => Promise<TIssuesResponse | undefined>;
  fetchNextIssues: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    groupId?: string,
    subGroupId?: string
  ) => Promise<TIssuesResponse | undefined>;
  createIssue: (workspaceSlug: string, projectId: string, data: Partial<TIssue>, releaseId: string) => Promise<TIssue>;
  updateIssue: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  archiveIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  quickAddIssue: (
    workspaceSlug: string,
    projectId: string,
    data: TIssue,
    releaseId: string
  ) => Promise<TIssue | undefined>;
  removeBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  archiveBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  bulkUpdateProperties: (workspaceSlug: string, projectId: string, data: TBulkOperationsPayload) => Promise<void>;
  addIssuesToRelease: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    issueIds: string[],
    fetchAddedIssues?: boolean
  ) => Promise<void>;
  removeIssuesFromRelease: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    issueIds: string[]
  ) => Promise<void>;
}

export class ReleaseIssues extends BaseIssuesStore implements IReleaseIssues {
  viewFlags = {
    enableQuickAdd: true,
    enableIssueCreation: true,
    enableInlineEditing: true,
  };
  issueFilterStore: IReleaseIssuesFilter;
  releaseService: ReleaseService;

  get releaseId() {
    return this.rootIssueStore.releaseId;
  }

  constructor(_rootStore: IIssueRootStore, issueFilterStore: IReleaseIssuesFilter) {
    super(_rootStore, issueFilterStore);
    makeObservable(this, {
      fetchIssues: action,
      fetchNextIssues: action,
      fetchIssuesWithExistingPagination: action,
      quickAddIssue: action,
      addIssuesToRelease: action,
      removeIssuesFromRelease: action,
    });
    this.issueFilterStore = issueFilterStore;
    this.releaseService = new ReleaseService();
  }

  fetchParentStats = (workspaceSlug: string, projectId?: string, id?: string) => {
    const releaseId = id ?? this.releaseId;
    projectId &&
      releaseId &&
      this.rootIssueStore.rootStore.release.fetchReleaseDetails(workspaceSlug, projectId, releaseId);
  };

  updateParentStats = (prevIssueState?: TIssue, nextIssueState?: TIssue, id?: string) => {
    try {
      const distributionUpdates = getDistributionPathsPostUpdate(
        prevIssueState,
        nextIssueState,
        this.rootIssueStore.rootStore.state.stateMap,
        this.rootIssueStore.rootStore.projectEstimate?.currentActiveEstimate?.estimatePointById
      );
      const releaseId = id ?? this.releaseId;
      releaseId && this.rootIssueStore.rootStore.release.updateReleaseDistribution(distributionUpdates, releaseId);
    } catch (_e) {
      console.warn("could not update release statistics");
    }
  };

  fetchIssues = async (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader,
    options: IssuePaginationOptions,
    releaseId: string,
    isExistingPaginationOptions: boolean = false
  ) => {
    try {
      runInAction(() => {
        this.setLoader(loadType);
        this.clear(!isExistingPaginationOptions);
      });

      const params = this.issueFilterStore?.getFilterParams(options, releaseId, undefined, undefined, undefined);
      const response = await this.releaseService.getReleaseIssues(workspaceSlug, projectId, releaseId, params, {
        signal: this.controller.signal,
      });

      this.onfetchIssues(response, options, workspaceSlug, projectId, releaseId, !isExistingPaginationOptions);
      return response;
    } catch (error) {
      this.setLoader(undefined);
      throw error;
    }
  };

  fetchNextIssues = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    groupId?: string,
    subGroupId?: string
  ) => {
    const cursorObject = this.getPaginationData(groupId, subGroupId);
    if (!this.paginationOptions || (cursorObject && !cursorObject?.nextPageResults)) return;
    try {
      this.setLoader("pagination", groupId, subGroupId);

      const params = this.issueFilterStore?.getFilterParams(
        this.paginationOptions,
        releaseId,
        this.getNextCursor(groupId, subGroupId),
        groupId,
        subGroupId
      );
      const response = await this.releaseService.getReleaseIssues(workspaceSlug, projectId, releaseId, params);

      this.onfetchNexIssues(response, groupId, subGroupId);
      return response;
    } catch (error) {
      this.setLoader(undefined, groupId, subGroupId);
      throw error;
    }
  };

  fetchIssuesWithExistingPagination = async (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader,
    releaseId: string
  ) => {
    if (!this.paginationOptions) return;
    return await this.fetchIssues(workspaceSlug, projectId, loadType, this.paginationOptions, releaseId, true);
  };

  override createIssue = async (workspaceSlug: string, projectId: string, data: Partial<TIssue>, releaseId: string) => {
    const response = await super.createIssue(workspaceSlug, projectId, data, releaseId, false);
    await this.releaseService.addIssuesToRelease(workspaceSlug, projectId, releaseId, { issues: [response.id] });
    runInAction(() => {
      this.addIssueToList(response.id);
    });
    await this.fetchParentStats(workspaceSlug, projectId, releaseId);
    return response;
  };

  quickAddIssue = async (workspaceSlug: string, projectId: string, data: TIssue, releaseId: string) => {
    try {
      this.addIssue(data);
      const response = await this.createIssue(workspaceSlug, projectId, data, releaseId);

      runInAction(() => {
        this.removeIssueFromList(data.id);
        this.rootIssueStore.issues.removeIssue(data.id);
      });

      const currentCycleId = data.cycle_id !== "" && data.cycle_id === "None" ? undefined : data.cycle_id;

      if (currentCycleId) {
        await this.addCycleToIssue(workspaceSlug, projectId, currentCycleId, response.id);
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  addIssuesToRelease = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    issueIds: string[],
    fetchAddedIssues = true
  ) => {
    await this.releaseService.addIssuesToRelease(workspaceSlug, projectId, releaseId, { issues: issueIds });
    if (fetchAddedIssues) await this.rootIssueStore.issues.getIssues(workspaceSlug, projectId, issueIds);
    if (this.releaseId === releaseId) {
      await this.fetchParentStats(workspaceSlug, projectId, releaseId);
      runInAction(() => {
        issueIds.forEach((issueId) => this.addIssueToList(issueId));
      });
    }
  };

  removeIssuesFromRelease = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    issueIds: string[]
  ) => {
    await this.releaseService.removeIssuesFromReleaseBulk(workspaceSlug, projectId, releaseId, issueIds);
    if (this.releaseId === releaseId) {
      await this.fetchParentStats(workspaceSlug, projectId, releaseId);
      runInAction(() => {
        issueIds.forEach((issueId) => this.removeIssueFromList(issueId));
      });
    }
  };

  archiveBulkIssues = this.bulkArchiveIssues;
  updateIssue = this.issueUpdate;
  archiveIssue = this.issueArchive;
}
