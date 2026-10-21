/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TStateGroups = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export interface IState {
  readonly id: string;
  color: string;
  default: boolean;
  description: string;
  group: TStateGroups;
  name: string;
  /** 状态所属方案的归属项目；跟随研发模式的项目共用模式方案的状态，此时为 null。按项目取状态请比 scheme_id */
  project_id: string;
  /** 所属工作项方案（TProject.issue_scheme） */
  scheme_id?: string | null;
  sequence: number;
  workspace_id: string;
  order: number;
  issue_type_id: string | null;
}

export interface IStateLite {
  color: string;
  group: TStateGroups;
  id: string;
  name: string;
}

export interface IStateResponse {
  [key: string]: IState[];
}

export type TStateOperationsCallbacks = {
  createState: (data: Partial<IState>) => Promise<IState>;
  updateState: (stateId: string, data: Partial<IState>) => Promise<IState | undefined>;
  deleteState: (stateId: string) => Promise<void>;
  moveStatePosition: (stateId: string, data: Partial<IState>) => Promise<void>;
  markStateAsDefault: (stateId: string) => Promise<void>;
};
