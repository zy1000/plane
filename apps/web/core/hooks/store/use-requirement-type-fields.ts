import { useEffect, useRef, useState } from "react";
import type { TRequirementBuiltinFieldConfig, TRequirementField } from "@plane/types";
import { RequirementTypeService } from "@/services/requirement-type.service";

const requirementTypeService = new RequirementTypeService();

const EMPTY_FIELDS: TRequirementField[] = [];
const EMPTY_BUILTIN_FIELDS: TRequirementBuiltinFieldConfig[] = [];

type TResolvedConfiguration = {
  fields: TRequirementField[];
  builtinFields: TRequirementBuiltinFieldConfig[];
};

const EMPTY_CONFIGURATION: TResolvedConfiguration = {
  fields: EMPTY_FIELDS,
  builtinFields: EMPTY_BUILTIN_FIELDS,
};

/**
 * 按需取一个需求类型的字段定义（自定义字段树 + 内置字段布局）。
 *
 * 建行弹窗里换类型就得换一套字段，而产品配置里的 `requirement_types` 只覆盖「已经有行的
 * 类型」（views/requirement/base.py 里由 get_referenced_requirement_type_ids 圈定）——
 * 选一个这个产品下还没被用过的类型，那份配置里根本查不到它的字段。所以直接问类型自己要。
 *
 * 一个类型的字段结构在弹窗开着的这段时间里不会变，按 id 缓存住，来回切类型不重复发请求。
 * fields 与 builtinFields 必须原子落地 —— 否则换类型的一帧会拿旧布局配新字段。
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
  const [resolved, setResolved] = useState<{ typeId: string | null } & TResolvedConfiguration>({
    typeId: null,
    ...EMPTY_CONFIGURATION,
  });
  const cache = useRef<Record<string, TResolvedConfiguration>>({});

  useEffect(() => {
    if (!workspaceSlug || !requirementTypeId) {
      setResolved({ typeId: null, ...EMPTY_CONFIGURATION });
      return;
    }
    const cached = cache.current[requirementTypeId];
    if (cached) {
      setResolved({ typeId: requirementTypeId, ...cached });
      return;
    }
    let cancelled = false;
    requirementTypeService
      .getConfiguration(workspaceSlug, requirementTypeId)
      .then((configuration) => {
        const next: TResolvedConfiguration = {
          fields: configuration.fields,
          builtinFields: configuration.builtin_fields ?? EMPTY_BUILTIN_FIELDS,
        };
        cache.current[requirementTypeId] = next;
        if (!cancelled) setResolved({ typeId: requirementTypeId, ...next });
      })
      // 失败也要落地，否则调用方会永远停在 loading。不进缓存，切走再切回来会重试
      .catch(() => {
        if (!cancelled) setResolved({ typeId: requirementTypeId, ...EMPTY_CONFIGURATION });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, requirementTypeId]);

  const targetId = requirementTypeId ?? null;
  const isResolved = resolved.typeId === targetId;
  return {
    fields: isResolved ? resolved.fields : EMPTY_FIELDS,
    /** 该类型的内置字段布局；空数组 = 未知/取失败，解析层会回退现状顺序 */
    builtinFields: isResolved ? resolved.builtinFields : EMPTY_BUILTIN_FIELDS,
    isLoading: targetId !== null && !isResolved,
  };
};
