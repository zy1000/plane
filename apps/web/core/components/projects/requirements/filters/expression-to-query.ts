import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
  LOGICAL_OPERATOR,
} from "@plane/types";
import type {
  TProjectRequirementFilterExpression,
  TProjectRequirementFilterExpressionData,
  TProjectRequirementFilterProperty,
  TProjectRequirementListQuery,
} from "./types";

const toStringArray = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const mergeCsv = (current: string | undefined, values: string[]) => {
  if (values.length === 0) return current;
  const merged = Array.from(new Set([...(current ? toStringArray(current) : []), ...values]));
  return merged.length > 0 ? merged.join(",") : current;
};

const applyCondition = (
  query: TProjectRequirementListQuery,
  property: TProjectRequirementFilterProperty,
  operator: string,
  value: unknown
) => {
  switch (property) {
    case "title": {
      const text = String(value ?? "").trim();
      if (text) query.title = text;
      break;
    }
    case "status":
      query.status = mergeCsv(query.status, toStringArray(value));
      break;
    case "product":
      query.productId = mergeCsv(query.productId, toStringArray(value));
      break;
    case "approval":
      query.approvalState = mergeCsv(query.approvalState, toStringArray(value));
      break;
    case "priority":
      query.priority = mergeCsv(query.priority, toStringArray(value));
      break;
    case "assignee":
      query.assigneeId = mergeCsv(query.assigneeId, toStringArray(value));
      break;
    case "requirement_type":
      query.requirementTypeId = mergeCsv(query.requirementTypeId, toStringArray(value));
      break;
    case "start_date":
      applyDateCondition(query, "start", operator, value);
      break;
    case "target_date":
      applyDateCondition(query, "target", operator, value);
      break;
    default:
      break;
  }
};

const applyDateCondition = (
  query: TProjectRequirementListQuery,
  field: "start" | "target",
  operator: string,
  value: unknown
) => {
  const values = toStringArray(value);
  if (operator === COMPARISON_OPERATOR.RANGE && values.length >= 2) {
    if (field === "start") {
      query.startDateFrom = values[0];
      query.startDateTo = values[1];
    } else {
      query.targetDateFrom = values[0];
      query.targetDateTo = values[1];
    }
    return;
  }
  if (operator === EQUALITY_OPERATOR.EXACT && values[0]) {
    if (field === "start") query.startDate = values[0];
    else query.targetDate = values[0];
  }
};

const walkExpression = (node: TProjectRequirementFilterExpressionData, query: TProjectRequirementListQuery) => {
  if (!node || typeof node !== "object") return;

  if (LOGICAL_OPERATOR.AND in node) {
    const andConditions = node[LOGICAL_OPERATOR.AND];
    if (Array.isArray(andConditions)) {
      andConditions.forEach((childNode) => walkExpression(childNode, query));
    }
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    const splitIndex = key.lastIndexOf("__");
    if (splitIndex <= 0) return;
    const property = key.slice(0, splitIndex) as TProjectRequirementFilterProperty;
    const operator = key.slice(splitIndex + 2);
    applyCondition(query, property, operator, value);
  });
};

export const projectRequirementExpressionToQuery = (
  expression: TProjectRequirementFilterExpression
): TProjectRequirementListQuery => {
  if (!expression || Object.keys(expression).length === 0) return {};
  const query: TProjectRequirementListQuery = {};
  walkExpression(expression, query);
  return query;
};

export const FILTER_URL_KEYS = {
  status: "status",
  product: "product",
  type: "type",
  approval: "approval",
  priority: "priority",
  assignee: "assignee",
  title: "title",
  startDate: "start_date",
  startDateFrom: "start_date_from",
  startDateTo: "start_date_to",
  targetDate: "target_date",
  targetDateFrom: "target_date_from",
  targetDateTo: "target_date_to",
} as const;

export const parseListQueryFromSearchParams = (params: URLSearchParams): TProjectRequirementListQuery => ({
  status: params.get(FILTER_URL_KEYS.status) || undefined,
  productId: params.get(FILTER_URL_KEYS.product) || undefined,
  requirementTypeId: params.get(FILTER_URL_KEYS.type) || undefined,
  approvalState: params.get(FILTER_URL_KEYS.approval) || undefined,
  priority: params.get(FILTER_URL_KEYS.priority) || undefined,
  assigneeId: params.get(FILTER_URL_KEYS.assignee) || undefined,
  title: params.get(FILTER_URL_KEYS.title) || undefined,
  startDate: params.get(FILTER_URL_KEYS.startDate) || undefined,
  startDateFrom: params.get(FILTER_URL_KEYS.startDateFrom) || undefined,
  startDateTo: params.get(FILTER_URL_KEYS.startDateTo) || undefined,
  targetDate: params.get(FILTER_URL_KEYS.targetDate) || undefined,
  targetDateFrom: params.get(FILTER_URL_KEYS.targetDateFrom) || undefined,
  targetDateTo: params.get(FILTER_URL_KEYS.targetDateTo) || undefined,
});

