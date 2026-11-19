import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useTemplatePermissions } from "@/components/template-management";
import { DataDictionariesRoot } from "@/components/workspace/settings/data-dictionaries";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { JOB_ROLE_DICTIONARY_KEY } from "@/hooks/store/use-job-roles";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

/** 模板中心「数据字典」（原 工作区设置 › 数据字典）：读 = view / manage，增删改与后端同一把 manage */
const TemplateDataDictionariesPage = observer(function TemplateDataDictionariesPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewDataDictionaries, canManageDataDictionaries } = useTemplatePermissions(workspaceSlug);

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

  // 权限还没拉回来时不要闪一下「无权访问」
  if (workspaceInfoBySlug(workspaceSlug) && !canViewDataDictionaries) {
    return <NotAuthorizedView className="h-full" />;
  }

  return (
    <>
      <PageHead
        title={`${t("workspace_settings.settings.data_dictionaries.title")} - ${t("workspace_templates.title")}`}
      />
      {/* 左栏目录 + 右栏固定高表格各自滚动，外壳本身不滚 */}
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <DataDictionariesRoot
          workspaceSlug={workspaceSlug}
          canEdit={canManageDataDictionaries}
          // 「角色」字典在 设置 › 角色 维护，这里不露出
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
      </ContentWrapper>
    </>
  );
});

export default function TemplateDataDictionariesRoutePage({ params }: Route.ComponentProps) {
  return <TemplateDataDictionariesPage workspaceSlug={params.workspaceSlug} />;
}
