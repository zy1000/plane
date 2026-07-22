import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ChevronDownIcon, CloseIcon, PlusIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCreateProductMemberPayload, TProductRole } from "@plane/types";
import { Avatar, CustomSearchSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import type { TProductMemberBulkMutationResult } from "@/hooks/store/use-product-members";
import { ProductRoleMultiSelect } from "./product-role-multi-select";

export type TProductMemberOption = {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
};

type TMemberRow = {
  key: number;
  memberId: string;
  roleIds: number[];
};

type Props = {
  isOpen: boolean;
  memberOptions: TProductMemberOption[];
  roles: TProductRole[];
  isRolesLoading: boolean;
  onClose: () => void;
  onAdd: (payloads: TCreateProductMemberPayload[]) => Promise<TProductMemberBulkMutationResult>;
};

const initialRow = (): TMemberRow => ({ key: 0, memberId: "", roleIds: [] });

export function AddProductMembersModal(props: Props) {
  const { isOpen, memberOptions, roles, isRolesLoading, onClose, onAdd } = props;
  const { t } = useTranslation();
  const nextKey = useRef(1);
  const [rows, setRows] = useState<TMemberRow[]>([initialRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    nextKey.current = 1;
    setRows([initialRow()]);
  }, [isOpen]);

  const selectedMemberIds = useMemo(() => new Set(rows.map((row) => row.memberId).filter(Boolean)), [rows]);
  const isComplete = rows.length > 0 && rows.every((row) => Boolean(row.memberId));

  const updateRow = (key: number, updates: Partial<TMemberRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...updates } : row)));
  };

  const addRow = () => {
    setRows((current) => [...current, { key: nextKey.current++, memberId: "", roleIds: [] }]);
  };

  const removeRow = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const closeModal = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (!isComplete || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await onAdd(rows.map((row) => ({ member: row.memberId, custom_role_ids: row.roleIds })));
      if (result.failures.length === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("workspace_products.settings.members.added_title"),
          message: t("workspace_products.settings.members.added_message", { count: result.succeededIds.length }),
        });
        onClose();
        return;
      }

      const failedIds = new Set(result.failures.map((failure) => failure.targetId));
      setRows((current) => current.filter((row) => failedIds.has(row.memberId)));
      setToast({
        type: result.succeededIds.length > 0 ? TOAST_TYPE.WARNING : TOAST_TYPE.ERROR,
        title: t(
          result.succeededIds.length > 0
            ? "workspace_products.settings.members.partially_added_title"
            : "workspace_products.settings.members.add_failed_title"
        ),
        message:
          result.succeededIds.length > 0
            ? t("workspace_products.settings.members.partially_added_message", {
                succeeded: result.succeededIds.length,
                failed: result.failures.length,
              })
            : result.failures[0]?.message || t("workspace_products.settings.members.try_again"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={isSubmitting ? undefined : closeModal}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
    >
      <div className="flex max-h-[min(85vh,48rem)] flex-col">
        <div className="border-b border-subtle px-5 py-4">
          <h3 className="text-16 font-medium text-primary">
            {t("workspace_products.settings.members.add_modal_title")}
          </h3>
          <p className="mt-1 text-12 text-tertiary">{t("workspace_products.settings.members.add_modal_description")}</p>
        </div>

        <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {memberOptions.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center text-13 text-placeholder">
              {t("workspace_products.settings.members.no_available_members")}
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const selectedMember = memberOptions.find((member) => member.id === row.memberId);
                const availableMembers = memberOptions.filter(
                  (member) => member.id === row.memberId || !selectedMemberIds.has(member.id)
                );
                const memberSelectOptions = availableMembers.map((member) => ({
                  value: member.id,
                  query: `${member.displayName} ${member.email ?? ""}`.toLowerCase(),
                  content: (
                    <div className="flex w-full items-center gap-2">
                      <Avatar name={member.displayName} src={getFileURL(member.avatarUrl ?? "")} />
                      <div className="min-w-0">
                        <p className="truncate text-13 text-primary">{member.displayName}</p>
                        {member.email && <p className="truncate text-11 text-tertiary">{member.email}</p>}
                      </div>
                    </div>
                  ),
                }));
                return (
                  <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_18rem_1.5rem] items-start gap-3">
                    <CustomSearchSelect
                      value={row.memberId}
                      onChange={(value: string) => updateRow(row.key, { memberId: value })}
                      options={memberSelectOptions}
                      optionsClassName="w-72"
                      noResultsMessage={t("workspace_products.settings.members.no_matching_available_members")}
                      customButton={
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2 text-left text-13 text-secondary shadow-sm hover:bg-layer-1 hover:text-primary focus:outline-none"
                        >
                          {selectedMember ? (
                            <div className="flex min-w-0 items-center gap-2">
                              <Avatar
                                name={selectedMember.displayName}
                                src={getFileURL(selectedMember.avatarUrl ?? "")}
                              />
                              <span className="truncate">{selectedMember.displayName}</span>
                            </div>
                          ) : (
                            <span className="py-0.5">{t("workspace_products.settings.members.select_member")}</span>
                          )}
                          <ChevronDownIcon className="size-3 shrink-0" aria-hidden="true" />
                        </button>
                      }
                    />

                    <div className="flex min-h-9 items-center rounded-md border border-subtle bg-surface-1 px-3 shadow-sm">
                      <ProductRoleMultiSelect
                        value={row.roleIds}
                        roles={roles}
                        onChange={(roleIds) => updateRow(row.key, { roleIds })}
                        isLoading={isRolesLoading}
                        disabled={isRolesLoading}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      className="mt-2 flex size-6 items-center justify-center rounded text-placeholder hover:bg-layer-1-hover hover:text-primary disabled:invisible"
                      aria-label={t("workspace_products.settings.members.remove_row")}
                    >
                      <CloseIcon className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-4">
          <button
            type="button"
            disabled={memberOptions.length <= selectedMemberIds.size || isSubmitting}
            className="flex items-center gap-2 bg-transparent py-2 pr-3 text-13 font-medium text-accent-primary disabled:cursor-not-allowed disabled:text-placeholder"
            onClick={addRow}
          >
            <PlusIcon className="size-4" />
            {t("common.add_more")}
          </button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={closeModal} disabled={isSubmitting}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!isComplete || memberOptions.length === 0 || isSubmitting}
            >
              {t(rows.length > 1 ? "add_members" : "add_member")}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
