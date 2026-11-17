/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, groupBy } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import type { IIntakeState, IState } from "@plane/types";
// helpers
import { sortStates } from "@plane/utils";
// plane web
import { ProjectStateService } from "@/services/project/project-state.service";
import { getSchemeIdFromScopeKey } from "@/services/project/issue-scheme-scope";
import type { RootStore } from "@/plane-web/store/root.store";

export interface IStateStore {
  //Loaders
  fetchedMap: Record<string, boolean>;
  fetchedIntakeMap: Record<string, boolean>;
  // observables
  stateMap: Record<string, IState>;
  intakeStateMap: Record<string, IIntakeState>;
  // computed
  workspaceStates: IState[] | undefined;
  projectStates: IState[] | undefined;
  groupedProjectStates: Record<string, IState[]> | undefined;
  // computed actions
  getStateById: (stateId: string | null | undefined) => IState | undefined;
  getIntakeStateById: (intakeStateId: string | null | undefined) => IIntakeState | undefined;
  getProjectStates: (projectId: string | null | undefined) => IState[] | undefined;
  getProjectStatesByIssueTypeId: (
    projectId: string | null | undefined,
    issueTypeId: string | null | undefined
  ) => IState[] | undefined;
  getProjectStateIdsByIssueTypeId: (
    projectId: string | null | undefined,
    issueTypeId: string | null | undefined
  ) => string[] | undefined;
  getGroupedProjectStatesByIssueTypeId: (
    projectId: string | null | undefined,
    issueTypeId: string | null | undefined
  ) => Record<string, IState[]> | undefined;
  getProjectIntakeState: (projectId: string | null | undefined) => IIntakeState | undefined;
  getProjectStateIds: (projectId: string | null | undefined) => string[] | undefined;
  getProjectIntakeStateIds: (projectId: string | null | undefined) => string[] | undefined;
  /** 返回项目内 state_name -> state_ids 的映射（同名状态归组） */
  getProjectStateNameToIdsMap: (projectId: string | null | undefined) => Map<string, string[]>;
  getProjectDefaultStateId: (projectId: string | null | undefined) => string | undefined;
  getDefaultStateIdByIssueTypeId: (
    projectId: string | null | undefined,
    issueTypeId: string | null | undefined
  ) => string | undefined;
  // fetch actions
  fetchProjectStates: (workspaceSlug: string, projectId: string, issueTypeId?: string | null) => Promise<IState[]>;
  fetchProjectIntakeState: (workspaceSlug: string, projectId: string) => Promise<IIntakeState>;
  fetchWorkspaceStates: (workspaceSlug: string) => Promise<IState[]>;
  // crud actions
  createState: (workspaceSlug: string, projectId: string, data: Partial<IState>) => Promise<IState>;
  updateState: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    data: Partial<IState>
  ) => Promise<IState | undefined>;
  deleteState: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    options?: { deleteViews?: boolean }
  ) => Promise<void>;
  markStateAsDefault: (workspaceSlug: string, projectId: string, stateId: string) => Promise<void>;
  moveStatePosition: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    payload: Partial<IState>
  ) => Promise<void>;

  getStatePercentageInGroup: (stateId: string | null | undefined) => number | undefined;
}

export class StateStore implements IStateStore {
  stateMap: Record<string, IState> = {};
  intakeStateMap: Record<string, IIntakeState> = {};
  //loaders
  fetchedMap: Record<string, boolean> = {};
  fetchedIntakeMap: Record<string, boolean> = {};
  rootStore: RootStore;
  router;
  stateService: ProjectStateService;

  constructor(_rootStore: RootStore) {
    makeObservable(this, {
      // observables
      stateMap: observable,
      intakeStateMap: observable,
      fetchedMap: observable,
      fetchedIntakeMap: observable,
      // computed
      stateBuckets: computed({ keepAlive: true }),
      workspaceStates: computed,
      projectStates: computed,
      groupedProjectStates: computed,
      // fetch action
      fetchProjectStates: action,
      fetchProjectIntakeState: action,
      // CRUD actions
      createState: action,
      updateState: action,
      deleteState: action,
      // state actions
      markStateAsDefault: action,
      moveStatePosition: action,
    });
    this.stateService = new ProjectStateService();
    this.router = _rootStore.router;
    this.rootStore = _rootStore;
  }

