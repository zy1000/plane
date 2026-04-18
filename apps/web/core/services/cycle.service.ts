/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import { API_BASE_URL } from "@plane/constants";
import type {
  CycleDateCheckData,
  ICycle,
  TIssuesResponse,
  IWorkspaceActiveCyclesResponse,
  TCycleDistribution,
  TProgressSnapshot,
  TCycleEstimateDistribution,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class CycleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async workspaceActiveCyclesAnalytics(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    analytic_type: string = "points"
  ): Promise<TCycleDistribution | TCycleEstimateDistribution> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/analytics?type=${analytic_type}`
    )
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCyclesProgress(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TProgressSnapshot> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/progress/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCyclesProgressPro(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TProgressSnapshot> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-progress/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCycles(
    workspaceSlug: string,
    cursor: string,
    per_page: number
  ): Promise<IWorkspaceActiveCyclesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/active-cycles/`, {
      params: {
        per_page,
        cursor,
      },
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getWorkspaceCycles(workspaceSlug: string): Promise<ICycle[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/cycles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createCycle(workspaceSlug: string, projectId: string, data: any): Promise<ICycle> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCyclesWithParams(workspaceSlug: string, projectId: string, cycleType?: "current"): Promise<ICycle[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`, {
      params: {
        cycle_view: cycleType,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCyclesWithStatus(workspaceSlug: string, projectId: string, status: Array<string>): Promise<ICycle[]> {
    const query =
      Array.isArray(status) && status.length > 0 ? status.map((s) => `status=${encodeURIComponent(s)}`).join("&") : "";
    const url = `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${query ? `?${query}` : ""}`;
    return this.get(url)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleDetails(workspaceSlug: string, projectId: string, cycleId: string): Promise<ICycle> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getCycleIssues(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    queries?: any,
    config = {}
  ): Promise<TIssuesResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/`,
      {
        params: queries,
      },
      config
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchCycle(workspaceSlug: string, projectId: string, cycleId: string, data: Partial<ICycle>): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCycle(workspaceSlug: string, projectId: string, cycleId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cycleDateCheck(workspaceSlug: string, projectId: string, data: CycleDateCheckData): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/date-check/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addCycleToFavorites(
    workspaceSlug: string,
    projectId: string,
    data: {
      cycle: string;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-cycles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async transferIssues(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: {
      new_cycle_id: string;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/transfer-issues/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleFileList(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    queries?: { page?: number; page_size?: number }
  ): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/list/`, {
      params: {
        cycle_id: cycleId,
        ...queries,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadCycleFile(workspaceSlug: string, projectId: string, data: FormData): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/upload/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async downloadCycleFile(workspaceSlug: string, projectId: string, fileId: string): Promise<Blob> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/${fileId}/download/`,
      undefined,
      { responseType: "blob" }
    )
      .then((response) => response?.data as Blob)
      .catch(async (error) => {
        const raw = error?.response?.data;
        if (raw instanceof Blob) {
          const text = await raw.text();
          try {
            const parsed = JSON.parse(text) as { error?: string };
            throw parsed;
          } catch (e: unknown) {
            if (e && typeof e === "object" && e !== null && "error" in e) {
              throw e;
            }
            throw { error: text || "Download failed" };
          }
        }
        throw raw;
      });
  }

  async deleteCycleFile(workspaceSlug: string, projectId: string, fileId: string): Promise<any> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/${fileId}/delete/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeCycleFromFavorites(workspaceSlug: string, projectId: string, cycleId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-cycles/${cycleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleOverdueByAssignee(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TCycleOverdueByAssigneeResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/overdue-by-assignee/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export type TCycleOverdueAssigneeRow = {
  assignee_id: string | null;
  display_name: string;
  avatar_url: string;
  count: number;
};

export type TCycleOverdueByAssigneeResponse = {
  total: number;
  data: TCycleOverdueAssigneeRow[];
};
