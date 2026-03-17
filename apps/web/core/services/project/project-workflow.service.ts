/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TWorkflow = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  issue_type_id: string;
};

export type TWorkflowCreatePayload = Omit<TWorkflow, "id">;
export type TWorkflowUpdatePayload = Partial<TWorkflowCreatePayload> & { id: string };

export type TApprovalType = "any" | "all" | "n_of_m";

export type TWorkflowTransition = {
  id: string;
  workflow_id: string;
  from_state_id: string | null;
  to_state_id: string;
  approval_type: TApprovalType;
  required_count: number;
  approver_ids: string[];
};

export type TWorkflowTransitionCreatePayload = {
  workflow_id: string;
  from_state_id: string | null;
  to_state_id: string;
  approval_type: TApprovalType;
  required_count?: number;
  approver_ids?: string[];
};

export type TWorkflowTransitionUpdatePayload = {
  id: string;
  to_state_id?: string;
  approval_type?: TApprovalType;
  required_count?: number;
  approver_ids?: string[];
};

export class ProjectWorkflowService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchWorkflows(
    workspaceSlug: string,
    projectId: string,
    issueTypeId?: string
  ): Promise<TWorkflow[]> {
    const params = issueTypeId ? { issue_type_id: issueTypeId } : undefined;
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkflow(
    workspaceSlug: string,
    projectId: string,
    data: TWorkflowCreatePayload
  ): Promise<TWorkflow> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkflow(
    workspaceSlug: string,
    projectId: string,
    data: TWorkflowUpdatePayload
  ): Promise<TWorkflow> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkflow(
    workspaceSlug: string,
    projectId: string,
    workflowId: string
  ): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/`, undefined, {
      params: { id: workflowId },
    })
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // Workflow Transition CRUD

  async fetchTransitions(
    workspaceSlug: string,
    projectId: string,
    workflowId: string
  ): Promise<TWorkflowTransition[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${workflowId}/transitions/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createTransition(
    workspaceSlug: string,
    projectId: string,
    workflowId: string,
    data: TWorkflowTransitionCreatePayload
  ): Promise<TWorkflowTransition> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${workflowId}/transitions/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateTransition(
    workspaceSlug: string,
    projectId: string,
    workflowId: string,
    data: TWorkflowTransitionUpdatePayload
  ): Promise<TWorkflowTransition> {
    return this.put(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${workflowId}/transitions/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteTransition(
    workspaceSlug: string,
    projectId: string,
    workflowId: string,
    transitionId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${workflowId}/transitions/`,
      undefined,
      { params: { id: transitionId } }
    )
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
