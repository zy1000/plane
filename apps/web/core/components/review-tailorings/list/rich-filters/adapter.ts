import { isEmpty } from "lodash-es";
import type { SingleOrArray, TFilterExpression, TFilterValue, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR, MULTI_VALUE_OPERATORS } from "@plane/types";
import { createAndGroupNode, createConditionNode, isAndGroupNode, isConditionNode } from "@plane/utils";
import { FilterAdapter } from "@plane/shared-state";
import type { TFlatFilterConditionData, TFlatFilterExpression, TFlatFilterExpressionData } from "./types";
import { TAILORING_FILTER_PROPERTY_KEYS } from "./types";

/**
 * 筛选行内部表达式树 ⇄ 扁平对象（`{ "status__in": "in_review,in_approval" }`）。
 * 结构照阶段评审（stage-reviews/filters）的 adapter；属性键由构造参数给，
 * 裁剪表列表与详情页共用这一份实现。
 */
class TailoringFiltersAdapter<P extends string> extends FilterAdapter<P, TFlatFilterExpression<P>> {
  constructor(private readonly propertyKeys: readonly P[]) {
    super();
  }

  toInternal(externalFilter: TFlatFilterExpression<P>): TFilterExpression<P> | null {
    if (!externalFilter || isEmpty(externalFilter)) return null;
    try {
      return this._toInternal(externalFilter);
    } catch (error) {
      console.error("Failed to convert tailoring filter to internal:", error);
      return null;
    }
  }

  toExternal(internalFilter: TFilterExpression<P> | null): TFlatFilterExpression<P> {
    if (!internalFilter) return {};
    try {
      return this._toExternal(internalFilter);
    } catch (error) {
      console.error("Failed to convert tailoring filter to external:", error);
      return {};
    }
  }

  private _toInternal(expression: TFlatFilterExpressionData<P>): TFilterExpression<P> {
    if (!expression || isEmpty(expression)) throw new Error("Empty tailoring filter expression");

    if (this._isConditionData(expression)) {
      const [property, operator, value] = this._extractCondition(expression);
      return createConditionNode({ property, operator, value });
    }

    if (LOGICAL_OPERATOR.AND in expression) {
      const children = (expression as { [LOGICAL_OPERATOR.AND]: TFlatFilterExpressionData<P>[] })[
        LOGICAL_OPERATOR.AND
      ];
      if (!Array.isArray(children) || children.length === 0) throw new Error("AND group must not be empty");
      return createAndGroupNode(children.map((child) => this._toInternal(child)));
    }

    throw new Error(`Unknown tailoring filter keys [${Object.keys(expression).join(", ")}]`);
  }

  private _toExternal(expression: TFilterExpression<P>): TFlatFilterExpressionData<P> {
    if (isConditionNode(expression)) {
      const value = Array.isArray(expression.value) ? expression.value.join(",") : expression.value;
      return { [`${expression.property}__${expression.operator}`]: value as string | boolean | number };
    }
    if (isAndGroupNode(expression)) {
      return { [LOGICAL_OPERATOR.AND]: expression.children.map((child) => this._toExternal(child)) };
    }
    throw new Error("Unknown tailoring filter node");
  }

  private _splitKey(key: string): [string, string] | null {
    const index = key.lastIndexOf("__");
    if (index <= 0 || index === key.length - 2) return null;
    return [key.substring(0, index), key.substring(index + 2)];
  }

  private _isConditionData(data: unknown): data is TFlatFilterConditionData<P> {
    if (!data || typeof data !== "object" || isEmpty(data)) return false;
    const keys = Object.keys(data);
    if (keys.includes(LOGICAL_OPERATOR.AND)) return false;
    return keys.every((key) => {
      const parts = this._splitKey(key);
      return Boolean(parts) && this.propertyKeys.includes(parts![0] as P);
    });
  }

  private _extractCondition(data: TFlatFilterConditionData<P>): [P, TSupportedOperators, SingleOrArray<TFilterValue>] {
    const keys = Object.keys(data);
    if (keys.length !== 1) throw new Error("Tailoring filter condition must have exactly one key");
    const [property, operator] = this._splitKey(keys[0])!;
    const rawValue = data[keys[0] as keyof TFlatFilterConditionData<P>] as TFilterValue;
    const value =
      MULTI_VALUE_OPERATORS.includes(operator as TSupportedOperators) && typeof rawValue === "string"
        ? this._splitValue(rawValue)
        : rawValue;
    return [property as P, operator as TSupportedOperators, value];
  }

  private _splitValue(value: string): SingleOrArray<TFilterValue> {
    if (!value.includes(",")) return value;
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return parts.length === 1 ? parts[0] : parts;
  }
}

export const createTailoringFiltersAdapter = <P extends string>(propertyKeys: readonly P[]) =>
  new TailoringFiltersAdapter(propertyKeys);

export const tailoringFiltersAdapter = createTailoringFiltersAdapter(TAILORING_FILTER_PROPERTY_KEYS);
