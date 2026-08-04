import { createContext, useContext, useMemo, useState } from "react";
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";

type TRequirementTypesContext = ReturnType<typeof useRequirementTypes> & {
  workspaceSlug: string;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (value: boolean) => void;
};

const RequirementTypesContext = createContext<TRequirementTypesContext | undefined>(undefined);

export function RequirementTypesProvider({
  children,
  workspaceSlug,
}: {
  children: React.ReactNode;
  workspaceSlug: string;
}) {
  const requirementTypes = useRequirementTypes(workspaceSlug);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const value = useMemo(
    () => ({
      ...requirementTypes,
      workspaceSlug,
      isCreateModalOpen,
      setIsCreateModalOpen,
    }),
    [isCreateModalOpen, requirementTypes, workspaceSlug]
  );

  return <RequirementTypesContext.Provider value={value}>{children}</RequirementTypesContext.Provider>;
}

export const useRequirementTypesContext = () => {
  const context = useContext(RequirementTypesContext);
  if (!context) throw new Error("useRequirementTypesContext must be used within RequirementTypesProvider");
  return context;
};
