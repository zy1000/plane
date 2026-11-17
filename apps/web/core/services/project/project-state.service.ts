/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import { API_BASE_URL } from "@plane/constants";
import type { IIntakeState, IState } from "@plane/types";
import { APIService } from "@/services/api.service";
import { issueConfigBasePath } from "@/services/project/issue-scheme-scope";
// helpers
// types

/**
 * 工作区全量状态的线上格式。工作区下有几万个状态，但方案、类型、「名称 / 颜色 / 分组 / 描述」都大量重复，
 * 后端把重复的值各输出一次，状态行里只放下标（见后端 build_workspace_states_payload）。
 */
type TWorkspaceStatesResponse = {
  /** 没有任何状态时为 null */
  workspace_id: IState["workspace_id"] | null;
  schemes: [schemeId: string, projectId: IState["project_id"]][];
  issue_types: string[];
  definitions: [name: string, color: string, group: IState["group"], description: string][];
  states: [
    id: string,
    scheme: number,
    issueType: number | null,
    definition: number,
    isDefault: boolean,
    sequence: number,
    order: number,
  ][];
};

/** 把工作区全量状态的线上格式还原成完整的状态对象，字段与单个项目的状态接口一致。 */
const hydrateWorkspaceStates = (response: TWorkspaceStatesResponse): IState[] => {
  const { workspace_id: workspaceId, schemes, issue_types: issueTypes, definitions } = response;
  if (!workspaceId) return [];
  return response.states.map(([id, scheme, issueType, definition, isDefault, sequence, order]) => {
    const [schemeId, projectId] = schemes[scheme];
    const [name, color, group, description] = definitions[definition];
    return {
      id,
      project_id: projectId,
      scheme_id: schemeId,
      workspace_id: workspaceId,
      name,
      color,
      group,
      default: isDefault,
      description,
      sequence,
      order,
      issue_type_id: issueType === null ? null : issueTypes[issueType],
    };
  });
};

export class ProjectStateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async createState(workspaceSlug: string, projectId: string, data: any): Promise<IState> {
    return this.post(`${issueConfigBasePath(workspaceSlug, projectId)}/states/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async markDefault(workspaceSlug: string, projectId: string, stateId: string, issueTypeId: string | null): Promise<void> {
    return this.post(`${issueConfigBasePath(workspaceSlug, projectId)}/states/${stateId}/mark-default/`, {
      issue_type_id: issueTypeId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getStates(workspaceSlug: string, projectId: string, issueTypeId?: string | null): Promise<IState[]> {
    const params = issueTypeId ? { issue_type_id: issueTypeId } : undefined;
    return this.get(`${issueConfigBasePath(workspaceSlug, projectId)}/states/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIntakeState(workspaceSlug: string, projectId: string): Promise<IIntakeState> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-state/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getState(workspaceSlug: string, projectId: string, stateId: string): Promise<any> {
    return this.get(`${issueConfigBasePath(workspaceSlug, projectId)}/states/${stateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateState(workspaceSlug: string, projectId: string, stateId: string, data: IState): Promise<any> {
    return this.put(`${issueConfigBasePath(workspaceSlug, projectId)}/states/${stateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchState(workspaceSlug: string, projectId: string, stateId: string, data: Partial<IState>): Promise<any> {
    return this.patch(`${issueConfigBasePath(workspaceSlug, projectId)}/states/${stateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** deleteViews：模式方案里用到它的研发模式视图一起删；不传则只从视图条件里去掉它 */
  async deleteState(
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    options?: { deleteViews?: boolean }
  ): Promise<any> {
    return this.delete(
      `${issueConfigBasePath(workspaceSlug, projectId)}/states/${stateId}/`,
      undefined,
      options?.deleteViews ? { params: { delete_views: "true" } } : {}
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getWorkspaceStates(workspaceSlug: string): Promise<IState[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/states/`)
      .then((response) => hydrateWorkspaceStates(response?.data))
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
