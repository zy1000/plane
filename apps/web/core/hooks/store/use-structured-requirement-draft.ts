import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type {
  TRequirementAttachment,
  TRequirementChange,
  TUserRequirementPayload,
} from "@/services/requirement.service";
import { FileService } from "@/services/file.service";

const AUTOSAVE_DELAY = 800;
const fileService = new FileService();

export type TRequirementDraftSaveStatus = "saved" | "dirty" | "saving" | "error";

const emptyValues: TUserRequirementPayload = {
  name: "",
  priority: "none",
  module: null,
  parent: null,
  assignee: null,
  reviewers: [],
  attachment_ids: [],
  content_mode: "structured",
  description_html: null,
  acceptance_criteria_html: null,
};

const valuesFromChange = (change: TRequirementChange): TUserRequirementPayload => ({
  name: change.name,
  priority: change.priority,
  module: change.module,
  parent: change.parent,
  assignee: change.assignee,
  reviewers: change.proposed_reviewers,
  attachment_ids: change.attachments.map((attachment) => attachment.id),
  content_mode: "structured",
  description_html: null,
  acceptance_criteria_html: null,
});

const payloadFromValues = (values: TUserRequirementPayload): TUserRequirementPayload => ({
  name: values.name,
  priority: values.priority,
  module: values.module ?? null,
  parent: values.parent ?? null,
  assignee: values.assignee ?? null,
  reviewers: values.reviewers ?? [],
  attachment_ids: values.attachment_ids ?? [],
  content_mode: "structured",
  description_html: null,
  acceptance_criteria_html: null,
});

type TParams = {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  change: TRequirementChange | null;
  enabled: boolean;
  patchChangeDraft: (
    requirementId: string,
    changeId: string,
    data: Partial<TUserRequirementPayload>
  ) => Promise<TRequirementChange>;
};

