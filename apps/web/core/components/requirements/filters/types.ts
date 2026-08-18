import type { TRequirementFilter } from "@plane/types";

/** 内置列名（title / status / …）或自定义字段 UUID */
export type TRequirementGridFilterProperty = string;

/**
 * FilterInstance 的外部表达式。TExternalFilter 必须是对象，
 * 不能直接把 TRequirementFilter[] 当 external。
 */
export type TRequirementGridFilterExpression = {
  filters?: TRequirementFilter[];
};
