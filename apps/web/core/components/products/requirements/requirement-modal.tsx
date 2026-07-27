import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Check, Info, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementApprovalType, TRequirementStatus, IUserLite } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useRequirementTemplates } from "@/hooks/store/use-requirement-templates";
import { useUser } from "@/hooks/store/user";
import { useProductsContext } from "../context";
import { PILL_BASE, REQUIREMENT_STATUS_PILL } from "./change/styles";
import { useProductRequirementsContext } from "./context";
import { RequirementApprovalSettings } from "./requirement-approval-settings";

const EMPTY_DESCRIPTION = "<p></p>";

const createSteps = ["basic", "template", "approval"] as const;

type TCreateStep = (typeof createSteps)[number];

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

type TCreateStepNavigationProps = {
  currentStep: TCreateStep;
  furthestStep: TCreateStep;
  onStepChange: (step: TCreateStep) => void;
};

function CreateStepNavigation({ currentStep, furthestStep, onStepChange }: TCreateStepNavigationProps) {
  const { t } = useTranslation();
  const currentIndex = createSteps.indexOf(currentStep);
  const furthestIndex = createSteps.indexOf(furthestStep);

  return (
    <nav
      className="shrink-0 border-b border-subtle bg-surface-1 px-4 py-4 sm:px-8"
      aria-label={t("workspace_products.requirements.modal.wizard.progress")}
    >
      <ol className="mx-auto grid max-w-[880px] grid-cols-3">
        {createSteps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isAvailable = index <= furthestIndex;

          return (
            <li
              key={step}
              className={cn(
                "relative min-w-0",
                index < createSteps.length - 1 &&
                  "after:absolute after:top-5 after:left-[calc(50%+2.25rem)] after:h-px after:w-[calc(100%-4.5rem)]",
                index < currentIndex ? "after:bg-success-primary" : "after:bg-border-subtle"
              )}
            >
              <button
                type="button"
                disabled={!isAvailable}
                onClick={() => onStepChange(step)}
                aria-current={isCurrent ? "step" : undefined}
                className="relative z-[1] mx-auto flex min-w-0 items-center gap-3 bg-surface-1 px-2 text-left disabled:cursor-default"
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full border text-13 font-semibold transition-colors",
                    isComplete && "border-success-strong bg-success-primary text-on-color",
                    isCurrent && "border-accent-strong bg-accent-primary text-on-color",
                    !isComplete && !isCurrent && "border-subtle bg-surface-1 text-tertiary"
                  )}
                >
                  {isComplete ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className={cn("block text-12 font-semibold", isCurrent ? "text-primary" : "text-secondary")}>
                    {t(`workspace_products.requirements.modal.wizard.steps.${step}.title`)}
                  </span>
                  <span className="mt-0.5 block truncate text-10 text-tertiary">
                    {t(`workspace_products.requirements.modal.wizard.steps.${step}.description`)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type TCreateSummaryProps = {
  title: string;
  ownerName?: string;
  templateName?: string;
  fieldCount: number;
  detailCount: number;
  approvalSummary: string;
  currentStep: TCreateStep;
  onEditBasic: () => void;
};

function CreateSummary({
  title,
  ownerName,
  templateName,
  fieldCount,
  detailCount,
  approvalSummary,
  currentStep,
  onEditBasic,
}: TCreateSummaryProps) {
  const { t } = useTranslation();

  const summaryRows = [
    {
      label: t("workspace_products.requirements.modal.wizard.summary.owner"),
      value: ownerName ?? t("workspace_products.requirements.modal.wizard.summary.not_selected"),
    },
    {
      label: t("workspace_products.requirements.modal.wizard.summary.template"),
      value: templateName ?? t("workspace_products.requirements.import.no_template"),
    },
    {
      label: t("workspace_products.requirements.modal.wizard.summary.fields"),
      value: String(fieldCount),
    },
    {
      label: t("workspace_products.requirements.modal.wizard.summary.details"),
      value: String(detailCount),
    },
    {
      label: t("workspace_products.requirements.modal.wizard.summary.approval"),
      value: approvalSummary,
    },
  ];

  return (
    <aside className="border-t border-subtle bg-layer-1 px-6 py-7 md:border-t-0 md:border-l md:px-8 md:py-9">
      <div className="md:sticky md:top-0">
        <p className="text-11 font-semibold tracking-wide text-tertiary uppercase">
          {t("workspace_products.requirements.modal.wizard.summary.title")}
        </p>
        <h3 className="mt-3 text-18 leading-6 font-semibold break-words text-primary">
          {title.trim() || t("workspace_products.requirements.modal.wizard.summary.untitled")}
        </h3>

        <dl className="mt-7 space-y-4">
          {summaryRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
              <dt className="text-11 text-tertiary">{row.label}</dt>
              <dd className="truncate text-right text-12 font-medium text-primary" title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 border-t border-subtle pt-5">
          {currentStep === "approval" ? (
            <button
              type="button"
              onClick={onEditBasic}
              className="text-12 font-medium text-accent-primary hover:underline"
            >
              {t("workspace_products.requirements.modal.wizard.summary.edit")}
            </button>
          ) : (
            <p className="flex items-start gap-2 text-11 leading-5 text-secondary">
              <Info className="mt-0.5 size-3.5 shrink-0 text-accent-primary" />
              {t(`workspace_products.requirements.modal.wizard.summary.${currentStep}_hint`)}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

export function ProductRequirementModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: currentUser } = useUser();
  const { products } = useProductsContext();
  const { workspaceSlug, productId, modal, closeModal, createRequirement, updateRequirement, isMutating } =
    useProductRequirementsContext();
  const { members } = useProductMembers(workspaceSlug, productId);
  const { templates, isLoading: isTemplatesLoading } = useRequirementTemplates(workspaceSlug);
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
  const [templateId, setTemplateId] = useState("");
  const [importFields, setImportFields] = useState(false);
  const [importDetails, setImportDetails] = useState(false);
  const [status, setStatus] = useState<TRequirementStatus>("draft");
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [approvalType, setApprovalType] = useState<TRequirementApprovalType>("any");
  const [requiredCount, setRequiredCount] = useState<number | null>(null);
  const [createStep, setCreateStep] = useState<TCreateStep>("basic");
  const [furthestCreateStep, setFurthestCreateStep] = useState<TCreateStep>("basic");
  const [error, setError] = useState<string | null>(null);
  const selectedTemplate = templates.find((template) => template.id === templateId);
  const selectedOwner = memberOptions.find((member) => member.id === ownerId);
  const approvalSummary = !approverIds.length
    ? t("workspace_products.requirements.approval.unconfigured")
    : approvalType === "n_of_m"
      ? t("workspace_products.requirements.approval.n_summary", {
          required: requiredCount ?? 1,
          total: approverIds.length,
        })
      : t(`workspace_products.requirements.approval.${approvalType}`);

  useEffect(() => {
    if (!modal) return;
    setTitle(requirement?.title ?? "");
    setDescriptionHtml(requirement?.description_html ?? (isEdit ? EMPTY_DESCRIPTION : ""));
    setOwnerId(requirement?.owner_id ?? currentUser?.id ?? product?.owner ?? "");
    setTemplateId("");
    setImportFields(false);
    setImportDetails(false);
    setStatus(requirement?.status ?? "draft");
    setApproverIds(requirement?.approver_ids ?? []);
    setApprovalType(requirement?.approval_type ?? "any");
    setRequiredCount(requirement?.required_count ?? null);
    setCreateStep("basic");
    setFurthestCreateStep("basic");
    setError(null);
  }, [currentUser?.id, isEdit, modal, product?.owner, requirement]);

  const handleTemplateChange = (value: string) => {
    setTemplateId(value);
    const enabled = Boolean(value);
    setImportFields(enabled);
    setImportDetails(enabled);
  };

  const handleImportFieldsChange = (checked: boolean) => {
    setImportFields(checked);
    if (!checked) setImportDetails(false);
  };

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

  const validateBasicStep = () => {
    if (!title.trim()) {
      setError(t("workspace_products.requirements.validation.title"));
      return false;
    }
    if (!ownerId) {
      setError(t("workspace_products.requirements.validation.owner"));
      return false;
    }
    setError(null);
    return true;
  };

  const handleCreateStepChange = (step: TCreateStep) => {
    const nextIndex = createSteps.indexOf(step);
    if (nextIndex > createSteps.indexOf(furthestCreateStep)) return;
    if (nextIndex > 0 && !validateBasicStep()) return;
    setCreateStep(step);
  };

  const handleNextStep = () => {
    const currentIndex = createSteps.indexOf(createStep);
    if (currentIndex === 0 && !validateBasicStep()) return;
    const nextStep = createSteps[currentIndex + 1];
    if (!nextStep) return;
    setCreateStep(nextStep);
    if (currentIndex + 1 > createSteps.indexOf(furthestCreateStep)) setFurthestCreateStep(nextStep);
    setError(null);
  };

  const handlePreviousStep = () => {
    const previousStep = createSteps[createSteps.indexOf(createStep) - 1];
    if (previousStep) setCreateStep(previousStep);
    setError(null);
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
        template_id: templateId || null,
        import_fields: Boolean(templateId && importFields),
        import_details: Boolean(templateId && importFields && importDetails),
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
      navigate(`/${workspaceSlug}/products/${productId}/requirements/${created.id}?tab=configuration`);
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
      className={cn(
        "h-[min(760px,calc(100vh-2rem))] overflow-hidden max-sm:-m-4 max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none",
        isEdit ? "sm:!max-w-[940px]" : "sm:!max-w-[1040px]"
      )}
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
                  : "workspace_products.requirements.modal.wizard.subtitle"
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

        {isEdit ? (
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
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={255}
                  className="focus:border-accent-primary h-10 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
                  placeholder={t("workspace_products.requirements.fields.title_placeholder")}
                />
              </label>
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
              </label>
              <div className="block">
                <span className="mb-2 block text-12 font-medium text-primary">
                  {t("workspace_products.requirements.fields.owner")}
                </span>
                <div className="h-10 w-full">
                  <MemberDropdown
                    multiple={false}
                    value={ownerId || null}
                    onChange={(value) => setOwnerId(value ?? "")}
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
        ) : (
          <>
            <CreateStepNavigation
              currentStep={createStep}
              furthestStep={furthestCreateStep}
              onStepChange={handleCreateStepChange}
            />
            <div
              className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] md:overflow-hidden"
              data-modal-wheel-scroll
            >
              <main className="px-6 py-7 md:overflow-y-auto md:px-10 md:py-9">
                <div className="mx-auto max-w-[600px]">
                  <div className="mb-7">
                    <h3 className="text-16 font-semibold text-primary">
                      {t(`workspace_products.requirements.modal.wizard.steps.${createStep}.title`)}
                    </h3>
                    <p className="mt-1 text-12 leading-5 text-secondary">
                      {t(`workspace_products.requirements.modal.wizard.steps.${createStep}.description`)}
                    </p>
                  </div>

                  {createStep === "basic" && (
                    <div className="space-y-6">
                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:gap-5">
                        <label className="block min-w-0">
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
                            className="focus:border-accent-primary h-11 w-full rounded-md border border-subtle bg-surface-1 px-3.5 text-13 text-primary outline-none"
                            placeholder={t("workspace_products.requirements.fields.title_placeholder")}
                          />
                        </label>
                        <div className="block min-w-0">
                          <span className="mb-2 block text-12 font-medium text-primary">
                            {t("workspace_products.requirements.fields.owner")}
                            <span className="ml-0.5 text-danger-primary">*</span>
                          </span>
                          <div className="h-11 w-full">
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
                      </div>
                      <label className="block">
                        <span className="mb-2 block text-12 font-medium text-primary">
                          {t("workspace_products.requirements.fields.description")}
                        </span>
                        <textarea
                          value={descriptionHtml}
                          onChange={(event) => setDescriptionHtml(event.target.value)}
                          rows={6}
                          maxLength={1000}
                          className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3.5 py-3 text-12 leading-5 text-primary outline-none"
                          placeholder={t("workspace_products.requirements.fields.description_placeholder")}
                        />
                        <span className="mt-1.5 block text-right text-10 text-tertiary">
                          {descriptionHtml.length}/1000
                        </span>
                      </label>
                    </div>
                  )}

                  {createStep === "template" && (
                    <div className="space-y-7">
                      <label className="block">
                        <span className="mb-2 block text-12 font-medium text-primary">
                          {t("workspace_products.requirements.fields.template")}
                        </span>
                        <select
                          value={templateId}
                          disabled={isTemplatesLoading}
                          onChange={(event) => handleTemplateChange(event.target.value)}
                          className="focus:border-accent-primary h-11 w-full rounded-md border border-subtle bg-surface-1 px-3.5 text-12 text-primary outline-none"
                        >
                          <option value="">{t("workspace_products.requirements.import.no_template")}</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedTemplate ? (
                        <>
                          <p className="-mt-5 text-11 text-secondary">
                            {t("workspace_products.requirements.import.summary", {
                              fields: selectedTemplate.field_count,
                              details: selectedTemplate.detail_count,
                            })}
                          </p>
                          <div className="space-y-4">
                            <label
                              htmlFor="product-requirement-import-fields"
                              className="flex cursor-pointer items-start gap-3"
                            >
                              <Checkbox
                                id="product-requirement-import-fields"
                                checked={importFields}
                                disabled={!templateId}
                                onChange={() => handleImportFieldsChange(!importFields)}
                              />
                              <span>
                                <span className="block text-12 font-medium text-primary">
                                  {t("workspace_products.requirements.import.fields")}
                                </span>
                                <span className="mt-0.5 block text-11 leading-5 text-tertiary">
                                  {t("workspace_products.requirements.import.fields_description")}
                                </span>
                              </span>
                            </label>
                            <label
                              htmlFor="product-requirement-import-details"
                              className="ml-2 flex cursor-pointer items-start gap-3 border-l border-accent-subtle py-1 pl-6"
                            >
                              <Checkbox
                                id="product-requirement-import-details"
                                checked={importDetails}
                                disabled={!templateId || !importFields}
                                onChange={() => setImportDetails(!importDetails)}
                              />
                              <span>
                                <span className="block text-12 font-medium text-primary">
                                  {t("workspace_products.requirements.import.details")}
                                </span>
                                <span className="mt-0.5 block text-11 leading-5 text-tertiary">
                                  {t("workspace_products.requirements.import.details_description")}
                                </span>
                              </span>
                            </label>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-md border border-dashed border-subtle bg-layer-1 px-4 py-4">
                          <p className="text-12 font-medium text-primary">
                            {t("workspace_products.requirements.modal.wizard.blank.title")}
                          </p>
                          <p className="mt-1 text-11 leading-5 text-secondary">
                            {t("workspace_products.requirements.modal.wizard.blank.description")}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {createStep === "approval" && (
                    <RequirementApprovalSettings
                      memberOptions={memberOptions}
                      approverIds={approverIds}
                      approvalType={approvalType}
                      requiredCount={requiredCount}
                      onApproverIdsChange={handleApproverIdsChange}
                      onApprovalTypeChange={handleApprovalTypeChange}
                      onRequiredCountChange={setRequiredCount}
                    />
                  )}
                </div>
              </main>

              <CreateSummary
                title={title}
                ownerName={selectedOwner?.display_name}
                templateName={selectedTemplate?.title}
                fieldCount={selectedTemplate && importFields ? selectedTemplate.field_count : 0}
                detailCount={selectedTemplate && importDetails ? selectedTemplate.detail_count : 0}
                approvalSummary={approvalSummary}
                currentStep={createStep}
                onEditBasic={() => setCreateStep("basic")}
              />
            </div>
          </>
        )}

        <footer className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-t border-subtle bg-surface-1 px-6 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-4">
            {!isEdit && createStep !== "basic" && (
              <Button variant="secondary" onClick={handlePreviousStep} disabled={isMutating}>
                {t("workspace_products.requirements.modal.wizard.previous")}
              </Button>
            )}
            <p className="min-w-0 truncate text-11 text-danger-primary">{error}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={isMutating}>
              {t("cancel")}
            </Button>
            {isEdit ? (
              <Button variant="primary" onClick={() => void handleSave()} loading={isMutating}>
                {t("save")}
              </Button>
            ) : createStep === "approval" ? (
              <Button variant="primary" onClick={() => void handleSave()} loading={isMutating}>
                {t("workspace_products.requirements.modal.create_and_configure")}
              </Button>
            ) : (
              <Button variant="primary" onClick={handleNextStep} disabled={isMutating}>
                {t("workspace_products.requirements.modal.wizard.next")}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </ModalCore>
  );
}
