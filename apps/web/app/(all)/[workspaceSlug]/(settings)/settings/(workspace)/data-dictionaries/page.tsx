import { observer } from "mobx-react";
// plane imports
import { PERMISSION_KEYS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { SettingsFullBleedContentWrapper } from "@/components/settings/content-wrapper";
import { DataDictionariesRoot } from "@/components/workspace/settings/data-dictionaries";
// hooks
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { JOB_ROLE_DICTIONARY_KEY } from "@/hooks/store/use-job-roles";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { DataDictionariesWorkspaceSettingsHeader } from "./header";

const WorkspaceDataDictionariesPage = observer(function WorkspaceDataDictionariesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // 读对工作区成员全开；增删改与后端同一把 key
  const canEdit = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_DATA_DICTIONARY_MANAGE], workspaceSlug);

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
    bulkCreateItems,
    reorderItem,
  } = useDataDictionaries(workspaceSlug);

  return (
    // 左栏目录 + 右栏固定高表格各自滚动，要占满可用高度：用不套 ScrollArea 的全出血外壳
    <SettingsFullBleedContentWrapper header={<DataDictionariesWorkspaceSettingsHeader />}>
      <PageHead
        title={
          currentWorkspace?.name
            ? `${currentWorkspace.name} - ${t("workspace_settings.settings.data_dictionaries.title")}`
            : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col px-page-x py-6 lg:px-12">
        <DataDictionariesRoot
          workspaceSlug={workspaceSlug}
          canEdit={canEdit}
          // 「角色」字典改在 设置 › 角色 维护，这里不再露出
          dictionaries={dictionaries.filter((dictionary) => dictionary.key !== JOB_ROLE_DICTIONARY_KEY)}
          isLoading={isLoading}
          error={error}
          fetchDictionaries={fetchDictionaries}
          createDictionary={createDictionary}
          updateDictionary={updateDictionary}
          deleteDictionary={deleteDictionary}
          createItem={createItem}
          updateItem={updateItem}
          deleteItem={deleteItem}
          bulkCreateItems={bulkCreateItems}
          reorderItem={reorderItem}
        />
      </div>
    </SettingsFullBleedContentWrapper>
  );
});

export default WorkspaceDataDictionariesPage;
