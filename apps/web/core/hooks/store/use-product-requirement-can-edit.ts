import { useEffect, useState } from "react";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/**
 * 当前用户能不能改某个产品下的需求内容。
 *
 * 项目需求页自己的 configuration 的 can_edit 恒为 false（写入权在产品上），抽屉要改
 * 标题、字段、子表单时必须再问一次产品。取不到或没权限都当不能改，不要把
 * 项目成员误导进一排会 403 的编辑器。
 */
export const useProductRequirementCanEdit = ({
  workspaceSlug,
  productId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
}) => {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (!workspaceSlug || !productId) {
      setCanEdit(false);
      return;
    }

    let cancelled = false;
    setCanEdit(false);
    void requirementService
      .getConfiguration(workspaceSlug, productId)
      .then((response) => {
        if (!cancelled) setCanEdit(Boolean(response.can_edit));
      })
      .catch(() => {
        if (!cancelled) setCanEdit(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId, workspaceSlug]);

  return canEdit;
};
