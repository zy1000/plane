import { useCallback, useState } from "react";
import { BookText } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TBulkCreateDataDictionaryItemsResponse,
  TCreateDataDictionaryItemPayload,
  TCreateDataDictionaryPayload,
  TDataDictionary,
  TDataDictionaryItem,
  TUpdateDataDictionaryItemPayload,
  TUpdateDataDictionaryPayload,
} from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { useDictionaryUsage } from "@/hooks/store/use-dictionary-usage";
import { DictionaryCreateModal } from "./dictionary-create-modal";
import { DictionaryDetailPanel } from "./dictionary-detail-panel";
import { DictionarySidebar } from "./dictionary-sidebar";
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
  bulkCreateItems: (dictionaryId: string, labels: string[]) => Promise<TBulkCreateDataDictionaryItemsResponse>;
  reorderItem: (
    dictionaryId: string,
    orderedItems: TDataDictionaryItem[],
    movedItem: TDataDictionaryItem
  ) => Promise<void>;
};

const I18N = "workspace_settings.settings.data_dictionaries";

/** 数据字典设置页：左栏目录 + 右栏字典详情。纯受控，数据与 mutation 来自页面层的 useDataDictionaries。 */
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
    bulkCreateItems,
    reorderItem,
  } = props;
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingDeleteDictionary, setPendingDeleteDictionary] = useState<TDataDictionary | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<TDataDictionaryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 选中项被删或还没选过时回落到第一个，不用 effect 追着列表改
  const selectedDictionary = dictionaries.find((dictionary) => dictionary.id === selectedId) ?? dictionaries[0] ?? null;
  const usage = useDictionaryUsage(workspaceSlug, selectedDictionary?.id);

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
      // 左栏搜索有值时新字典会被过滤掉却是选中态，一并清掉
      setSidebarSearch("");
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

  const handleUpdateItem = useCallback(
    (dictionaryId: string, itemId: string, payload: TUpdateDataDictionaryItemPayload) =>
      runMutation(() => updateItem(dictionaryId, itemId, payload), "item_updated"),
    [runMutation, updateItem]
  );

  const handleBulkCreateItems = useCallback(
    async (dictionaryId: string, labels: string[]) => {
      try {
        const response = await bulkCreateItems(dictionaryId, labels);
        const { summary } = response;
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t(`${I18N}.toast.items_bulk_created`, {
            created: summary.created,
            skipped: summary.skipped_existing + summary.skipped_blank + summary.skipped_too_long,
          }),
        });
        return response;
      } catch (requestError) {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t(`${I18N}.toast.failed`) });
        throw requestError;
      }
    },
    [bulkCreateItems, t]
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
      // 已 toast；被 409 挡住说明引用数据过期，重拉纠正 blocking
      usage.refresh();
    } finally {
      setIsDeleting(false);
      setPendingDeleteItem(null);
    }
  };

  const renderBody = () => {
    if (isLoading && dictionaries.length === 0) {
      return (
        <Loader className="mx-auto flex min-h-0 w-full max-w-280 flex-1 gap-4 md:flex-row">
          <Loader.Item height="420px" width="256px" className="hidden md:block" />
          <Loader.Item height="420px" width="100%" className="flex-1" />
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
      // 宽屏下限宽居中：值列是唯一的弹性列，不限宽时值和右侧「引用 / 添加时间」之间会拉出几百像素空白
      <div className="mx-auto flex min-h-0 w-full max-w-280 flex-1 flex-col gap-4 md:flex-row">
        <div className="min-h-0 shrink-0 max-md:max-h-56 md:w-64">
          <DictionarySidebar
            dictionaries={dictionaries}
            selectedId={selectedDictionary?.id ?? null}
            canEdit={canEdit}
            search={sidebarSearch}
            onSearchChange={setSidebarSearch}
            onSelect={setSelectedId}
            onCreate={() => setIsCreateOpen(true)}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selectedDictionary ? (
            <DictionaryDetailPanel
              // 切换字典靠重新挂载重置搜索 / 分页 / 编辑态
              key={`${workspaceSlug}-${selectedDictionary.id}`}
              dictionary={selectedDictionary}
              canEdit={canEdit}
              usage={usage}
              onUpdate={handleUpdate}
              onDelete={setPendingDeleteDictionary}
              onCreateItem={handleCreateItem}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={setPendingDeleteItem}
              onBulkCreateItems={handleBulkCreateItems}
              onReorder={handleReorder}
            />
          ) : (
            <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-lg border border-dashed border-subtle px-6 py-12 text-center">
              <span className="grid size-10 place-items-center rounded-lg bg-layer-2 text-secondary">
                <BookText className="size-5" />
              </span>
              <p className="mt-3 text-12 text-secondary">{t(`${I18N}.list.empty`)}</p>
              {canEdit && (
                <Button className="mt-3" variant="secondary" onClick={() => setIsCreateOpen(true)}>
                  {t(`${I18N}.list.create`)}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderBody()}

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
