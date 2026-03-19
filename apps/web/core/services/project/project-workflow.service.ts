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

export type TApprovalRecord = {
  id: string;
  approver_id: string;
  approver_display_name: string;
  approver_avatar_url: string | null;
  action: "approved" | "rejected" | null;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type TTransitionRecord = {
  id: string;
  issue_id: string;
  issue_sequence_id: number;
  issue_name: string;
  from_state_id: string | null;
  from_state_name: string | null;
  from_state_color: string | null;
  from_state_group: string | null;
  to_state_id: string | null;
  to_state_name: string | null;
  to_state_color: string | null;
  to_state_group: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  required_count: number | null;
  approval_records: TApprovalRecord[];
  created_at: string;
  completed_at: string | null;
};

export type TMyApprovalsResponse = {
  results: TTransitionRecord[];
  pending_count: number;
};

export type TApprovalActionPayload = {
  action: "approved" | "rejected";
  comment?: string;
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

  // Approval APIs

  async fetchMyApprovals(
    workspaceSlug: string,
    projectId: string,
    tab: "pending" | "processed" = "pending"
  ): Promise<TMyApprovalsResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/my-approvals/`,
      { params: { tab } }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchIssueApprovals(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TMyApprovalsResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/my-approvals/`,
      { params: { tab: "pending", issue_id: issueId } }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchIssuePendingRecords(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TTransitionRecord[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/transition-records/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchTransitionRecord(
    workspaceSlug: string,
    projectId: string,
    recordId: string
  ): Promise<TTransitionRecord> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/transition-records/${recordId}/action/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async submitApprovalAction(
    workspaceSlug: string,
    projectId: string,
    recordId: string,
    data: TApprovalActionPayload
  ): Promise<TTransitionRecord> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/transition-records/${recordId}/action/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
