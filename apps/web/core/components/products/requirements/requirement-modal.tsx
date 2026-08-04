import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementApprovalType, TRequirementStatus, IUserLite } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useUser } from "@/hooks/store/user";
import { useProductsContext } from "../context";
import { PILL_BASE, REQUIREMENT_STATUS_PILL } from "./change/styles";
import { useProductRequirementsContext } from "./context";
import { RequirementApprovalSettings } from "./requirement-approval-settings";

const EMPTY_DESCRIPTION = "<p></p>";

const errorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;
  const payload = error as Record<string, unknown>;
  for (const key of ["title", "owner_id", "approver_ids", "approval_type", "required_count", "error"]) {
    const value = payload[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return fallback;
};

export function ProductRequirementModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: currentUser } = useUser();
  const { products } = useProductsContext();
  const { workspaceSlug, productId, modal, closeModal, createRequirement, updateRequirement, isMutating } =
    useProductRequirementsContext();
  const { members } = useProductMembers(workspaceSlug, productId);
  const product = products.find((item) => item.id === productId);
  const requirement = modal?.mode === "edit" ? modal.requirement : null;
  const isEdit = modal?.mode === "edit";

  const memberOptions = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    members.forEach((membership) => byId.set(membership.member, membership.member_detail));
    if (product?.owner_detail) byId.set(product.owner, product.owner_detail);
    if (currentUser) byId.set(currentUser.id, currentUser);
    return Array.from(byId.values());
  }, [currentUser, members, product]);
  const memberIds = useMemo(() => memberOptions.map((member) => member.id), [memberOptions]);

  const [title, setTitle] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState(EMPTY_DESCRIPTION);
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState<TRequirementStatus>("draft");
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [approvalType, setApprovalType] = useState<TRequirementApprovalType>("any");
  const [requiredCount, setRequiredCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!modal) return;
    setTitle(requirement?.title ?? "");
    setDescriptionHtml(requirement?.description_html ?? (isEdit ? EMPTY_DESCRIPTION : ""));
    setOwnerId(requirement?.owner_id ?? currentUser?.id ?? product?.owner ?? "");
    setStatus(requirement?.status ?? "draft");
    setApproverIds(requirement?.approver_ids ?? []);
    setApprovalType(requirement?.approval_type ?? "any");
    setRequiredCount(requirement?.required_count ?? null);
    setError(null);
  }, [currentUser?.id, isEdit, modal, product?.owner, requirement]);

  const handleApproverIdsChange = (next: string[]) => {
    if (approvalType === "n_of_m") {
      if (next.length === 0) {
        setApprovalType("any");
        setRequiredCount(null);
      } else {
        setRequiredCount((count) => Math.min(Math.max(count ?? 1, 1), next.length));
      }
    }
    setApproverIds(next);
  };

  const handleApprovalTypeChange = (value: TRequirementApprovalType) => {
    setApprovalType(value);
    setRequiredCount(value === "n_of_m" ? Math.min(Math.max(requiredCount ?? 1, 1), approverIds.length) : null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t("workspace_products.requirements.validation.title"));
      return;
    }
    if (!ownerId) {
      setError(t("workspace_products.requirements.validation.owner"));
      return;
    }
    setError(null);
    try {
      if (requirement) {
        await updateRequirement(requirement.id, {
          title: title.trim(),
          description_html: descriptionHtml,
          owner_id: ownerId,
          status,
          approver_ids: approverIds,
          approval_type: approverIds.length ? approvalType : "any",
          required_count: approverIds.length && approvalType === "n_of_m" ? requiredCount : null,
        });
        closeModal();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("workspace_products.requirements.toast.updated"),
        });
        return;
      }
      const created = await createRequirement({
        product_id: productId,
        title: title.trim(),
        description_html: descriptionHtml,
        owner_id: ownerId,
        approver_ids: approverIds,
        approval_type: approverIds.length ? approvalType : "any",
        required_count: approverIds.length && approvalType === "n_of_m" ? requiredCount : null,
      });
      closeModal();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.toast.created"),
      });
      // 落到数据页：字段已不在配置页维护，建完需求下一步就是导入或录入明细
      navigate(`/${workspaceSlug}/products/${productId}/requirements/${created.id}?tab=data`);
    } catch (requestError) {
      setError(errorMessage(requestError, t("workspace_products.requirements.toast.failed")));
    }
  };

  return (
    <ModalCore
      isOpen={Boolean(modal)}
      handleClose={closeModal}
      position={EModalPosition.CENTER}
      width={EModalWidth.VXL}
      className="h-[min(760px,calc(100vh-2rem))] overflow-hidden max-sm:-m-4 max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none sm:!max-w-[940px]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex min-h-20 shrink-0 items-center justify-between border-b border-subtle px-6 py-4 md:px-8">
          <div className="min-w-0 pr-4">
            <h2 className="text-20 font-semibold text-primary">
              {t(
                isEdit
                  ? "workspace_products.requirements.modal.edit_title"
                  : "workspace_products.requirements.modal.create_title"
              )}
            </h2>
            <p className="mt-1 text-12 text-secondary">
              {t(
                isEdit
                  ? "workspace_products.requirements.modal.edit_description"
                  : "workspace_products.requirements.modal.create_description"
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
            aria-label={t("close")}
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2" data-modal-wheel-scroll>
          <section className="space-y-6 border-b border-subtle p-6 md:border-r md:border-b-0 md:p-8">
            <h3 className="text-13 font-semibold text-primary">{t("workspace_products.requirements.modal.basic")}</h3>
            <label className="block">
              <span className="mb-2 block text-12 font-medium text-primary">
                {t("workspace_products.requirements.fields.title")}
                <span className="ml-0.5 text-danger-primary">*</span>
              </span>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                maxLength={255}
                className="focus:border-accent-primary h-10 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
                placeholder={t("workspace_products.requirements.fields.title_placeholder")}
              />
            </label>
            <div className="block">
              <span className="mb-2 block text-12 font-medium text-primary">
                {t("workspace_products.requirements.fields.owner")}
                <span className="ml-0.5 text-danger-primary">*</span>
              </span>
              <div className="h-10 w-full">
                <MemberDropdown
                  multiple={false}
                  value={ownerId || null}
                  onChange={(value) => {
                    setOwnerId(value ?? "");
                    setError(null);
                  }}
                  memberIds={memberIds}
                  buttonVariant="border-with-text"
                  className="h-full w-full"
                  buttonClassName="h-full w-full border !border-subtle bg-surface-1"
                  buttonContainerClassName="h-full w-full"
                  placeholder={t("workspace_products.requirements.fields.select_owner")}
                  showUserDetails
                />
              </div>
            </div>
            <label className="block">
              <span className="mb-2 block text-12 font-medium text-primary">
                {t("workspace_products.requirements.fields.description")}
              </span>
              <textarea
                value={descriptionHtml}
                onChange={(event) => setDescriptionHtml(event.target.value)}
                rows={7}
                maxLength={1000}
                className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2.5 text-12 leading-5 text-primary outline-none"
                placeholder={t("workspace_products.requirements.fields.description_placeholder")}
              />
              <span className="mt-1.5 block text-right text-10 text-tertiary">{descriptionHtml.length}/1000</span>
            </label>
            {isEdit && (
              <div className="block">
                <span className="mb-2 block text-12 font-medium text-primary">
                  {t("workspace_products.requirements.fields.status")}
                </span>
                <div className="flex h-10 w-full items-center gap-2 rounded-md border border-subtle bg-layer-2 px-3">
                  <span className={cn(PILL_BASE, REQUIREMENT_STATUS_PILL[status])}>
                    {t(`workspace_products.requirements.status.${status}`)}
                  </span>
                  <span className="truncate text-11 text-tertiary">
                    {t("workspace_products.requirements.fields.status_hint")}
                  </span>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-6 bg-surface-1 p-6 md:p-8">
            <section className="space-y-5">
              <h3 className="text-13 font-semibold text-primary">
                {t("workspace_products.requirements.modal.approval")}
              </h3>
              <RequirementApprovalSettings
                memberOptions={memberOptions}
                approverIds={approverIds}
                approvalType={approvalType}
                requiredCount={requiredCount}
                onApproverIdsChange={handleApproverIdsChange}
                onApprovalTypeChange={handleApprovalTypeChange}
                onRequiredCountChange={setRequiredCount}
              />
            </section>
          </aside>
        </div>

        <footer className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-t border-subtle bg-surface-1 px-6 py-3 md:px-8">
          <p className="min-w-0 truncate text-11 text-danger-primary">{error}</p>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={isMutating}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} loading={isMutating}>
              {t(isEdit ? "save" : "workspace_products.requirements.modal.create_action")}
            </Button>
          </div>
        </footer>
      </div>
    </ModalCore>
  );
}
