import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type { IChangelogFormPayload, IChangelogItem, IChangelogListParams, IChangelogListResponse } from "../types";

export class ChangelogService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getChangelogList(params: IChangelogListParams = {}): Promise<IChangelogListResponse> {
    return this.get("/api/changelog/", { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLatestChangelog(): Promise<IChangelogItem & { is_read: boolean }> {
    return this.get("/api/changelog/latest/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async markChangelogAsRead(changelogId: string): Promise<{ status: string }> {
    return this.post("/api/changelog/read/", { changelog_id: changelogId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createChangelog(payload: IChangelogFormPayload): Promise<IChangelogItem> {
    return this.post("/api/changelog/", payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateChangelog(changelogId: string, payload: Partial<IChangelogFormPayload>): Promise<IChangelogItem> {
    return this.put(`/api/changelog/${changelogId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteChangelog(changelogId: string): Promise<void> {
    return this.delete(`/api/changelog/${changelogId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async batchDeleteChangelog(changelogIds: string[]): Promise<void> {
    return this.delete("/api/changelog/", { ids: changelogIds })
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const changelogService = new ChangelogService();
