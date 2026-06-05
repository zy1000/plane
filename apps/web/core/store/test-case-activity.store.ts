import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TTestCaseActivity } from "@plane/types";
import { TestCaseActivityService } from "@/services/qa/test-case-activity.service";
import type { CoreRootStore } from "./root.store";

export interface ITestCaseActivityStore {
  activitiesByCaseId: Record<string, TTestCaseActivity[]>;
  loaderByCaseId: Record<string, boolean>;
  fetchedByCaseId: Record<string, boolean>;
  getActivitiesByCaseId: (caseId: string) => TTestCaseActivity[];
  isLoadingByCaseId: (caseId: string) => boolean;
  fetchActivities: (workspaceSlug: string, caseId: string) => Promise<TTestCaseActivity[]>;
}

export class TestCaseActivityStore implements ITestCaseActivityStore {
  activitiesByCaseId: Record<string, TTestCaseActivity[]> = {};
  loaderByCaseId: Record<string, boolean> = {};
  fetchedByCaseId: Record<string, boolean> = {};

  testCaseActivityService: TestCaseActivityService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      activitiesByCaseId: observable,
      loaderByCaseId: observable,
      fetchedByCaseId: observable,
      fetchActivities: action,
    });
    this.testCaseActivityService = new TestCaseActivityService();
  }

  getActivitiesByCaseId = computedFn(
    (caseId: string): TTestCaseActivity[] => this.activitiesByCaseId[caseId] ?? []
  );

  isLoadingByCaseId = computedFn((caseId: string): boolean => !!this.loaderByCaseId[caseId]);

  fetchActivities = async (workspaceSlug: string, caseId: string): Promise<TTestCaseActivity[]> => {
    runInAction(() => {
      this.loaderByCaseId[caseId] = true;
    });
    try {
      const response = await this.testCaseActivityService.getActivities(workspaceSlug, caseId);
      const list = response?.data ?? [];
      const sorted = [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      runInAction(() => {
        this.activitiesByCaseId[caseId] = sorted;
        this.fetchedByCaseId[caseId] = true;
      });
      return sorted;
    } finally {
      runInAction(() => {
        this.loaderByCaseId[caseId] = false;
      });
    }
  };
}