const pushCondition = (
  conditions: TProjectRequirementFilterExpressionData[],
  property: TProjectRequirementFilterProperty,
  operator: string,
  value: string
) => {
  conditions.push({ [`${property}__${operator}`]: value });
};

export const listQueryToExpression = (query: TProjectRequirementListQuery): TProjectRequirementFilterExpression => {
  const conditions: TProjectRequirementFilterExpressionData[] = [];

  if (query.title) {
    pushCondition(conditions, "title", EXTENDED_EQUALITY_OPERATOR.CONTAINS, query.title);
  }
  if (query.status) pushCondition(conditions, "status", COLLECTION_OPERATOR.IN, query.status);
  if (query.productId) pushCondition(conditions, "product", COLLECTION_OPERATOR.IN, query.productId);
  if (query.approvalState) pushCondition(conditions, "approval", COLLECTION_OPERATOR.IN, query.approvalState);
  if (query.priority) pushCondition(conditions, "priority", COLLECTION_OPERATOR.IN, query.priority);
  if (query.assigneeId) pushCondition(conditions, "assignee", COLLECTION_OPERATOR.IN, query.assigneeId);
  if (query.requirementTypeId) pushCondition(conditions, "requirement_type", COLLECTION_OPERATOR.IN, query.requirementTypeId);

  if (query.startDateFrom && query.startDateTo) {
    pushCondition(conditions, "start_date", COMPARISON_OPERATOR.RANGE, `${query.startDateFrom},${query.startDateTo}`);
  } else if (query.startDate) {
    pushCondition(conditions, "start_date", EQUALITY_OPERATOR.EXACT, query.startDate);
  }

  if (query.targetDateFrom && query.targetDateTo) {
    pushCondition(
      conditions,
      "target_date",
      COMPARISON_OPERATOR.RANGE,
      `${query.targetDateFrom},${query.targetDateTo}`
    );
  } else if (query.targetDate) {
    pushCondition(conditions, "target_date", EQUALITY_OPERATOR.EXACT, query.targetDate);
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0] as TProjectRequirementFilterExpression;
  return { [LOGICAL_OPERATOR.AND]: conditions };
};

export const applyListQueryToSearchParams = (params: URLSearchParams, query: TProjectRequirementListQuery) => {
  const setOrDelete = (key: string, value?: string) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };

  setOrDelete(FILTER_URL_KEYS.status, query.status);
  setOrDelete(FILTER_URL_KEYS.product, query.productId);
  setOrDelete(FILTER_URL_KEYS.type, query.requirementTypeId);
  setOrDelete(FILTER_URL_KEYS.approval, query.approvalState);
  setOrDelete(FILTER_URL_KEYS.priority, query.priority);
  setOrDelete(FILTER_URL_KEYS.assignee, query.assigneeId);
  setOrDelete(FILTER_URL_KEYS.title, query.title);
  setOrDelete(FILTER_URL_KEYS.startDate, query.startDate);
  setOrDelete(FILTER_URL_KEYS.startDateFrom, query.startDateFrom);
  setOrDelete(FILTER_URL_KEYS.startDateTo, query.startDateTo);
  setOrDelete(FILTER_URL_KEYS.targetDate, query.targetDate);
  setOrDelete(FILTER_URL_KEYS.targetDateFrom, query.targetDateFrom);
  setOrDelete(FILTER_URL_KEYS.targetDateTo, query.targetDateTo);
};

export const serializeListQuery = (query: TProjectRequirementListQuery) =>
  [
    query.status,
    query.productId,
    query.requirementTypeId,
    query.approvalState,
    query.priority,
    query.assigneeId,
    query.title,
    query.startDate,
    query.startDateFrom,
    query.startDateTo,
    query.targetDate,
    query.targetDateFrom,
    query.targetDateTo,
  ].join("|");

export const countListQueryFields = (query: TProjectRequirementListQuery) =>
  Object.values(query).filter((value) => Boolean(value)).length;
