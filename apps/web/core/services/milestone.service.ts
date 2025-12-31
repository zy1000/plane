// services
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
// types
import type { TIssuesResponse } from "@plane/types";

export interface IMilestone {
  id: string;
  name: string;
  description: string;
  state?: string | null;
  state_color?: string | null;
  project_id?: string;
  start_date: string | null;
  end_date: string | null;
  completion_rate?: string;
  issues?: string[];
  project?: string;
}

export class MilestoneService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getMilestones(
    workspaceSlug: string,
    projectId: string,
    page: number,
    page_size: number,
    filters?: {
      name__icontains?: string;
      state__in?: string;
    }
  ): Promise<IMilestone[]> {
    const params = {
      page,
      page_size,
      ...(filters?.name__icontains ? { name__icontains: filters.name__icontains } : {}),
      ...(filters?.state__in ? { state__in: filters.state__in } : {}),
    };
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestone/`, {
      params,
    })  
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createMilestone(workspaceSlug: string, projectId: string, data: Partial<IMilestone>): Promise<IMilestone> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestone/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateMilestone(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    data: Partial<IMilestone>
  ): Promise<IMilestone> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestone/`, {
      ...data,
      id: milestoneId,
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async deleteMilestone(workspaceSlug: string, projectId: string, milestoneId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestone/`, {
      id: milestoneId,
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getMilestoneIssues(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    page: number,
    page_size: number
  ): Promise<TIssuesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestone/issues/`, {
      params: {
        milestone_id: milestoneId,
        page,
        page_size,
      },
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getUnselectedIssues(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    page: number,
    page_size: number,
    filters?: {
      type_id?: string;
      name?: string;
    }
  ): Promise<any[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestone/unselect/`, {
      params: {
        milestone_id: milestoneId,
        page,
        page_size,
        ...(filters?.type_id ? { type_id: filters.type_id } : {}),
        ...(filters?.name ? { name: filters.name } : {}),
      },
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async addMilestoneIssue(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueId: string
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestone/add-milestone-issue/`, {
      milestone_id: milestoneId,
      issue_id: issueId,
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async removeMilestoneIssue(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueId: string
  ): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestone/delete-milestone-issue/`, {
      milestone_id: milestoneId,
      issue_id: issueId,
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
