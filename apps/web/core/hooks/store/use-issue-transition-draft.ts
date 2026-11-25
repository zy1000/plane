/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, observable } from "mobx";
import type { TAvailableTransition } from "@/services/project/project-workflow.service";

/**
 * 详情页点了流转按钮、进入编辑态后「正在进行的流转」，按工作项记。
 * 编辑会话负责写入 / 清除；提示条、自定义字段区块（流转必填标红星）只读。
 */
const drafts = observable.map<string, TAvailableTransition>({}, { deep: false });

export const issueTransitionDraft = {
  get: (issueId: string | undefined) => (issueId ? drafts.get(issueId) : undefined),
  set: action((issueId: string, transition: TAvailableTransition) => {
    drafts.set(issueId, transition);
  }),
  clear: action((issueId: string) => {
    drafts.delete(issueId);
  }),
};