  /**
   * 状态按所属方案、按归属项目各分好组，组内顺序与 stateMap 一致。
   * 能看全部项目的人这里有两万多条状态，而 getProjectStates 等读取方法同时被几十个组件订阅：
   * 让每个读取方法各自把全量扫一遍的话，新增一个状态就要卡一两秒。分组只在 stateMap 变化后重算一次
   * （keepAlive：事件回调、action 里的读取不在观察者上下文，也要能用上这份缓存）。
   */
  get stateBuckets() {
    const byScheme = new Map<string, IState[]>();
    const byProject = new Map<string, IState[]>();
    const add = (buckets: Map<string, IState[]>, key: string | null | undefined, state: IState) => {
      if (!key) return;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(state);
      else buckets.set(key, [state]);
    };
    for (const state of Object.values(this.stateMap)) {
      add(byScheme, state.scheme_id, state);
      add(byProject, state.project_id, state);
    }
    return { byScheme, byProject };
  }

  /**
   * Returns the stateMap belongs to a specific workspace
   */
  get workspaceStates() {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!workspaceSlug || !this.fetchedMap[workspaceSlug]) return;
    return sortStates(Object.values(this.stateMap));
  }

  /**
   * Returns the stateMap belongs to a specific project
   */
  get projectStates() {
    const projectId = this.router.projectId;
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return sortStates(this.getStatesOfProject(projectId));
  }

  /**
   * Returns the stateMap belongs to a specific project grouped by group
   */
  get groupedProjectStates() {
    if (!this.router.projectId) return;

    // First group the existing states
    const groupedStates = groupBy(this.projectStates, "group") as Record<string, IState[]>;

    // Ensure all STATE_GROUPS are present
    const allGroups = Object.keys(STATE_GROUPS).reduce(
      (acc, group) => ({
        ...acc,
        [group]: groupedStates[group] || [],
      }),
      {} as Record<string, IState[]>
    );

    return allGroups;
  }

  /**
   * 状态是否属于某个项目。状态归工作项方案，跟随研发模式的项目共用工作区的类型库，
   * 所以按项目所用的方案（TProject.issue_scheme）比 scheme_id，再按 visible_issue_type_ids 去掉模式没关联的类型；
   * 项目信息还没加载时退回比 project_id（项目自定义时两者等价）。
   */
  private isStateOfProject = (
    state: { scheme_id?: string | null; project_id: string; issue_type_id?: string | null },
    projectId: string
  ) => {
    // 模板中心的方案作用域（`scheme:<id>`）：直接比方案
    const scopedSchemeId = getSchemeIdFromScopeKey(projectId);
    if (scopedSchemeId) return state.scheme_id === scopedSchemeId;
    const project = this.rootStore.projectRoot.project.getProjectById(projectId);
    const schemeId = project?.issue_scheme;
    if (schemeId && state.scheme_id) {
      if (state.scheme_id !== schemeId) return false;
      // 跟随研发模式：类型库被多个模式共用，只算所属模式关联了的类型的状态（triage 没有类型，照算）
      const visibleTypeIds = project?.visible_issue_type_ids;
      if (Array.isArray(visibleTypeIds) && state.issue_type_id) return visibleTypeIds.includes(state.issue_type_id);
      return true;
    }
    return state.project_id === projectId;
  };

  /**
   * 属于某个项目（或 `scheme:<id>` 方案作用域）的状态，顺序与 stateMap 一致，每次返回新数组。
   * 先从 stateBuckets 缩到候选，归属规则仍只在 isStateOfProject 一处。
   */
  private getStatesOfProject = (projectId: string): IState[] => {
    const { byScheme, byProject } = this.stateBuckets;
    const schemeId =
      getSchemeIdFromScopeKey(projectId) ?? this.rootStore.projectRoot.project.getProjectById(projectId)?.issue_scheme;
    // 状态都带 scheme_id（后端非空）。项目信息还没加载时不知道它用哪个方案，退回按归属项目取
    const candidates = (schemeId ? byScheme.get(schemeId) : byProject.get(projectId)) ?? [];
    return candidates.filter((state) => this.isStateOfProject(state, projectId));
  };

  /**
   * @description returns state details using state id
   * @param stateId
   */
  getStateById = computedFn((stateId: string | null | undefined) => {
    if (!this.stateMap || !stateId) return;
    return this.stateMap[stateId] ?? undefined;
  });

  /**
   * @description returns intake state details using intake state id
   * @param intakeStateId
   */
  getIntakeStateById = computedFn((intakeStateId: string | null | undefined) => {
    if (!this.intakeStateMap || !intakeStateId) return;
    return this.intakeStateMap[intakeStateId] ?? undefined;
  });

  /**
   * Returns the stateMap belongs to a project by projectId
   * @param projectId
   * @returns IState[]
   */
  getProjectStates = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return sortStates(this.getStatesOfProject(projectId));
  });

  /**
   * Returns states for a project filtered by issueTypeId
   * @param projectId
   * @param issueTypeId
   * @returns IState[] | undefined
   */
  getProjectStatesByIssueTypeId = computedFn(
    (projectId: string | null | undefined, issueTypeId: string | null | undefined) => {
      const workspaceSlug = this.router.workspaceSlug || "";
      if (!projectId) return undefined;
      const cacheKey = issueTypeId ? `${projectId}:${issueTypeId}` : projectId;
      if (!(this.fetchedMap[cacheKey] || this.fetchedMap[workspaceSlug])) return undefined;
      return sortStates(this.getStatesOfProject(projectId).filter((state) => state.issue_type_id === issueTypeId));
    }
  );

  /**
   * Returns state ids for a project filtered by issueTypeId
   * @param projectId
   * @param issueTypeId
   * @returns string[] | undefined
   */
  getProjectStateIdsByIssueTypeId = computedFn(
    (projectId: string | null | undefined, issueTypeId: string | null | undefined) => {
      const states = this.getProjectStatesByIssueTypeId(projectId, issueTypeId);
      return states?.map((state) => state.id);
    }
  );

  /**
   * Returns states for a project filtered by issueTypeId, grouped by state group
   * @param projectId
   * @param issueTypeId
   * @returns Record<string, IState[]> | undefined
   */
  getGroupedProjectStatesByIssueTypeId = computedFn(
    (projectId: string | null | undefined, issueTypeId: string | null | undefined) => {
      const states = this.getProjectStatesByIssueTypeId(projectId, issueTypeId);
      if (!states) return undefined;

      const groupedStates = groupBy(states, "group") as Record<string, IState[]>;
      return Object.keys(STATE_GROUPS).reduce(
        (acc, group) => ({
          ...acc,
          [group]: groupedStates[group] || [],
        }),
        {} as Record<string, IState[]>
      );
    }
  );

  /**
   * Returns a map of state name -> state IDs for a project
   * Used for deduplicating same-named states across issue types
   * @param projectId
   * @returns Map<string, string[]>
   */
  getProjectStateNameToIdsMap = computedFn((projectId: string | null | undefined): Map<string, string[]> => {
    const states = this.getProjectStates(projectId);
    const map = new Map<string, string[]>();
    for (const state of states ?? []) {
      const ids = map.get(state.name) ?? [];
      ids.push(state.id);
      map.set(state.name, ids);
    }
    return map;
  });

  /**
   * Returns the intake state for a project by projectId
   * @param projectId
   * @returns IIntakeState | undefined
   */
  getProjectIntakeState = computedFn((projectId: string | null | undefined) => {
    if (!projectId || !this.fetchedIntakeMap[projectId]) return;
    return Object.values(this.intakeStateMap).find((state) => this.isStateOfProject(state, projectId));
  });

  /**
   * Returns the state ids for a project by projectId
   * @param projectId
   * @returns string[]
   */
  getProjectStateIds = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug;
    if (!workspaceSlug || !projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug]))
      return undefined;
    const projectStates = this.getProjectStates(projectId);
    return projectStates?.map((state) => state.id) ?? [];
  });

  /**
   * Returns the intake state ids for a project by projectId
   * @param projectId
   * @returns string[]
   */
  getProjectIntakeStateIds = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug;
    if (!workspaceSlug || !projectId || !this.fetchedIntakeMap[projectId]) return undefined;
    const projectIntakeState = this.getProjectIntakeState(projectId);
    return projectIntakeState?.id ? [projectIntakeState.id] : [];
  });

  /**
   * Returns the default state id for a project
   * @param projectId
   * @returns string | undefined
   */
  getProjectDefaultStateId = computedFn((projectId: string | null | undefined) => {
    const projectStates = this.getProjectStates(projectId);
    return projectStates?.find((state) => state.default)?.id;
  });

  getDefaultStateIdByIssueTypeId = computedFn(
    (projectId: string | null | undefined, issueTypeId: string | null | undefined) => {
      const states = this.getProjectStatesByIssueTypeId(projectId, issueTypeId);
      return states?.find((state) => state.default)?.id ?? states?.[0]?.id;
    }
  );

  /**
   * fetches the stateMap of a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchProjectStates = async (workspaceSlug: string, projectId: string, issueTypeId?: string | null) => {
    const statesResponse = await this.stateService.getStates(workspaceSlug, projectId, issueTypeId);
    runInAction(() => {
      statesResponse.forEach((state) => {
        set(this.stateMap, [state.id], state);
      });
      const cacheKey = issueTypeId ? `${projectId}:${issueTypeId}` : projectId;
      set(this.fetchedMap, cacheKey, true);
    });
    return statesResponse;
  };

  /**
   * fetches the intakeStateMap of a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchProjectIntakeState = async (workspaceSlug: string, projectId: string) => {
    const intakeStateResponse = await this.stateService.getIntakeState(workspaceSlug, projectId);
    runInAction(() => {
      set(this.intakeStateMap, [intakeStateResponse.id], intakeStateResponse);
      set(this.fetchedIntakeMap, projectId, true);
    });
    return intakeStateResponse;
  };

  /**
   * fetches the stateMap of all the states in workspace
   * @param workspaceSlug
   * @returns
   */
  fetchWorkspaceStates = async (workspaceSlug: string) => {
    const statesResponse = await this.stateService.getWorkspaceStates(workspaceSlug);
    runInAction(() => {
      statesResponse.forEach((state) => {
        set(this.stateMap, [state.id], state);
      });
      set(this.fetchedMap, workspaceSlug, true);
    });
    return statesResponse;
  };

  /**
   * creates a new state in a project and adds it to the store
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns
   */
  createState = async (workspaceSlug: string, projectId: string, data: Partial<IState>) =>
    await this.stateService.createState(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.stateMap, [response?.id], response);
      });
      return response;
    });

  /**
   * Updates the state details in the store, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param data
   * @returns
   */
  updateState = async (workspaceSlug: string, projectId: string, stateId: string, data: Partial<IState>) => {
    const originalState = this.stateMap[stateId];
    try {
      runInAction(() => {
        set(this.stateMap, [stateId], { ...this.stateMap?.[stateId], ...data });
      });
      const response = await this.stateService.patchState(workspaceSlug, projectId, stateId, data);
      return response;
    } catch (error) {
      runInAction(() => {
        this.stateMap = {
          ...this.stateMap,
          [stateId]: originalState,
        };
      });
      throw error;
    }
  };

  /**
   * deletes the state from the store, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   */
  deleteState = async (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    options?: { deleteViews?: boolean }
  ) => {
    if (!this.stateMap?.[stateId]) return;
    await this.stateService.deleteState(workspaceSlug, projectId, stateId, options).then(() => {
      runInAction(() => {
        delete this.stateMap[stateId];
      });
    });
  };

  /**
   * marks a state as default in a project
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   */
  markStateAsDefault = async (workspaceSlug: string, projectId: string, stateId: string) => {
    const targetState = this.stateMap[stateId];
    const issueTypeId = targetState?.issue_type_id ?? null;
    const currentDefaultState = this.getStatesOfProject(projectId).find(
      (state) => state.default && state.issue_type_id === issueTypeId
    );
    // 快照受影响的 state 对象（勿复用 stateMap 引用，否则 set() 就地修改后无法回滚）
    const snapshot: Record<string, IState> = {};
    if (currentDefaultState) snapshot[currentDefaultState.id] = { ...this.stateMap[currentDefaultState.id] };
    snapshot[stateId] = { ...this.stateMap[stateId] };
    try {
      runInAction(() => {
        if (currentDefaultState) set(this.stateMap, [currentDefaultState.id, "default"], false);
        set(this.stateMap, [stateId, "default"], true);
      });
      await this.stateService.markDefault(workspaceSlug, projectId, stateId, issueTypeId);
    } catch (error) {
      runInAction(() => {
        for (const [id, state] of Object.entries(snapshot)) {
          set(this.stateMap, [id], state);
        }
      });
      throw error;
    }
  };

  /**
   * updates the sort order of a state and updates the state information using API, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param direction
   * @param groupIndex
   */
  moveStatePosition = async (workspaceSlug: string, projectId: string, stateId: string, payload: Partial<IState>) => {
    const originalState = this.stateMap[stateId] ? { ...this.stateMap[stateId] } : undefined;
    try {
      Object.entries(payload).forEach(([key, value]) => {
        runInAction(() => {
          set(this.stateMap, [stateId, key], value);
        });
      });
      // updating using api
      await this.stateService.patchState(workspaceSlug, projectId, stateId, payload);
    } catch (error) {
      runInAction(() => {
        if (originalState) {
          this.stateMap = {
            ...this.stateMap,
            [stateId]: originalState,
          };
        }
      });
      throw error;
    }
  };

  /**
   * Returns the percentage position of a state within its group based on sequence
   * @param stateId The ID of the state to find the percentage for
   * @returns The percentage position of the state in its group (0-100), or -1 if not found
   */
  getStatePercentageInGroup = computedFn((stateId: string | null | undefined) => {
    if (!stateId || !this.stateMap[stateId]) return -1;

    const state = this.stateMap[stateId];
    const group = state.group;

    if (!group || !this.groupedProjectStates || !this.groupedProjectStates[group]) return -1;

    // Get all states in the same group
    const statesInGroup = this.groupedProjectStates[group];
    const stateIndex = statesInGroup.findIndex((s) => s.id === stateId);

    if (stateIndex === -1) return undefined;

    // Calculate percentage: ((index + 1) / totalLength) * 100
    return ((stateIndex + 1) / statesInGroup.length) * 100;
  });
}
