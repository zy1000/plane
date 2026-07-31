import { createContext, useContext, useMemo, useState } from "react";
import { useRequirementLibraries } from "@/hooks/store/use-requirement-libraries";

type TRequirementLibrariesContext = ReturnType<typeof useRequirementLibraries> & {
  workspaceSlug: string;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (value: boolean) => void;
};

const RequirementLibrariesContext = createContext<TRequirementLibrariesContext | undefined>(undefined);

export function RequirementLibrariesProvider({
  children,
  workspaceSlug,
}: {
  children: React.ReactNode;
  workspaceSlug: string;
}) {
  const libraries = useRequirementLibraries(workspaceSlug);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const value = useMemo(
    () => ({
      ...libraries,
      workspaceSlug,
      isCreateModalOpen,
      setIsCreateModalOpen,
    }),
    [isCreateModalOpen, libraries, workspaceSlug]
  );

  return <RequirementLibrariesContext.Provider value={value}>{children}</RequirementLibrariesContext.Provider>;
}

export const useRequirementLibrariesContext = () => {
  const context = useContext(RequirementLibrariesContext);
  if (!context) throw new Error("useRequirementLibrariesContext must be used within RequirementLibrariesProvider");
  return context;
};
