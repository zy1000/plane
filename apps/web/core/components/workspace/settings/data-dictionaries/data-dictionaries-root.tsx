import { useCallback, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TCreateDataDictionaryItemPayload,
  TCreateDataDictionaryPayload,
  TDataDictionary,
  TDataDictionaryItem,
  TUpdateDataDictionaryItemPayload,
  TUpdateDataDictionaryPayload,
} from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { SettingsHeading } from "@/components/settings/heading";
import { DictionaryCreateModal } from "./dictionary-create-modal";
import { DictionaryDetailPanel } from "./dictionary-detail-panel";
import { DictionaryList } from "./dictionary-list";
import {
  extractDataDictionaryErrorCode,
  getDataDictionaryErrorI18nKey,
  isDataDictionaryFieldErrorCode,
} from "./helpers";

type Props = {
  workspaceSlug: string;
  canEdit: boolean;
  dictionaries: TDataDictionary[];
  isLoading: boolean;
  error: string | null;
  fetchDictionaries: () => Promise<TDataDictionary[]>;
  createDictionary: (payload: TCreateDataDictionaryPayload) => Promise<TDataDictionary>;
  updateDictionary: (dictionaryId: string, payload: TUpdateDataDictionaryPayload) => Promise<TDataDictionary>;
  deleteDictionary: (dictionaryId: string) => Promise<void>;
  createItem: (dictionaryId: string, payload: TCreateDataDictionaryItemPayload) => Promise<TDataDictionaryItem>;
  updateItem: (
    dictionaryId: string,
    itemId: string,
    payload: TUpdateDataDictionaryItemPayload
  ) => Promise<TDataDictionaryItem>;
  deleteItem: (dictionaryId: string, itemId: string) => Promise<void>;
  reorderItem: (
    dictionaryId: string,
    orderedItems: TDataDictionaryItem[],
    movedItem: TDataDictionaryItem
  ) => Promise<void>;
};

const I18N = "workspace_settings.settings.data_dictionaries";

