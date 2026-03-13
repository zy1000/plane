import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type { IReleasenoteFormPayload, IReleasenoteItem, IReleasenoteListParams, IReleasenoteListResponse } from "../types";

export class ReleasenoteService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getReleasenoteList(params: IReleasenoteListParams = {}): Promise<IReleasenoteListResponse> {
    return this.get("/api/changelog/", { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLatestReleasenote(): Promise<IReleasenoteItem & { is_read: boolean }> {
    return this.get("/api/changelog/latest/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async markReleasenoteAsRead(releasenoteId: string): Promise<{ status: string }> {
    return this.post("/api/changelog/read/", { changelog_id: releasenoteId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createReleasenote(payload: IReleasenoteFormPayload): Promise<IReleasenoteItem> {
    return this.post("/api/changelog/", payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateReleasenote(releasenoteId: string, payload: Partial<IReleasenoteFormPayload>): Promise<IReleasenoteItem> {
    return this.put(`/api/changelog/${releasenoteId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteReleasenote(releasenoteId: string): Promise<void> {
    return this.delete(`/api/changelog/${releasenoteId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async batchDeleteReleasenote(releasenoteIds: string[]): Promise<void> {
    return this.delete("/api/changelog/", { ids: releasenoteIds })
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const releasenoteService = new ReleasenoteService();
