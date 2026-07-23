import { createContext, useContext, useMemo, useState } from "react";
import { useRequirementTemplates } from "@/hooks/store/use-requirement-templates";

type TRequirementTemplatesContext = ReturnType<typeof useRequirementTemplates> & {
  workspaceSlug: string;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (value: boolean) => void;
};

const RequirementTemplatesContext = createContext<TRequirementTemplatesContext | undefined>(undefined);

export function RequirementTemplatesProvider({
  children,
  workspaceSlug,
}: {
  children: React.ReactNode;
  workspaceSlug: string;
}) {
  const templates = useRequirementTemplates(workspaceSlug);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const value = useMemo(
    () => ({
      ...templates,
      workspaceSlug,
      isCreateModalOpen,
      setIsCreateModalOpen,
    }),
    [isCreateModalOpen, templates, workspaceSlug]
  );

  return <RequirementTemplatesContext.Provider value={value}>{children}</RequirementTemplatesContext.Provider>;
}

export const useRequirementTemplatesContext = () => {
  const context = useContext(RequirementTemplatesContext);
  if (!context) throw new Error("useRequirementTemplatesContext must be used within RequirementTemplatesProvider");
  return context;
};
