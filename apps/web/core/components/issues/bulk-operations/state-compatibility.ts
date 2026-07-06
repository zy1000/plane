import type { IState, TIssue } from "@plane/types";

type TIssueMap = Record<string, TIssue | undefined>;

type TStateCompatibilityInput = {
  issueIds: string[];
  issueMap: TIssueMap;
  projectStates: IState[] | undefined;
};

export type TBulkStateCompatibility = {
  compatibleStateIds: string[] | undefined;
  hasMissingIssues: boolean;
  hasMissingTypes: boolean;
  hasMultipleTypes: boolean;
  isReady: boolean;
  selectedTypeIds: string[];
  singleTypeId: string | null;
  stateIdToTypeStateIdMap: Record<string, Record<string, string>>;
};

const getStateKey = (state: IState) => `${state.group}::${state.name}`;

const getStatesForType = (states: IState[], typeId: string) => {
  const typeStates = states.filter((state) => state.issue_type_id === typeId);
  if (typeStates.length > 0) return typeStates;

  return states.filter((state) => state.issue_type_id === null);
};

export const getBulkStateCompatibility = ({
  issueIds,
  issueMap,
  projectStates,
}: TStateCompatibilityInput): TBulkStateCompatibility => {
  const selectedIssues = issueIds.map((issueId) => issueMap[issueId]);
  const hasMissingIssues = selectedIssues.some((issue) => !issue);
  const hasMissingTypes = selectedIssues.some((issue) => issue && !issue.type_id);
  const selectedTypeIds = Array.from(
    new Set(selectedIssues.map((issue) => issue?.type_id).filter((typeId): typeId is string => !!typeId))
  );
  const hasMultipleTypes = selectedTypeIds.length > 1;

  const baseResult = {
    hasMissingIssues,
    hasMissingTypes,
    hasMultipleTypes,
    selectedTypeIds,
    singleTypeId: selectedTypeIds.length === 1 ? selectedTypeIds[0] : null,
  };

  if (!hasMultipleTypes) {
    return {
      ...baseResult,
      compatibleStateIds: undefined,
      isReady: true,
      stateIdToTypeStateIdMap: {},
    };
  }

  if (!projectStates) {
    return {
      ...baseResult,
      compatibleStateIds: undefined,
      isReady: false,
      stateIdToTypeStateIdMap: {},
    };
  }

  const stateMapsByTypeId = new Map<string, Map<string, IState>>();
  for (const typeId of selectedTypeIds) {
    const stateMap = new Map<string, IState>();
    for (const state of getStatesForType(projectStates, typeId)) {
      const key = getStateKey(state);
      if (!stateMap.has(key)) stateMap.set(key, state);
    }
    stateMapsByTypeId.set(typeId, stateMap);
  }

  const firstTypeId = selectedTypeIds[0];
  const firstTypeStates = stateMapsByTypeId.get(firstTypeId);
  const compatibleStateIds: string[] = [];
  const stateIdToTypeStateIdMap: Record<string, Record<string, string>> = {};

  for (const [stateKey, representativeState] of firstTypeStates ?? []) {
    const targetStateIdsByType: Record<string, string> = {};

    for (const typeId of selectedTypeIds) {
      const matchingState = stateMapsByTypeId.get(typeId)?.get(stateKey);
      if (!matchingState) break;
      targetStateIdsByType[typeId] = matchingState.id;
    }

    if (Object.keys(targetStateIdsByType).length === selectedTypeIds.length) {
      compatibleStateIds.push(representativeState.id);
      stateIdToTypeStateIdMap[representativeState.id] = targetStateIdsByType;
    }
  }

  return {
    ...baseResult,
    compatibleStateIds,
    isReady: true,
    stateIdToTypeStateIdMap,
  };
};
