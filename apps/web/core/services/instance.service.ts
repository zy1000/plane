// types
import { API_BASE_URL } from "@plane/constants";
import type { IInstanceInfo, TPage } from "@plane/types";
// helpers
// services
import { APIService } from "@/services/api.service";

export class InstanceService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async requestCSRFToken(): Promise<{ csrf_token: string }> {
    return this.get("/auth/get-csrf-token/")
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }

  async getInstanceInfo(): Promise<IInstanceInfo> {
    return this.get("/api/instances/")
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }

  async getLdapConfig(): Promise<any> {
    return this.get("/api/instances/ldap/")
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }

  async updateLdapConfig(data: any): Promise<any> {
    return this.post("/api/instances/ldap/", data)
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }

  async testLdapConnection(data: any): Promise<any> {
    return this.post("/api/instances/ldap/test/", data)
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }
}
