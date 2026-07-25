import { createContext, useContext, useMemo, useState } from "react";
import type { TRequirement } from "@plane/types";
import { useProductRequirements } from "@/hooks/store/use-product-requirements";

type TRequirementModalState =
  | { mode: "create"; requirement: null }
  | { mode: "edit"; requirement: TRequirement }
  | null;

type TProductRequirementsContext = ReturnType<typeof useProductRequirements> & {
  workspaceSlug: string;
  productId: string;
  modal: TRequirementModalState;
  openCreateModal: () => void;
  openEditModal: (requirement: TRequirement) => void;
  closeModal: () => void;
};

const ProductRequirementsContext = createContext<TProductRequirementsContext | undefined>(undefined);

export function ProductRequirementsProvider(props: {
  children: React.ReactNode;
  workspaceSlug: string;
  productId: string;
}) {
  const { children, workspaceSlug, productId } = props;
  const store = useProductRequirements(workspaceSlug, productId);
  const [modal, setModal] = useState<TRequirementModalState>(null);
  const value = useMemo<TProductRequirementsContext>(
    () => ({
      ...store,
      workspaceSlug,
      productId,
      modal,
      openCreateModal: () => setModal({ mode: "create", requirement: null }),
      openEditModal: (requirement) => setModal({ mode: "edit", requirement }),
      closeModal: () => setModal(null),
    }),
    [modal, productId, store, workspaceSlug]
  );

  return <ProductRequirementsContext.Provider value={value}>{children}</ProductRequirementsContext.Provider>;
}

export const useProductRequirementsContext = () => {
  const context = useContext(ProductRequirementsContext);
  if (!context) throw new Error("useProductRequirementsContext must be used within ProductRequirementsProvider");
  return context;
};
