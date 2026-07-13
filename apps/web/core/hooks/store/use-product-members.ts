import { useCallback, useMemo, useState } from "react";
import { ProductService, type TProductEligibleMember, type TProductMember } from "@/services/product.service";

const productService = new ProductService();

export const useProductMembers = (workspaceSlug?: string, productId?: string) => {
  const [members, setMembers] = useState<TProductMember[]>([]);
  const [eligibleMembers, setEligibleMembers] = useState<TProductEligibleMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!workspaceSlug || !productId) return;
    setIsLoading(true);
    try {
      const [memberResponse, eligibleResponse] = await Promise.all([
        productService.getProductMembers(workspaceSlug, productId),
        productService.getEligibleProductMembers(workspaceSlug, productId),
      ]);
      setMembers(memberResponse);
      setEligibleMembers(eligibleResponse);
    } finally {
      setIsLoading(false);
    }
  }, [productId, workspaceSlug]);

  const addMember = useCallback(
    async (memberId: string) => {
      if (!workspaceSlug || !productId) return;
      setIsMutating(true);
      try {
        const member = await productService.addProductMember(workspaceSlug, productId, memberId);
        setMembers((current) => [...current, member]);
        setEligibleMembers((current) =>
          current.map((item) => (item.id === memberId ? { ...item, is_product_member: true } : item))
        );
        return member;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!workspaceSlug || !productId) return;
      setIsMutating(true);
      try {
        await productService.removeProductMember(workspaceSlug, productId, memberId);
        setMembers((current) => current.filter((item) => item.member !== memberId));
        setEligibleMembers((current) =>
          current.map((item) => (item.id === memberId ? { ...item, is_product_member: false } : item))
        );
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  return useMemo(
    () => ({
      members,
      eligibleMembers,
      isLoading,
      isMutating,
      fetchMembers,
      addMember,
      removeMember,
    }),
    [addMember, eligibleMembers, fetchMembers, isLoading, isMutating, members, removeMember]
  );
};
