import { useCallback, useMemo, useState } from "react";
import {
  RequirementService,
  type TRequirementChange,
  type TRequirementDiff,
  type TRequirementLifecycleEvent,
  type TRequirementReviewOpinion,
  type TRequirementType,
  type TRequirementVersion,
  type TUserRequirementDetail,
} from "@/services/requirement.service";

const requirementService = new RequirementService();

export const useRequirementReview = (
  workspaceSlug?: string,
  productId?: string,
  requirementType: TRequirementType = "user"
) => {
  const [requirement, setRequirement] = useState<TUserRequirementDetail>();
  const [changes, setChanges] = useState<TRequirementChange[]>([]);
  const [change, setChange] = useState<TRequirementChange>();
  const [versions, setVersions] = useState<TRequirementVersion[]>([]);
  const [lifecycleEvents, setLifecycleEvents] = useState<TRequirementLifecycleEvent[]>([]);
  const [versionDetail, setVersionDetail] = useState<TRequirementVersion>();
  const [reviewItems, setReviewItems] = useState<TRequirementChange[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const fetchDetail = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug || !productId) return;
      setIsLoading(true);
      try {
        const [requirementResponse, changesResponse, versionsResponse, lifecycleResponse] = await Promise.all([
          requirementService.getUserRequirement(workspaceSlug, productId, requirementId, requirementType),
          requirementService.getAllChanges(workspaceSlug, productId, requirementId, requirementType),
          requirementService.getVersions(workspaceSlug, productId, requirementId, requirementType),
          requirementService.getLifecycleEvents(workspaceSlug, productId, requirementId, requirementType),
        ]);
        setRequirement(requirementResponse);
        setChanges(changesResponse.data);
        setVersions(versionsResponse);
        setLifecycleEvents(lifecycleResponse);
        return requirementResponse;
      } finally {
        setIsLoading(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const fetchChange = useCallback(
    async (requirementId: string, changeId: string) => {
      if (!workspaceSlug || !productId) return;
      setIsLoading(true);
      try {
        const response = await requirementService.getChange(
          workspaceSlug,
          productId,
          requirementId,
          changeId,
          requirementType
        );
        setChange(response);
        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const submitReview = useCallback(
    async (requirementId: string, changeId: string, opinion: TRequirementReviewOpinion, reason = "") => {
      if (!workspaceSlug || !productId) return;
      setIsMutating(true);
      try {
        const response = await requirementService.reviewChange(
          workspaceSlug,
          productId,
          requirementId,
          changeId,
          requirementType,
          { opinion, reason }
        );
        setChange(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const fetchMyReviews = useCallback(
    async (tab: "pending" | "processed") => {
      if (!workspaceSlug || !productId) return;
      setIsLoading(true);
      try {
        const response = await requirementService.getMyReviews(workspaceSlug, productId, requirementType, tab);
        setReviewItems(response.data);
        setPendingCount(response.pending_count);
        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const compare = useCallback(
    async (
      requirementId: string,
      params: { from_version?: number; to_version?: number; to_change_id?: string }
    ): Promise<TRequirementDiff | undefined> => {
      if (!workspaceSlug || !productId) return;
      return requirementService.compare(workspaceSlug, productId, requirementId, requirementType, params);
    },
    [productId, requirementType, workspaceSlug]
  );

  const fetchVersion = useCallback(
    async (requirementId: string, version: number) => {
      if (!workspaceSlug || !productId) return;
      const response = await requirementService.getVersion(
        workspaceSlug,
        productId,
        requirementId,
        version,
        requirementType
      );
      setVersionDetail(response);
      return response;
    },
    [productId, requirementType, workspaceSlug]
  );

  return useMemo(
    () => ({
      requirement,
      changes,
      change,
      versions,
      lifecycleEvents,
      versionDetail,
      reviewItems,
      pendingCount,
      isLoading,
      isMutating,
      fetchDetail,
      fetchChange,
      submitReview,
      fetchMyReviews,
      compare,
      fetchVersion,
    }),
    [
      change,
      changes,
      compare,
      fetchChange,
      fetchDetail,
      fetchMyReviews,
      fetchVersion,
      isLoading,
      isMutating,
      lifecycleEvents,
      pendingCount,
      requirement,
      reviewItems,
      submitReview,
      versions,
      versionDetail,
    ]
  );
};
