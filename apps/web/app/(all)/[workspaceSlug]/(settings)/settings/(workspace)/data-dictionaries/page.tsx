import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { DataDictionariesRoot } from "@/components/workspace/settings/data-dictionaries";
// hooks
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { DataDictionariesWorkspaceSettingsHeader } from "./header";

const WorkspaceDataDictionariesPage = observer(function WorkspaceDataDictionariesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // 后端对工作区成员读写全开；allowPermissions(…, WORKSPACE) 会忽略 roles，这里只看是否是成员
  const canEdit = Boolean(workspaceSlug && workspaceInfoBySlug(workspaceSlug));

  const {
    dictionaries,
    isLoading,
    error,
    fetchDictionaries,
    createDictionary,
    updateDictionary,
    deleteDictionary,
    createItem,
    updateItem,
    deleteItem,
    reorderItem,
  } = useDataDictionaries(workspaceSlug);

  return (
    <SettingsContentWrapper header={<DataDictionariesWorkspaceSettingsHeader />} hugging>
      <PageHead
        title={
          currentWorkspace?.name
            ? `${currentWorkspace.name} - ${t("workspace_settings.settings.data_dictionaries.title")}`
            : undefined
        }
      />
      <DataDictionariesRoot
        workspaceSlug={workspaceSlug}
        canEdit={canEdit}
        dictionaries={dictionaries}
        isLoading={isLoading}
        error={error}
        fetchDictionaries={fetchDictionaries}
        createDictionary={createDictionary}
        updateDictionary={updateDictionary}
        deleteDictionary={deleteDictionary}
        createItem={createItem}
        updateItem={updateItem}
        deleteItem={deleteItem}
        reorderItem={reorderItem}
      />
    </SettingsContentWrapper>
  );
});

export default WorkspaceDataDictionariesPage;
