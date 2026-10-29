/**
 * 项目阶段池，供迭代 / 工作项的「阶段」属性共用：下拉候选、列表分组列、筛选项、表格列回显都从这一份读。
 *
 * 阶段页自己的 useProjectStages 是组件内 state，issue-layouts 的分组列在非 hook 环境（store 单例）
 * 里拿不到，所以照 project-product.store 另起一份；阶段页增删改后通过 setProjectStages 同步进来。
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TProjectStage } from "@plane/types";
import { orderProjectStages } from "@/components/project-stages/project-stage-rows";
import { ProjectStageService } from "@/services/project-stage.service";
import type { CoreRootStore } from "./root.store";

export type TProjectStageOption = { stage: TProjectStage; depth: number };

export interface IProjectStageStore {
  stageMap: Record<string, TProjectStage>;
  /** 树先序（父在前、子紧跟），下拉 / 分组列直接按这个顺序出 */
  stageIdsByProject: Record<string, string[]>;
  // computed actions
  getStageById: (stageId: string) => TProjectStage | null;
  /** 还没拉过返回 null，拉过但没有阶段返回 [] */
  getProjectStageIds: (projectId: string) => string[] | null;
  getProjectStageOptions: (projectId: string) => TProjectStageOption[];
  getStageDepth: (stageId: string) => number;
  // actions
  fetchStages: (workspaceSlug: string, projectId: string) => Promise<TProjectStage[]>;
  setProjectStages: (projectId: string, stages: TProjectStage[]) => void;
  /** 阶段删掉后：从候选里去掉，并把缓存里挂着它的迭代 / 工作项置空（项目内切页不会重拉迭代） */
  clearDeletedStage: (projectId: string, stageId: string) => void;
}

export class ProjectStageStore implements IProjectStageStore {
  stageMap: Record<string, TProjectStage> = {};
  stageIdsByProject: Record<string, string[]> = {};
  private depthById: Record<string, number> = {};
  // 进行中的请求去重：分组列 / 下拉 / 筛选可能同时触发
  private pending: Record<string, Promise<TProjectStage[]>> = {};

  service: ProjectStageService;
  rootStore: CoreRootStore;

  constructor(rootStore: CoreRootStore) {
    makeObservable(this, {
      stageMap: observable,
      stageIdsByProject: observable,
      fetchStages: action,
      setProjectStages: action,
      clearDeletedStage: action,
    });
    this.rootStore = rootStore;
    this.service = new ProjectStageService();
  }

  getStageById = computedFn((stageId: string) => this.stageMap[stageId] ?? null);

  getProjectStageIds = computedFn((projectId: string) => this.stageIdsByProject[projectId] ?? null);

  getProjectStageOptions = computedFn((projectId: string): TProjectStageOption[] =>
    (this.stageIdsByProject[projectId] ?? [])
      .map((id) => this.stageMap[id])
      .filter(Boolean)
      .map((stage) => ({ stage, depth: this.depthById[stage.id] ?? 0 }))
  );

  getStageDepth = computedFn((stageId: string) => this.depthById[stageId] ?? 0);

  setProjectStages = (projectId: string, stages: TProjectStage[]) => {
    const ordered = orderProjectStages(stages);
    runInAction(() => {
      const previous = this.stageIdsByProject[projectId] ?? [];
      previous.forEach((id) => {
        delete this.stageMap[id];
        delete this.depthById[id];
      });
      ordered.forEach(({ stage, depth }) => {
        this.stageMap[stage.id] = stage;
        this.depthById[stage.id] = depth;
      });
      this.stageIdsByProject[projectId] = ordered.map(({ stage }) => stage.id);
    });
  };

  clearDeletedStage = (projectId: string, stageId: string) => {
    runInAction(() => {
      delete this.stageMap[stageId];
      delete this.depthById[stageId];
      this.stageIdsByProject[projectId] = (this.stageIdsByProject[projectId] ?? []).filter((id) => id !== stageId);
      Object.values(this.rootStore.cycle.cycleMap ?? {}).forEach((cycle) => {
        if (cycle?.stage_id === stageId) cycle.stage_id = null;
      });
      Object.values(this.rootStore.issue.issues.issuesMap ?? {}).forEach((issue) => {
        if (issue?.stage_id === stageId) issue.stage_id = null;
      });
    });
  };

  fetchStages = async (workspaceSlug: string, projectId: string) => {
    const key = `${workspaceSlug}/${projectId}`;
    if (this.pending[key]) return this.pending[key];
    const request = this.service
      .list(workspaceSlug, projectId)
      .then((stages) => {
        this.setProjectStages(projectId, stages);
        return stages;
      })
      .finally(() => {
        delete this.pending[key];
      });
    this.pending[key] = request;
    return request;
  };
}
