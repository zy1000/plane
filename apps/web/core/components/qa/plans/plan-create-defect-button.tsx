"use client";

import { useState } from "react";
import { observer } from "mobx-react";
import { PERMISSION_KEYS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { BugIssueModal } from "@/components/issues/issue-modal/bug-modal";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
  planId: string;
  /** 计划的产品，作为缺陷所属产品的默认值 */
  productId?: string | null;
};

/** 计划页「提缺陷」：新建的缺陷自动记上来源测试计划（不挂具体用例）；没有新建缺陷权限时不显示 */
export const PlanCreateDefectButton = observer(({ workspaceSlug, projectId, planId, productId }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const { allowProjectPermissionKeys } = useUserPermissions();
  const canCreateDefect = allowProjectPermissionKeys([PERMISSION_KEYS.PROJECT_DEFECT_CREATE], workspaceSlug, projectId);

  if (!canCreateDefect || !planId) return null;

  return (
    <>
      <Button variant="secondary" size="xl" onClick={() => setIsOpen(true)}>
        提缺陷
      </Button>
      <BugIssueModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        modalTitle="新增缺陷"
        data={{ project_id: projectId, test_plan_id: planId, ...(productId ? { product_id: productId } : {}) }}
        isProjectSelectionDisabled
        allowedProjectIds={[projectId]}
        onSubmit={async () => setIsOpen(false)}
      />
    </>
  );
});
