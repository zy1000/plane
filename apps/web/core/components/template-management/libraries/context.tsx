import { createContext, useContext, useMemo, useState } from "react";
import type { TRequirementLibrary } from "@plane/types";
import { useRequirementLibraries } from "@/hooks/store/use-requirement-libraries";

type TRequirementLibrariesContext = ReturnType<typeof useRequirementLibraries> & {
  workspaceSlug: string;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (value: boolean) => void;
  /** 编辑弹窗的目标库；null = 关着。与创建弹窗共用同一张表单 */
  libraryToEdit: TRequirementLibrary | null;
  setLibraryToEdit: (value: TRequirementLibrary | null) => void;
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
  const [libraryToEdit, setLibraryToEdit] = useState<TRequirementLibrary | null>(null);
  const value = useMemo(
    () => ({
      ...libraries,
      workspaceSlug,
      isCreateModalOpen,
      setIsCreateModalOpen,
      libraryToEdit,
      setLibraryToEdit,
    }),
    [isCreateModalOpen, libraries, libraryToEdit, workspaceSlug]
  );

  return <RequirementLibrariesContext.Provider value={value}>{children}</RequirementLibrariesContext.Provider>;
}

export const useRequirementLibrariesContext = () => {
  const context = useContext(RequirementLibrariesContext);
  if (!context) throw new Error("useRequirementLibrariesContext must be used within RequirementLibrariesProvider");
  return context;
};
