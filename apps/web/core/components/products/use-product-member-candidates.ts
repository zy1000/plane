/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { IUserLite, TProduct } from "@plane/types";
import { useMember } from "@/hooks/store/use-member";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { useUser, useUserPermissions } from "@/hooks/store/user";

/**
 * 产品没有成员表了（2026-11 权限重构）：负责人 / 审批人的候选取工作区活跃成员，
 * 是否有资格由后端按「关联项目成员 ∪ 负责人 ∪ 评审人 ∪ 能维护全部产品的人」校验
 * （utils/requirement.py::get_requirement_eligible_user_ids）。
 *
 * ``isLinkedMember``：当前用户是不是本产品某个关联项目的成员 / 评审人；设置页换负责人后用来判断还能不能留在这页。
 */
export const useProductMemberCandidates = (
  workspaceSlug: string | undefined,
  product: { id: TProduct["id"]; reviewers?: TProduct["reviewers"] } | null | undefined
) => {
  const { data: currentUser } = useUser();
  const { isProjectMember } = useUserPermissions();
  const {
    getUserDetails,
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const { links } = useProductProjects({ workspaceSlug, productId: product?.id });

  const memberIds = useMemo(
    () => (workspaceMemberIds ?? []).filter((userId) => getWorkspaceMemberDetails(userId)?.is_active !== false),
    [getWorkspaceMemberDetails, workspaceMemberIds]
  );

  const members = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    memberIds.forEach((userId) => {
      const user = getUserDetails(userId);
      if (user) byId.set(userId, user);
    });
    if (currentUser) byId.set(currentUser.id, currentUser);
    return Array.from(byId.values());
  }, [currentUser, getUserDetails, memberIds]);

  const isLinkedMember = Boolean(
    currentUser?.id &&
    (product?.reviewers?.includes(currentUser.id) ||
      links.some((link) => isProjectMember(workspaceSlug, link.project)))
  );

  return { memberIds, members, isLinkedMember };
};