export function DataDictionariesRoot(props: Props) {
  const {
    workspaceSlug,
    canEdit,
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
  } = props;
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingDeleteDictionary, setPendingDeleteDictionary] = useState<TDataDictionary | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<TDataDictionaryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 选中项被删或还没选过时回落到第一个，不用 effect 追着列表改
  const selectedDictionary = dictionaries.find((dictionary) => dictionary.id === selectedId) ?? dictionaries[0] ?? null;

  /**
   * 成功统一 toast；字段级错误交给表单就地显示，其余错误这里 toast。
   * 错误总会继续抛出，让调用方的表单能收尾（清 loading、保留输入）。
   */
  const runMutation = useCallback(
    async <T,>(action: () => Promise<T>, successKey: string): Promise<T> => {
      try {
        const result = await action();
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.toast.${successKey}`) });
        return result;
      } catch (requestError) {
        const code = extractDataDictionaryErrorCode(requestError);
        if (!isDataDictionaryFieldErrorCode(code)) {
          const i18nKey = getDataDictionaryErrorI18nKey(code);
          const payload = requestError as { error?: string } | null;
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("error"),
            message: i18nKey ? t(i18nKey) : (payload?.error ?? t(`${I18N}.toast.failed`)),
          });
        }
        throw requestError;
      }
    },
    [t]
  );

  const handleCreate = useCallback(
    async (payload: TCreateDataDictionaryPayload) => {
      const created = await runMutation(() => createDictionary(payload), "created");
      setSelectedId(created.id);
      return created;
    },
    [createDictionary, runMutation]
  );

  const handleUpdate = useCallback(
    (dictionaryId: string, payload: TUpdateDataDictionaryPayload) =>
      runMutation(() => updateDictionary(dictionaryId, payload), "updated"),
    [runMutation, updateDictionary]
  );

  const handleCreateItem = useCallback(
    (dictionaryId: string, payload: TCreateDataDictionaryItemPayload) =>
      runMutation(() => createItem(dictionaryId, payload), "item_created"),
    [createItem, runMutation]
  );

  const handleRenameItem = useCallback(
    (dictionaryId: string, itemId: string, label: string) =>
      runMutation(() => updateItem(dictionaryId, itemId, { label }), "item_updated"),
    [runMutation, updateItem]
  );

  const handleReorder = useCallback(
    (dictionaryId: string, orderedItems: TDataDictionaryItem[], movedItem: TDataDictionaryItem) =>
      // 拖拽没有表单可以承接错误，hook 内部已回滚，这里吞掉即可
      runMutation(() => reorderItem(dictionaryId, orderedItems, movedItem), "reordered").catch(() => undefined),
    [reorderItem, runMutation]
  );

  const handleConfirmDeleteDictionary = async () => {
    if (!pendingDeleteDictionary) return;
    setIsDeleting(true);
    try {
      await runMutation(() => deleteDictionary(pendingDeleteDictionary.id), "deleted");
    } catch {
      // 已 toast
    } finally {
      setIsDeleting(false);
      setPendingDeleteDictionary(null);
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (!pendingDeleteItem) return;
    setIsDeleting(true);
    try {
      await runMutation(() => deleteItem(pendingDeleteItem.dictionary, pendingDeleteItem.id), "item_deleted");
    } catch {
      // 已 toast
    } finally {
      setIsDeleting(false);
      setPendingDeleteItem(null);
    }
  };

  const renderBody = () => {
    if (isLoading && dictionaries.length === 0) {
      return (
        <Loader className="flex flex-col gap-4 md:flex-row">
          <div className="flex flex-col gap-2 md:w-64">
            {["a", "b", "c", "d"].map((key) => (
              <Loader.Item key={key} height="44px" width="100%" />
            ))}
          </div>
          <Loader.Item height="320px" width="100%" className="flex-1" />
        </Loader>
      );
    }

    if (error && dictionaries.length === 0) {
      return (
        <div className="rounded-lg border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">{t(`${I18N}.toast.load_failed`)}</p>
          <p className="mt-1 text-12 text-secondary">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={() => void fetchDictionaries().catch(() => undefined)}>
            {t("retry")}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="shrink-0 md:w-64">
          <DictionaryList
            dictionaries={dictionaries}
            selectedId={selectedDictionary?.id ?? null}
            canEdit={canEdit}
            onSelect={setSelectedId}
            onCreate={() => setIsCreateOpen(true)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <DictionaryDetailPanel
            // 切换字典靠重新挂载重置面板里的草稿
            key={`${workspaceSlug}-${selectedDictionary?.id ?? "empty"}`}
            dictionary={selectedDictionary}
            canEdit={canEdit}
            onUpdate={handleUpdate}
            onDelete={setPendingDeleteDictionary}
            onCreateItem={handleCreateItem}
            onRenameItem={handleRenameItem}
            onDeleteItem={setPendingDeleteItem}
            onReorder={handleReorder}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <SettingsHeading title={t(`${I18N}.title`)} />
      <div className="mt-6 w-full">{renderBody()}</div>

      <DictionaryCreateModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSubmit={handleCreate} />

      <AlertModalCore
        isOpen={Boolean(pendingDeleteDictionary)}
        handleClose={() => setPendingDeleteDictionary(null)}
        handleSubmit={() => void handleConfirmDeleteDictionary()}
        isSubmitting={isDeleting}
        variant="danger"
        title={t(`${I18N}.delete_modal.title`)}
        content={t(`${I18N}.delete_modal.description`, { name: pendingDeleteDictionary?.name ?? "" })}
        secondaryButtonText={t("cancel")}
        primaryButtonText={{
          default: t(`${I18N}.delete_modal.confirm`),
          loading: t(`${I18N}.delete_modal.deleting`),
        }}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDeleteItem)}
        handleClose={() => setPendingDeleteItem(null)}
        handleSubmit={() => void handleConfirmDeleteItem()}
        isSubmitting={isDeleting}
        variant="danger"
        title={t(`${I18N}.delete_item_modal.title`)}
        content={t(`${I18N}.delete_item_modal.description`, { label: pendingDeleteItem?.label ?? "" })}
        secondaryButtonText={t("cancel")}
        primaryButtonText={{
          default: t(`${I18N}.delete_modal.confirm`),
          loading: t(`${I18N}.delete_modal.deleting`),
        }}
      />
    </>
  );
}
