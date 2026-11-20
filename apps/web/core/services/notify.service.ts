/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type {
  TMySubscriptionType,
  TMySubscriptionsQuery,
  TMySubscriptionsResponse,
  TNotifyEntityType,
  TNotifyMailsQuery,
  TNotifyMailsResponse,
  TNotifyMode,
  TNotifyPreference,
  TNotifyRule,
  TNotifyRuleMode,
  TNotifyRulesResponse,
  TNotifyScope,
  TNotifyScopeEntityType,
  TNotifySubscribersResponse,
} from "@/types/notify";

/**
 * 统一通知入口（邮件）：对象订阅人、通知对象、我的订阅、邮件发送记录、个人接收方式。
 *
 * 订阅人的增删改都返回最新的订阅人列表，调用方整块替换本地状态。
 */
export class NotifyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private projectBase(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/notify`;
  }

  private workspaceBase(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/notify`;
  }

  async listSubscribers(
    workspaceSlug: string,
    projectId: string,
    entityType: TNotifyEntityType,
    entityId: string
  ): Promise<TNotifySubscribersResponse> {
    return this.get(`${this.projectBase(workspaceSlug, projectId)}/subscribers/`, {
      params: { entity_type: entityType, entity_id: entityId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 加订阅人；已经是订阅人的只改接收方式。只传自己的 id 即「订阅」 */
  async addSubscribers(
    workspaceSlug: string,
    projectId: string,
    payload: { entity_type: TNotifyEntityType; entity_id: string; subscriber_ids: string[]; mode: TNotifyMode }
  ): Promise<TNotifySubscribersResponse> {
    return this.post(`${this.projectBase(workspaceSlug, projectId)}/subscribers/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateSubscriber(
    workspaceSlug: string,
    projectId: string,
    subscriberRowId: string,
    mode: TNotifyMode
  ): Promise<TNotifySubscribersResponse> {
    return this.patch(`${this.projectBase(workspaceSlug, projectId)}/subscribers/${subscriberRowId}/`, { mode })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeSubscriber(
    workspaceSlug: string,
    projectId: string,
    subscriberRowId: string
  ): Promise<TNotifySubscribersResponse> {
    return this.delete(`${this.projectBase(workspaceSlug, projectId)}/subscribers/${subscriberRowId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 这个对象的邮件即时发给谁、进谁的每日摘要 */
  async scope(
    workspaceSlug: string,
    projectId: string,
    entityType: TNotifyScopeEntityType,
    entityId: string
  ): Promise<TNotifyScope> {
    return this.get(`${this.projectBase(workspaceSlug, projectId)}/scope/`, {
      params: { entity_type: entityType, entity_id: entityId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async mySubscriptions(workspaceSlug: string, query: TMySubscriptionsQuery): Promise<TMySubscriptionsResponse> {
    return this.get(`${this.workspaceBase(workspaceSlug)}/my-subscriptions/`, { params: query })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateMySubscription(
    workspaceSlug: string,
    type: TMySubscriptionType,
    id: string,
    mode: TNotifyMode
  ): Promise<void> {
    return this.patch(`${this.workspaceBase(workspaceSlug)}/my-subscriptions/${type}/${id}/`, { mode })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeMySubscription(workspaceSlug: string, type: TMySubscriptionType, id: string): Promise<void> {
    return this.delete(`${this.workspaceBase(workspaceSlug)}/my-subscriptions/${type}/${id}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 通知规则页的全部数据：参数、分组、每条规则 */
  async rules(workspaceSlug: string): Promise<TNotifyRulesResponse> {
    return this.get(`${this.workspaceBase(workspaceSlug)}/rules/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 保存一条规则里各收件角色的方式；全部等于默认值就是恢复默认。返回更新后的这一条 */
  async updateRule(workspaceSlug: string, event: string, roles: Record<string, TNotifyRuleMode>): Promise<TNotifyRule> {
    return this.put(`${this.workspaceBase(workspaceSlug)}/rules/${event}/`, { roles })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async mails(workspaceSlug: string, query: TNotifyMailsQuery): Promise<TNotifyMailsResponse> {
    return this.get(`${this.workspaceBase(workspaceSlug)}/mails/`, { params: query })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 失败的邮件重新排队，由后台下一轮发出 */
  async resendMail(workspaceSlug: string, mailId: string): Promise<void> {
    return this.post(`${this.workspaceBase(workspaceSlug)}/mails/${mailId}/resend/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async preference(): Promise<TNotifyPreference> {
    return this.get("/api/users/me/notification-preferences/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePreference(data: Partial<TNotifyPreference>): Promise<TNotifyPreference> {
    return this.patch("/api/users/me/notification-preferences/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
