import { useCallback, useEffect, useMemo } from "react";
// hooks
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
//
import useReloadConfirmations from "./use-reload-confirmation";

export type TEntityDetails = {
  entityID: string;
  groupID: string;
};

type Props = {
  containerRef: React.MutableRefObject<HTMLElement | null>;
  disabled: boolean;
  entities: Record<string, string[]>; // { groupID: entityIds[] }
};

export type TSelectionSnapshot = {
  isSelectionActive: boolean;
  selectedEntityIds: string[];
};

export type TSelectionHelper = {
  handleClearSelection: () => void;
  handleEntityClick: (event: React.MouseEvent, entityID: string, groupId: string) => void;
  getIsEntitySelected: (entityID: string) => boolean;
  getIsEntityActive: (entityID: string) => boolean;
  handleGroupClick: (groupID: string) => void;
  isGroupSelected: (groupID: string) => "empty" | "partial" | "complete";
  isSelectionDisabled: boolean;
  // extended selection helpers for parent-child selection
  getIsExtendedSelection: (entityID: string) => boolean;
  handleEntityClickWithSubIssues: (
    event: React.MouseEvent,
    entityID: string,
    groupId: string,
    subIssueIds: string[]
  ) => void;
};

export const useMultipleSelect = (props: Props) => {
  const { containerRef, disabled, entities } = props;
  // router
  // const router = useAppRouter();
  // store hooks
  const {
    selectedEntityIds,
    updateSelectedEntityDetails,
    bulkUpdateSelectedEntityDetails,
    getActiveEntityDetails,
    updateActiveEntityDetails,
    getPreviousActiveEntity,
    updatePreviousActiveEntity,
    getNextActiveEntity,
    updateNextActiveEntity,
    getLastSelectedEntityDetails,
    clearSelection,
    getIsEntitySelected,
    getIsEntityActive,
    getEntityDetailsFromEntityID,
    isExtendedSelection,
    toggleExtendedSelection,
  } = useMultipleSelectStore();

  useReloadConfirmations(
    selectedEntityIds && selectedEntityIds.length > 0,
    "Are you sure you want to leave? Your current bulk operation selections will be lost.",
    true,
    () => {
      clearSelection();
    }
  );

  const groups = useMemo(() => Object.keys(entities), [entities]);

  const entitiesList: TEntityDetails[] = useMemo(
    () =>
      groups
        ?.map((groupID) =>
          entities?.[groupID]?.map((entityID) => ({
            entityID,
            groupID,
          }))
        )
        .flat(1),
    [entities, groups]
  );

  const getPreviousAndNextEntities = useCallback(
    (entityID: string) => {
      const currentEntityIndex = entitiesList.findIndex((entity) => entity?.entityID === entityID);

      // entity position
      const isFirstEntity = currentEntityIndex === 0;
      const isLastEntity = currentEntityIndex === entitiesList.length - 1;

      let previousEntity: TEntityDetails | null = null;
      let nextEntity: TEntityDetails | null = null;

      if (isLastEntity) {
        nextEntity = null;
      } else {
        nextEntity = entitiesList[currentEntityIndex + 1];
      }

      if (isFirstEntity) {
        previousEntity = null;
      } else {
        previousEntity = entitiesList[currentEntityIndex - 1];
      }

      return {
        previousEntity,
        nextEntity,
      };
    },
    [entitiesList]
  );

  const handleActiveEntityChange = useCallback(
    (entityDetails: TEntityDetails | null, shouldScroll: boolean = true) => {
      if (disabled) return;

      if (!entityDetails) {
        updateActiveEntityDetails(null);
        updatePreviousActiveEntity(null);
        updateNextActiveEntity(null);
        return;
      }

      updateActiveEntityDetails(entityDetails);

      // scroll to get the active element in view
      const activeElement = document.querySelector(
        `[data-entity-id="${entityDetails.entityID}"][data-entity-group-id="${entityDetails.groupID}"]`
      );
      if (activeElement && containerRef.current && shouldScroll) {
        const SCROLL_OFFSET = 200;
        const containerRect = containerRef.current.getBoundingClientRect();
        const elementRect = activeElement.getBoundingClientRect();

        const isInView =
          elementRect.top >= containerRect.top + SCROLL_OFFSET &&
          elementRect.bottom <= containerRect.bottom - SCROLL_OFFSET;

        if (!isInView) {
          containerRef.current.scrollBy({
            top: elementRect.top < containerRect.top + SCROLL_OFFSET ? -50 : 50,
          });
        }
      }

      const { previousEntity: previousActiveEntity, nextEntity: nextActiveEntity } = getPreviousAndNextEntities(
        entityDetails.entityID
      );
      updatePreviousActiveEntity(previousActiveEntity);
      updateNextActiveEntity(nextActiveEntity);
    },
    [
      containerRef,
      disabled,
      getPreviousAndNextEntities,
      updateActiveEntityDetails,
      updateNextActiveEntity,
      updatePreviousActiveEntity,
    ]
  );

  const handleEntitySelection = useCallback(
    (
      entityDetails: TEntityDetails | TEntityDetails[],
      shouldScroll: boolean = true,
      forceAction: "force-add" | "force-remove" | null = null
    ) => {
      if (disabled) return;

      if (Array.isArray(entityDetails)) {
        bulkUpdateSelectedEntityDetails(entityDetails, forceAction === "force-add" ? "add" : "remove");
        if (forceAction === "force-add" && entityDetails.length > 0) {
          handleActiveEntityChange(entityDetails[entityDetails.length - 1], shouldScroll);
        }
        return;
      }

      if (forceAction) {
        if (forceAction === "force-add") {
          updateSelectedEntityDetails(entityDetails, "add");
          handleActiveEntityChange(entityDetails, shouldScroll);
        }
        if (forceAction === "force-remove") {
          updateSelectedEntityDetails(entityDetails, "remove");
        }
        return;
      }

      const isSelected = getIsEntitySelected(entityDetails.entityID);
      if (isSelected) {
        updateSelectedEntityDetails(entityDetails, "remove");
        handleActiveEntityChange(entityDetails, shouldScroll);
      } else {
        updateSelectedEntityDetails(entityDetails, "add");
        handleActiveEntityChange(entityDetails, shouldScroll);
      }
    },
    [
      bulkUpdateSelectedEntityDetails,
      disabled,
      getIsEntitySelected,
      handleActiveEntityChange,
      updateSelectedEntityDetails,
    ]
  );

  /**
   * @description toggle entity selection
   * @param {React.MouseEvent} event
   * @param {string} entityID
   * @param {string} groupID
   */
  const handleEntityClick = useCallback(
    (e: React.MouseEvent, entityID: string, groupID: string) => {
      if (disabled) return;
      const lastSelectedEntityDetails = getLastSelectedEntityDetails();
      if (e.shiftKey && lastSelectedEntityDetails) {
        const currentEntityIndex = entitiesList.findIndex((entity) => entity?.entityID === entityID);

        const lastEntityIndex = entitiesList.findIndex(
          (entity) => entity?.entityID === lastSelectedEntityDetails.entityID
        );
        if (lastEntityIndex < currentEntityIndex) {
          for (let i = lastEntityIndex + 1; i <= currentEntityIndex; i++) {
            const entityDetails = entitiesList[i];
            if (entityDetails) {
              handleEntitySelection(entityDetails, false);
            }
          }
        } else if (lastEntityIndex > currentEntityIndex) {
          for (let i = currentEntityIndex; i <= lastEntityIndex - 1; i++) {
            const entityDetails = entitiesList[i];
            if (entityDetails) {
              handleEntitySelection(entityDetails, false);
            }
          }
        } else {
          const startIndex = lastEntityIndex + 1;
          const endIndex = currentEntityIndex;
          for (let i = startIndex; i <= endIndex; i++) {
            const entityDetails = entitiesList[i];
            if (entityDetails) {
              handleEntitySelection(entityDetails, false);
            }
          }
        }
        return;
      }

      handleEntitySelection({ entityID, groupID }, false);
    },
    [disabled, entitiesList, handleEntitySelection, getLastSelectedEntityDetails]
  );

  /**
   * @description three-state toggle for entity selection with sub-issues
   * First click: select only the parent entity
   * Second click: select parent and all sub-issues
   * Third click: deselect all
   * @param {React.MouseEvent} event
   * @param {string} entityID
   * @param {string} groupID
   * @param {string[]} subIssueIds
   */
  const handleEntityClickWithSubIssues = useCallback(
    (e: React.MouseEvent, entityID: string, groupID: string, subIssueIds: string[]) => {
      if (disabled) return;

      // Handle shift+click for range selection (existing behavior)
      const lastSelectedEntityDetails = getLastSelectedEntityDetails();
      if (e.shiftKey && lastSelectedEntityDetails) {
        handleEntityClick(e, entityID, groupID);
        return;
      }

      const isSelected = getIsEntitySelected(entityID);
      const isExtended = isExtendedSelection(entityID);
      const hasSubIssues = subIssueIds && subIssueIds.length > 0;

      if (!isSelected) {
        // First click: select only the current entity
        handleEntitySelection({ entityID, groupID }, false);
      } else if (isSelected && !isExtended && hasSubIssues) {
        // Second click: extend selection to include sub-issues
        const entitiesToAdd: TEntityDetails[] = [{ entityID, groupID }];
        subIssueIds.forEach((subIssueId) => {
          entitiesToAdd.push({ entityID: subIssueId, groupID });
        });
        handleEntitySelection(entitiesToAdd, false, "force-add");
        toggleExtendedSelection(entityID);
      } else {
        // Third click or no sub-issues: deselect all (parent + sub-issues)
        const entitiesToRemove: TEntityDetails[] = [{ entityID, groupID }];
        subIssueIds.forEach((subIssueId) => {
          entitiesToRemove.push({ entityID: subIssueId, groupID });
        });
        handleEntitySelection(entitiesToRemove, false, "force-remove");
        if (isExtended) {
          toggleExtendedSelection(entityID);
        }
      }
    },
    [
      disabled,
      getIsEntitySelected,
      isExtendedSelection,
      handleEntitySelection,
      handleEntityClick,
      getLastSelectedEntityDetails,
      toggleExtendedSelection,
    ]
  );

  /**
   * @description check if any entity of the group is selected
   * @param {string} groupID
   * @returns {boolean}
   */
  const isGroupSelected = useCallback(
    (groupID: string) => {
      const root = containerRef.current;
      const selector = `[data-entity-group-id="${groupID}"][data-entity-id]`;

      const collectFromNodes = (nodes: NodeListOf<Element>) => {
        const ids: string[] = [];
        nodes.forEach((node) => {
          const el = node as HTMLElement;
          const entityId = el.dataset.entityId;
          if (entityId) ids.push(entityId);
        });
        return ids;
      };

      const fromRoot = root ? collectFromNodes(root.querySelectorAll(selector)) : [];
      const fromDocument = collectFromNodes(document.querySelectorAll(selector));
      const uniqueEntityIds = Array.from(new Set([...fromRoot, ...fromDocument]));

      const groupEntities =
        uniqueEntityIds.length > 0
          ? uniqueEntityIds.map((entityID) => ({ entityID, groupID }))
          : entitiesList.filter((entity) => entity.groupID === groupID);
      const totalSelected = groupEntities.filter((entity) => getIsEntitySelected(entity?.entityID ?? "")).length;
      if (totalSelected === 0) return "empty";
      if (totalSelected === groupEntities.length) return "complete";
      return "partial";
    },
    [containerRef, entitiesList, getIsEntitySelected]
  );

  /**
   * @description toggle group selection
   * @param {string} groupID
   */
  const handleGroupClick = useCallback(
    (groupID: string) => {
      if (disabled) return;

      const getRenderedGroupEntities = () => {
        const root = containerRef.current;
        const collectFromNodes = (nodes: NodeListOf<Element>) => {
          const renderedEntityIds: string[] = [];
          nodes.forEach((node) => {
            const el = node as HTMLElement;
            const entityId = el.dataset.entityId;
            if (entityId) renderedEntityIds.push(entityId);
          });
          return renderedEntityIds;
        };

        const selector = `[data-entity-group-id="${groupID}"][data-entity-id]`;
        const rootNodes = root ? root.querySelectorAll(selector) : ({} as NodeListOf<Element>);
        const fromRoot = root ? collectFromNodes(rootNodes) : [];
        const fromDocument = collectFromNodes(document.querySelectorAll(selector));

        const uniqueEntityIds = Array.from(new Set([...fromRoot, ...fromDocument]));
        return uniqueEntityIds.map((entityID) => ({ entityID, groupID }));
      };

      const renderedGroupEntities = getRenderedGroupEntities();
      const groupEntities =
        renderedGroupEntities.length > 0 ? renderedGroupEntities : entitiesList.filter((entity) => entity.groupID === groupID);
      const totalSelected = groupEntities.filter((entity) => getIsEntitySelected(entity.entityID)).length;
      const groupSelectionStatus: "empty" | "partial" | "complete" =
        totalSelected === 0 ? "empty" : totalSelected === groupEntities.length ? "complete" : "partial";

      if (groupSelectionStatus !== "complete") {
        handleEntitySelection(groupEntities, false, "force-add");
        return;
      }

      const selectedGroupEntities = selectedEntityIds
        .map((entityID) => getEntityDetailsFromEntityID(entityID))
        .filter((entityDetails): entityDetails is TEntityDetails => !!entityDetails && entityDetails.groupID === groupID);

      if (selectedGroupEntities.length > 0) {
        bulkUpdateSelectedEntityDetails(selectedGroupEntities, "remove");
      } else {
        handleEntitySelection(groupEntities, false, "force-remove");
      }
    },
    [
      bulkUpdateSelectedEntityDetails,
      disabled,
      containerRef,
      entitiesList,
      getEntityDetailsFromEntityID,
      getIsEntitySelected,
      handleEntitySelection,
      isGroupSelected,
      selectedEntityIds,
    ]
  );

  // select entities on shift + arrow up/down key press
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;

      const activeEntityDetails = getActiveEntityDetails();
      const nextActiveEntity = getNextActiveEntity();
      const previousActiveEntity = getPreviousActiveEntity();

      if (e.key === "ArrowDown" && activeEntityDetails) {
        if (!nextActiveEntity) return;
        handleEntitySelection(nextActiveEntity);
      }
      if (e.key === "ArrowUp" && activeEntityDetails) {
        if (!previousActiveEntity) return;
        handleEntitySelection(previousActiveEntity);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    disabled,
    getActiveEntityDetails,
    handleEntitySelection,
    getLastSelectedEntityDetails,
    getNextActiveEntity,
    getPreviousActiveEntity,
  ]);

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) return;
      const activeEntityDetails = getActiveEntityDetails();
      // set active entity id to the first entity
      if (["ArrowUp", "ArrowDown"].includes(e.key) && !activeEntityDetails) {
        const firstElementDetails = entitiesList[0];
        if (!firstElementDetails) return;
        handleActiveEntityChange(firstElementDetails);
      }

      if (e.key === "ArrowDown" && activeEntityDetails) {
        if (!activeEntityDetails) return;
        const { nextEntity: nextActiveEntity } = getPreviousAndNextEntities(activeEntityDetails.entityID);
        if (nextActiveEntity) {
          handleActiveEntityChange(nextActiveEntity);
        }
      }

      if (e.key === "ArrowUp" && activeEntityDetails) {
        if (!activeEntityDetails) return;
        const { previousEntity: previousActiveEntity } = getPreviousAndNextEntities(activeEntityDetails.entityID);
        if (previousActiveEntity) {
          handleActiveEntityChange(previousActiveEntity);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled, getActiveEntityDetails, entitiesList, groups, getPreviousAndNextEntities, handleActiveEntityChange]);

  // clear selection on route change
  // useEffect(() => {
  //   const handleRouteChange = () => clearSelection();

  //   router.events.on("routeChangeComplete", handleRouteChange);

  //   return () => {
  //     router.events.off("routeChangeComplete", handleRouteChange);
  //   };
  // }, [clearSelection, router.events]);

  // when groups change, remove selected entities that no longer belong to any active group
  useEffect(() => {
    if (disabled) return;

    const groupSet = new Set(groups);
    const entitiesToRemove: TEntityDetails[] = [];

    selectedEntityIds.forEach((entityID) => {
      const entityDetails = getEntityDetailsFromEntityID(entityID);
      if (!entityDetails) return;
      if (!groupSet.has(entityDetails.groupID)) entitiesToRemove.push(entityDetails);
    });

    if (entitiesToRemove.length > 0) bulkUpdateSelectedEntityDetails(entitiesToRemove, "remove");
  }, [bulkUpdateSelectedEntityDetails, disabled, getEntityDetailsFromEntityID, groups, selectedEntityIds]);

  /**
   * @description helper functions for selection
   */
  const helpers: TSelectionHelper = useMemo(
    () => ({
      handleClearSelection: clearSelection,
      handleEntityClick,
      getIsEntitySelected,
      getIsEntityActive,
      handleGroupClick,
      isGroupSelected,
      isSelectionDisabled: disabled,
      getIsExtendedSelection: isExtendedSelection,
      handleEntityClickWithSubIssues,
    }),
    [
      clearSelection,
      disabled,
      getIsEntityActive,
      getIsEntitySelected,
      handleEntityClick,
      handleGroupClick,
      isGroupSelected,
      isExtendedSelection,
      handleEntityClickWithSubIssues,
    ]
  );

  return helpers;
};