export const useStructuredRequirementDraft = (params: TParams) => {
  const { change, enabled, patchChangeDraft, productId, requirementId, workspaceSlug } = params;
  const form = useForm<TUserRequirementPayload>({ defaultValues: emptyValues, mode: "onChange" });
  const [attachments, setAttachments] = useState<TRequirementAttachment[]>([]);
  const [saveStatus, setSaveStatus] = useState<TRequirementDraftSaveStatus>("saved");
  const [saveError, setSaveError] = useState<unknown>();
  const debounceRef = useRef<number | undefined>(undefined);
  const dirtyPayloadRef = useRef<TUserRequirementPayload | undefined>(undefined);
  const saveErrorRef = useRef<unknown>();
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const isResettingRef = useRef(false);
  const newAssetIdsRef = useRef<Set<string>>(new Set());
  const pendingAssetDeletesRef = useRef<Set<string>>(new Set());

  const clearDebounce = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
  }, []);

  const cleanupPendingAssets = useCallback(async () => {
    const ids = [...pendingAssetDeletesRef.current];
    pendingAssetDeletesRef.current.clear();
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((assetId) => fileService.deleteProductAsset(workspaceSlug, productId, assetId)));
    ids.forEach((assetId) => newAssetIdsRef.current.delete(assetId));
  }, [productId, workspaceSlug]);

  const enqueueSave = useCallback(async () => {
    clearDebounce();
    if (!enabled || !change || !dirtyPayloadRef.current) {
      await queueRef.current;
      return;
    }

    const payload = dirtyPayloadRef.current;
    dirtyPayloadRef.current = undefined;
    setSaveStatus("saving");
    setSaveError(undefined);
    saveErrorRef.current = undefined;

    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await patchChangeDraft(requirementId, change.id, payload);
          await cleanupPendingAssets();
          setSaveStatus(dirtyPayloadRef.current ? "dirty" : "saved");
          return undefined;
        } catch (error) {
          dirtyPayloadRef.current = dirtyPayloadRef.current ?? payload;
          saveErrorRef.current = error;
          setSaveError(error);
          setSaveStatus("error");
          throw error;
        }
      });

    await queueRef.current;
  }, [change, cleanupPendingAssets, clearDebounce, enabled, patchChangeDraft, requirementId]);

  const scheduleSave = useCallback(() => {
    clearDebounce();
    debounceRef.current = window.setTimeout(() => void enqueueSave().catch(() => undefined), AUTOSAVE_DELAY);
  }, [clearDebounce, enqueueSave]);

  useEffect(() => {
    if (!enabled || !change) return;
    isResettingRef.current = true;
    const values = valuesFromChange(change);
    form.reset(values);
    setAttachments(change.attachments);
    dirtyPayloadRef.current = undefined;
    saveErrorRef.current = undefined;
    setSaveError(undefined);
    setSaveStatus("saved");
    queueMicrotask(() => {
      isResettingRef.current = false;
    });
  }, [change, enabled, form]);

  useEffect(() => {
    if (!enabled || !change) return;
    const subscription = form.watch((values) => {
      if (isResettingRef.current) return;
      const payload = payloadFromValues(values as TUserRequirementPayload);
      dirtyPayloadRef.current = payload;
      setSaveStatus("dirty");
      setSaveError(undefined);
      saveErrorRef.current = undefined;
      if (payload.name.trim() && payload.name.trim().length <= 255) scheduleSave();
      else clearDebounce();
    });
    return () => subscription.unsubscribe();
  }, [change, clearDebounce, enabled, form, scheduleSave]);

  useEffect(() => () => clearDebounce(), [clearDebounce]);

  const addAttachment = useCallback(
    (attachment: TRequirementAttachment) => {
      newAssetIdsRef.current.add(attachment.id);
      setAttachments((current) => {
        const next = [...current.filter((item) => item.id !== attachment.id), attachment];
        form.setValue(
          "attachment_ids",
          next.map((item) => item.id),
          { shouldDirty: true }
        );
        return next;
      });
    },
    [form]
  );

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      if (newAssetIdsRef.current.has(attachmentId)) pendingAssetDeletesRef.current.add(attachmentId);
      setAttachments((current) => {
        const next = current.filter((item) => item.id !== attachmentId);
        form.setValue(
          "attachment_ids",
          next.map((item) => item.id),
          { shouldDirty: true }
        );
        return next;
      });
    },
    [form]
  );

  const flush = useCallback(async () => {
    clearDebounce();
    const nameIsValid = await form.trigger("name");
    if (!nameIsValid) throw new Error("需求名称不符合要求");
    const saveNext = async (): Promise<void> => {
      if (!dirtyPayloadRef.current) return;
      await enqueueSave();
      return saveNext();
    };
    await saveNext();
    await queueRef.current;
    if (saveErrorRef.current) throw saveErrorRef.current;
  }, [clearDebounce, enqueueSave, form]);

  const validateForSubmit = useCallback(async () => {
    const nameIsValid = await form.trigger("name");
    const reviewers = form.getValues("reviewers") ?? [];
    if (reviewers.length === 0) {
      form.setError("reviewers", { message: "至少选择一名评审人" });
      return false;
    }
    form.clearErrors("reviewers");
    return nameIsValid;
  }, [form]);

  const cleanupUnboundAssets = useCallback(async () => {
    const ids = [...newAssetIdsRef.current];
    newAssetIdsRef.current.clear();
    pendingAssetDeletesRef.current.clear();
    await Promise.allSettled(ids.map((assetId) => fileService.deleteProductAsset(workspaceSlug, productId, assetId)));
  }, [productId, workspaceSlug]);

  const cancelPendingSaves = useCallback(async () => {
    clearDebounce();
    dirtyPayloadRef.current = undefined;
    await queueRef.current.catch(() => undefined);
    dirtyPayloadRef.current = undefined;
    saveErrorRef.current = undefined;
    setSaveError(undefined);
    setSaveStatus("saved");
  }, [clearDebounce]);

  return {
    addAttachment,
    attachments,
    cancelPendingSaves,
    cleanupUnboundAssets,
    flush,
    form,
    removeAttachment,
    retry: flush,
    saveError,
    saveStatus,
    validateForSubmit,
  };
};
