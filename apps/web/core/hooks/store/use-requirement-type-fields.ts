import { useEffect, useRef, useState } from "react";
import type { TRequirementField } from "@plane/types";
import { RequirementTypeService } from "@/services/requirement-type.service";

const requirementTypeService = new RequirementTypeService();

const EMPTY_FIELDS: TRequirementField[] = [];

/**
 * 按需取一个需求类型的字段定义。
 *
 * 建行弹窗里换类型就得换一套字段，而产品配置里的 `requirement_types` 只覆盖「已经有行的
 * 类型」（views/requirement/base.py 里由 get_referenced_requirement_type_ids 圈定）——
 * 选一个这个产品下还没被用过的类型，那份配置里根本查不到它的字段。所以直接问类型自己要。
 *
 * 一个类型的字段结构在弹窗开着的这段时间里不会变，按 id 缓存住，来回切类型不重复发请求。
 */
export const useRequirementTypeFields = (
  workspaceSlug: string | undefined,
  requirementTypeId: string | null | undefined
) => {
  /**
   * 字段和它属于哪个类型必须一起落地。分成 fields + isLoading 两个 state 的话，
   * 换类型的那一帧 isLoading 还是 false、fields 还是上一个类型的 —— 调用方会拿着
   * 旧字段当新类型的字段用。
   */
  const [resolved, setResolved] = useState<{ typeId: string | null; fields: TRequirementField[] }>({
    typeId: null,
    fields: EMPTY_FIELDS,
  });
  const cache = useRef<Record<string, TRequirementField[]>>({});

  useEffect(() => {
    if (!workspaceSlug || !requirementTypeId) {
      setResolved({ typeId: null, fields: EMPTY_FIELDS });
      return;
    }
    const cached = cache.current[requirementTypeId];
    if (cached) {
      setResolved({ typeId: requirementTypeId, fields: cached });
      return;
    }
    let cancelled = false;
    requirementTypeService
      .getConfiguration(workspaceSlug, requirementTypeId)
      .then((configuration) => {
        cache.current[requirementTypeId] = configuration.fields;
        if (!cancelled) setResolved({ typeId: requirementTypeId, fields: configuration.fields });
      })
      // 失败也要落地，否则调用方会永远停在 loading。不进缓存，切走再切回来会重试
      .catch(() => {
        if (!cancelled) setResolved({ typeId: requirementTypeId, fields: EMPTY_FIELDS });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, requirementTypeId]);

  const targetId = requirementTypeId ?? null;
  const isResolved = resolved.typeId === targetId;
  return {
    fields: isResolved ? resolved.fields : EMPTY_FIELDS,
    isLoading: targetId !== null && !isResolved,
  };
};
