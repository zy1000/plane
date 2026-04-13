import type { IRelease, ILinkDetails, ReleaseLink, TIssuesResponse } from "@plane/types";
import { APIService } from "../api.service";

export class ReleaseService extends APIService {
  async workspaceReleasesList(workspaceSlug: string): Promise<IRelease[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/releases/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async projectReleasesList(workspaceSlug: string, projectId: string): Promise<IRelease[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: any): Promise<IRelease> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, releaseId: string): Promise<IRelease> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, projectId: string, releaseId: string, data: Partial<IRelease>): Promise<IRelease> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, releaseId: string): Promise<any> {
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
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/release-links/`, data)
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

  async deleteReleaseLink(workspaceSlug: string, projectId: string, releaseId: string, linkId: string): Promise<any> {
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
}
