import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Library, Settings2, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ChevronDownIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSearchSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { IdentifierInput, isValidIdentifier } from "@/components/common/identifier-input";
import { getSettingsRequirementTypePath } from "@/components/workspace/settings/requirement-types/navigation";
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";
import { useRequirementLibrariesContext } from "./context";

type TFieldErrors = {
  name?: string;
  identifier?: string;
  requirementType?: string;
};

/**
 * 标准库的创建 / 编辑弹窗，挂在 libraries 路由的 layout 里，列表页与条目页共用。
 *
 * 创建与编辑走同一张表单：name / identifier / description 两边都可改；
 * requirement_type 只在创建时可选，编辑时只读展示（后端 validate 也会拒绝改动）。
 */
export function RequirementLibraryFormModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    workspaceSlug,
    isCreateModalOpen,
    setIsCreateModalOpen,
    libraryToEdit,
    setLibraryToEdit,
    createLibrary,
    updateLibrary,
    isMutating,
  } = useRequirementLibrariesContext();
  const { requirementTypes, isLoading: isRequirementTypesLoading } = useRequirementTypes(workspaceSlug);
  const isEditMode = libraryToEdit !== null;
  const isOpen = isCreateModalOpen || isEditMode;
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [description, setDescription] = useState("");
  const [requirementTypeId, setRequirementTypeId] = useState("");
  const [errors, setErrors] = useState<TFieldErrors>({});

  const handleClose = () => {
    setIsCreateModalOpen(false);
    setLibraryToEdit(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    setName(libraryToEdit?.name ?? "");
    setIdentifier(libraryToEdit?.identifier ?? "");
    setDescription(libraryToEdit?.description ?? "");
    setRequirementTypeId(libraryToEdit?.requirement_type_id ?? "");
    setErrors({});
  }, [isOpen, libraryToEdit]);

  // 与产品需求的类型选择器口径一致：停用的类型不可再新建引用
  const activeRequirementTypes = useMemo(
    () => requirementTypes.filter((requirementType) => requirementType.is_active),
    [requirementTypes]
  );
  const selectedRequirementType = activeRequirementTypes.find(
    (requirementType) => requirementType.id === requirementTypeId
  );

  const requirementTypeOptions = activeRequirementTypes.map((requirementType) => ({
    value: requirementType.id,
    query: requirementType.name,
    content: (
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate text-13">{requirementType.name}</span>
        <span className="shrink-0 rounded-full bg-layer-2 px-2 text-11 text-secondary">
          {t("requirement_libraries.fields.field_count_badge", { count: requirementType.field_count })}
        </span>
      </span>
    ),
  }));

  const handleSubmit = async () => {
    const normalizedName = name.trim();
    const nextErrors: TFieldErrors = {};
    if (!normalizedName) nextErrors.name = t("requirement_libraries.validation.name_required");
    if (!isValidIdentifier(identifier)) nextErrors.identifier = t("common.identifier.invalid");
    if (!isEditMode && !requirementTypeId) {
      nextErrors.requirementType = t("requirement_libraries.validation.requirement_type_required");
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    try {
      if (libraryToEdit) {
        await updateLibrary(libraryToEdit.id, {
          name: normalizedName,
          identifier,
          description: description.trim(),
        });
        handleClose();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("requirement_libraries.toast.updated"),
        });
        return;
      }
      const library = await createLibrary({
        name: normalizedName,
        identifier,
        requirement_type_id: requirementTypeId,
        description: description.trim(),
      });
      handleClose();
      navigate(`/${workspaceSlug}/templates/libraries/${library.id}`);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("requirement_libraries.toast.created"),
      });
    } catch (requestError) {
      const payload = requestError as {
        name?: string[];
        identifier?: string[];
        requirement_type_id?: string[];
        error?: string;
      };
      // 后端返回 REQUIREMENT_LIBRARY_IDENTIFIER_ALREADY_EXISTS / _INVALID 两种错误码
      const identifierError = payload?.identifier?.[0];
      const identifierMessage = identifierError
        ? t(
            identifierError === "REQUIREMENT_LIBRARY_IDENTIFIER_ALREADY_EXISTS"
              ? "common.identifier.already_exists"
              : "common.identifier.invalid"
          )
        : undefined;
      const serverErrors: TFieldErrors = {};
      if (payload?.name?.[0]) serverErrors.name = payload.name[0];
      if (identifierMessage) serverErrors.identifier = identifierMessage;
      if (payload?.requirement_type_id?.[0]) serverErrors.requirementType = payload.requirement_type_id[0];
      if (Object.keys(serverErrors).length > 0) {
        setErrors(serverErrors);
      } else {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: payload?.error ?? t("requirement_libraries.toast.failed"),
        });
      }
    }
  };

  const submitLabel = isMutating
    ? t(isEditMode ? "requirement_libraries.saving" : "requirement_libraries.creating")
    : isEditMode
      ? t("save")
      : t("requirement_libraries.create_action");

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-accent-subtle text-accent-primary">
            <Library className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-medium text-primary">
              {t(isEditMode ? "requirement_libraries.edit_action" : "requirement_libraries.create_action")}
            </h2>
          </div>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          onClick={handleClose}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-4 px-5 py-5">
        {/* 名称 + 标识符：两个必填短字段并排，提示行整行展示在下方 */}
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-3">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-0.5 text-12 font-medium text-secondary">
                {t("requirement_libraries.fields.name")}
                <span className="text-danger-primary">*</span>
              </span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
                }}
                maxLength={255}
                autoFocus
                className={cn(
                  "focus:border-accent-primary h-9 w-full rounded-md border bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder",
                  errors.name ? "border-danger-primary" : "border-subtle"
                )}
                placeholder={t("requirement_libraries.fields.name_placeholder")}
              />
              {errors.name && <span className="mt-1.5 block text-11 text-danger-primary">{errors.name}</span>}
            </label>
            <IdentifierInput
              id="requirement-library-identifier"
              value={identifier}
              onChange={(value) => {
                setIdentifier(value);
                if (errors.identifier) setErrors((current) => ({ ...current, identifier: undefined }));
              }}
              label={t("requirement_libraries.fields.identifier")}
              required
              hideMessages
              error={errors.identifier ?? null}
            />
          </div>
          {/* 条目编号已改为逐条手填，标识符不再是编号前缀，预览块随之撤掉 */}
          {errors.identifier && <p className="mt-1.5 text-11 text-danger-primary">{errors.identifier}</p>}
        </div>
        {/* 需求类型：创建时是产品级可搜索下拉，选中后展示不可更换警示；编辑时只读 */}
        <div>
          <span className="mb-1.5 flex items-center gap-0.5 text-12 font-medium text-secondary">
            {t("requirement_libraries.fields.requirement_type")}
            {!isEditMode && <span className="text-danger-primary">*</span>}
          </span>
          {libraryToEdit ? (
            <>
              <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-md border border-subtle bg-layer-1 px-3 text-13 opacity-70">
                <span className="truncate text-primary">{libraryToEdit.requirement_type_detail?.name}</span>
                <span className="shrink-0 rounded-full bg-layer-2 px-2 text-11 text-secondary">
                  {t("requirement_libraries.fields.field_count_badge", { count: libraryToEdit.field_count })}
                </span>
              </div>
              <p className="mt-1.5 text-11 text-tertiary">{t("requirement_libraries.fields.requirement_type_hint")}</p>
            </>
          ) : (
            <>
              <CustomSearchSelect
                value={requirementTypeId}
                onChange={(value: string) => {
                  setRequirementTypeId(value);
                  if (errors.requirementType) setErrors((current) => ({ ...current, requirementType: undefined }));
                }}
                options={requirementTypeOptions}
                disabled={isRequirementTypesLoading}
                className="w-full"
                customButtonClassName="w-full rounded-md"
                optionsClassName="w-80"
                noResultsMessage={t("requirement_libraries.fields.requirement_type_empty")}
                customButton={
                  <div
                    className={cn(
                      "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-surface-1 px-3 text-left text-13",
                      errors.requirementType ? "border-danger-primary" : "border-subtle",
                      isRequirementTypesLoading && "cursor-not-allowed opacity-60"
                    )}
                  >
                    {selectedRequirementType ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-primary">{selectedRequirementType.name}</span>
                        <span className="shrink-0 rounded-full bg-layer-2 px-2 text-11 text-secondary">
                          {t("requirement_libraries.fields.field_count_badge", {
                            count: selectedRequirementType.field_count,
                          })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-placeholder">
                        {t("requirement_libraries.fields.requirement_type_placeholder")}
                      </span>
                    )}
                    <ChevronDownIcon className="size-3.5 shrink-0 text-secondary" />
                  </div>
                }
                footerOption={
                  <div className="mx-2 mt-1.5 border-t border-subtle pt-1.5">
                    <Link
                      to={getSettingsRequirementTypePath(workspaceSlug)}
                      onClick={handleClose}
                      className="flex items-center gap-1.5 rounded-sm px-1 py-1.5 text-11 text-secondary hover:bg-layer-transparent-hover"
                    >
                      <Settings2 className="size-3 shrink-0" />
                      {t("requirement_libraries.fields.requirement_type_manage")}
                    </Link>
                  </div>
                }
              />
              {errors.requirementType ? (
                <p className="mt-1.5 text-11 text-danger-primary">{errors.requirementType}</p>
              ) : selectedRequirementType ? (
                <div className="mt-2 flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning-primary" />
                  <span className="text-11 text-warning-primary">
                    {t("requirement_libraries.fields.requirement_type_warning")}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
        {/* 描述 */}
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-12 font-medium text-secondary">
            {t("requirement_libraries.fields.description")}
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("requirement_libraries.fields.description_placeholder")}
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={handleClose} disabled={isMutating}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={() => void handleSubmit()} loading={isMutating}>
          {submitLabel}
        </Button>
      </div>
    </ModalCore>
  );
}
