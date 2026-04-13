import { API_BASE_URL } from "@plane/constants";
import type { IRelease, ILinkDetails, ReleaseLink, TIssuesResponse } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ReleaseService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getReleases(workspaceSlug: string, projectId: string): Promise<IRelease[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRelease(workspaceSlug: string, projectId: string, data: any): Promise<IRelease> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRelease(workspaceSlug: string, projectId: string, releaseId: string, data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReleaseDetails(workspaceSlug: string, projectId: string, releaseId: string): Promise<IRelease> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchRelease(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<IRelease>
  ): Promise<IRelease> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRelease(workspaceSlug: string, projectId: string, releaseId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReleaseIssues(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    queries?: any,
    config = {}
  ): Promise<TIssuesResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/issues/`,
      { params: queries },
      config
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addIssuesToRelease(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: { issues: string[] }
  ): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/issues/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addReleasesToIssue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { releases: string[]; removed_releases?: string[] }
  ): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/releases/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeIssuesFromReleaseBulk(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    issueIds: string[]
  ): Promise<void> {
    const promiseDataUrls: any = [];
    issueIds.forEach((issueId) => {
      promiseDataUrls.push(
        this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/issues/${issueId}/`)
      );
    });
    await Promise.all(promiseDataUrls)
      .then((response) => response)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeReleasesFromIssueBulk(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    releaseIds: string[]
  ): Promise<void> {
    const promiseDataUrls: any = [];
    releaseIds.forEach((releaseId) => {
      promiseDataUrls.push(
        this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/issues/${issueId}/`)
      );
    });
    await Promise.all(promiseDataUrls)
      .then((response) => response)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createReleaseLink(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<ReleaseLink>
  ): Promise<ILinkDetails> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/release-links/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async updateReleaseLink(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    linkId: string,
    data: Partial<ReleaseLink>
  ): Promise<ILinkDetails> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/release-links/${linkId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async deleteReleaseLink(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    linkId: string
  ): Promise<any> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/release-links/${linkId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addReleaseToFavorites(
    workspaceSlug: string,
    projectId: string,
    data: { release: string }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-releases/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeReleaseFromFavorites(workspaceSlug: string, projectId: string, releaseId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-releases/${releaseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getArchivedReleases(workspaceSlug: string, projectId: string): Promise<IRelease[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/archived-releases/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getArchivedReleaseDetails(
    workspaceSlug: string,
    projectId: string,
    releaseId: string
  ): Promise<IRelease> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/archived-releases/${releaseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async archiveRelease(
    workspaceSlug: string,
    projectId: string,
    releaseId: string
  ): Promise<{
    archived_at: string;
  }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/archive/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async restoreRelease(workspaceSlug: string, projectId: string, releaseId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/archive/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleList(workspaceSlug: string, projectId: string, releaseId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/cycles/`, {
      params: { release_id: releaseId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async selectCycleList(
    workspaceSlug: string,
    projectId: string,
    queries?: { page?: number; page_size?: number }
  ): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/select-cycle-list/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async associateCycle(
    workspaceSlug: string,
    projectId: string,
    data: { release_id: string; cycle_id: string }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/associate-cycle/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cancelCycleAssociation(
    workspaceSlug: string,
    projectId: string,
    data: { release_id: string; cycle_id: string }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/cancel-cycle/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReleasePlans(workspaceSlug: string, projectId: string, releaseId: string): Promise<any[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/plans/`, {
      params: { release_id: releaseId },
    })
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReleaseStatistics(workspaceSlug: string, projectId: string, releaseId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/statistics/`, {
      params: { release_id: releaseId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateNote(workspaceSlug: string, projectId: string, releaseId: string, note: string): Promise<any> {
    const data = { release_id: releaseId, note: note };
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/note/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadReleaseFile(workspaceSlug: string, projectId: string, data: FormData): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/file/upload/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReleaseFileList(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    queries?: { page?: number; page_size?: number }
  ): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/file/list/`, {
      params: { release_id: releaseId, ...queries },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteReleaseFile(workspaceSlug: string, projectId: string, fileId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release/file/${fileId}/delete/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async downloadReleaseFile(workspaceSlug: string, projectId: string, fileId: string): Promise<Blob> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/release/file/${fileId}/download/`,
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
}
