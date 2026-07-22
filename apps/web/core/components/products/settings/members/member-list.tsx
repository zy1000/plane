import { useMemo, useState } from "react";
import { orderBy as sortByOrder } from "lodash-es";
import Link from "next/link";
import { observer } from "mobx-react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, CircleMinus, SearchX } from "lucide-react";
import type { TMemberOrderByOptions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserLite, TProductMember, TProductRole } from "@plane/types";
import { Avatar, CustomMenu, Table } from "@plane/ui";
import { getFileURL, renderFormattedDate } from "@plane/utils";
import { MembersSettingsLoader } from "@/components/ui/loader/settings/members";
import { useMember } from "@/hooks/store/use-member";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useProductRoles } from "@/hooks/store/use-product-roles";
import { AddProductMembersModal, type TProductMemberOption } from "./add-members-modal";
import { ConfirmProductMemberRemove } from "./confirm-member-remove";
import { ProductRoleMultiSelect } from "./product-role-multi-select";
import { ProductMemberRoleFilter, UNASSIGNED_ROLE_FILTER } from "./role-filter";

type TProductMemberRow = {
  membership: TProductMember;
  member: IUserLite;
};

type TSortField = Exclude<TMemberOrderByOptions, `-${string}`>;

const getMemberFullName = (member: IUserLite) => {
  const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();
  return fullName || member.display_name;
};

const getSortValue = (row: TProductMemberRow, field: TSortField) => {
  switch (field) {
    case "full_name":
      return getMemberFullName(row.member).toLocaleLowerCase();
    case "display_name":
      return row.member.display_name?.toLocaleLowerCase() ?? "";
    case "email":
      return row.member.email?.toLocaleLowerCase() ?? "";
    case "role":
      return row.membership.role_details
        .map((role) => role.name)
        .join(" ")
        .toLocaleLowerCase();
    case "joining_date":
      return Date.parse(row.membership.created_at) || 0;
  }
};

const sortRows = (rows: TProductMemberRow[], orderBy: TMemberOrderByOptions | undefined) => {
  if (!orderBy) return rows;
  const isDescending = orderBy.startsWith("-");
  const field = (isDescending ? orderBy.slice(1) : orderBy) as TSortField;
  return sortByOrder(rows, [(row) => getSortValue(row, field)], [isDescending ? "desc" : "asc"]);
};

function SortableHeader(props: {
  field: TSortField;
  label: string;
  orderBy: TMemberOrderByOptions | undefined;
  onChange: (field: TSortField) => void;
}) {
  const { field, label, orderBy, onChange } = props;
  const isAscending = orderBy === field;
  const isDescending = orderBy === `-${field}`;

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 py-2 text-left text-13 font-medium text-secondary hover:text-primary"
      onClick={() => onChange(field)}
      aria-label={label}
    >
      <span>{label}</span>
      {isAscending ? (
        <ArrowDownWideNarrow className="size-3" />
      ) : isDescending ? (
        <ArrowUpNarrowWide className="size-3" />
      ) : (
        <ChevronDown className="size-3" />
      )}
    </button>
  );
}

function ProductMemberNameCell(props: {
  row: TProductMemberRow;
  workspaceSlug: string;
  removeLabel: string;
  onRemove: (row: TProductMemberRow) => void;
}) {
  const { row, workspaceSlug, removeLabel, onRemove } = props;
  const displayName = getMemberFullName(row.member);

  return (
    <div className="group relative flex w-72 items-center gap-2">
      <Link href={`/${workspaceSlug}/profile/${row.member.id}`} className="shrink-0">
        <Avatar name={row.member.display_name || displayName} src={getFileURL(row.member.avatar_url ?? "")} size={24} />
      </Link>
      <Link href={`/${workspaceSlug}/profile/${row.member.id}`} className="min-w-0 flex-1 truncate text-secondary">
        {displayName}
      </Link>
      <CustomMenu
        ellipsis
        closeOnSelect
        placement="bottom-end"
        optionsClassName="p-1.5"
        buttonClassName="p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        ariaLabel={removeLabel}
      >
        <CustomMenu.MenuItem onClick={() => onRemove(row)}>
          <div className="flex items-center gap-1 font-medium text-danger-primary">
            <CircleMinus className="size-3.5 shrink-0" />
            {removeLabel}
          </div>
        </CustomMenu.MenuItem>
      </CustomMenu>
    </div>
  );
}

function ProductMemberRoleCell(props: {
  membership: TProductMember;
  roles: TProductRole[];
  disabled: boolean;
  onChange: (roleIds: number[]) => void;
}) {
  const { membership, roles, disabled, onChange } = props;

  return (
    <div className="flex w-56 flex-col gap-1.5 py-1">
      <ProductRoleMultiSelect
        value={membership.custom_role_ids}
        roles={roles}
        selectedRoleDetails={membership.role_details}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

export const ProductMemberList = observer(function ProductMemberList(props: {
  productId: string;
  workspaceSlug: string;
}) {
  const { productId, workspaceSlug } = props;
  const { t } = useTranslation();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState<TMemberOrderByOptions>();
  const [updatingMembershipId, setUpdatingMembershipId] = useState<number | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TProductMemberRow | null>(null);

  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const { members, isLoading, error, fetchMembers, addMembers, updateMemberRoles, removeMember } = useProductMembers(
    workspaceSlug,
    productId
  );
  const { roles, isLoading: isRolesLoading, error: rolesError, fetchRoles } = useProductRoles(workspaceSlug, productId);

  const rows = useMemo<TProductMemberRow[]>(
    () =>
      members.map((membership) => {
        const workspaceMember = getWorkspaceMemberDetails(membership.member)?.member;
        return {
          membership,
          member: { ...membership.member_detail, ...workspaceMember },
        };
      }),
    [getWorkspaceMemberDetails, members]
  );

  const memberOptions = useMemo<TProductMemberOption[]>(() => {
    const existingMemberIds = new Set(members.map((membership) => membership.member));
    return (workspaceMemberIds ?? [])
      .map((memberId) => getWorkspaceMemberDetails(memberId))
      .filter((workspaceMember) => workspaceMember?.member && workspaceMember.is_active !== false)
      .filter((workspaceMember) => !existingMemberIds.has(workspaceMember?.member.id ?? ""))
      .map((workspaceMember) => ({
        id: workspaceMember!.member.id,
        displayName: workspaceMember!.member.display_name || getMemberFullName(workspaceMember!.member),
        email: workspaceMember!.member.email,
        avatarUrl: workspaceMember!.member.avatar_url,
      }));
  }, [getWorkspaceMemberDetails, members, workspaceMemberIds]);

  const visibleRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
    const filteredRows = rows.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        `${getMemberFullName(row.member)} ${row.member.display_name ?? ""} ${row.member.email ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedSearch);
      const matchesRole =
        roleFilters.length === 0 ||
        (row.membership.custom_role_ids.length === 0 && roleFilters.includes(UNASSIGNED_ROLE_FILTER)) ||
        row.membership.custom_role_ids.some((roleId) => roleFilters.includes(String(roleId)));
      return matchesSearch && matchesRole;
    });
    return sortRows(filteredRows, orderBy);
  }, [orderBy, roleFilters, rows, searchQuery]);

  const toggleSort = (field: TSortField) => {
    setOrderBy((current) => (current === field ? `-${field}` : current === `-${field}` ? undefined : field));
  };

  const handleRoleChange = async (membership: TProductMember, roleIds: number[]) => {
    const currentRoleIds = membership.custom_role_ids.toSorted((left, right) => left - right);
    const nextRoleIds = roleIds.toSorted((left, right) => left - right);
    if (
      currentRoleIds.length === nextRoleIds.length &&
      currentRoleIds.every((roleId, index) => roleId === nextRoleIds[index])
    )
      return;
    setUpdatingMembershipId(membership.id);
    try {
      const updatedMembership = await updateMemberRoles(membership.id, nextRoleIds);
      const roleNames = updatedMembership.role_details.map((role) => role.name);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("workspace_products.settings.members.role_updated_title"),
        message:
          roleNames.length > 0
            ? t("workspace_products.settings.members.role_updated_message", { names: roleNames.join("、") })
            : t("workspace_products.settings.members.roles_cleared_message"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("workspace_products.settings.members.role_update_failed_title"),
        message: t("workspace_products.settings.members.try_again"),
      });
    } finally {
      setUpdatingMembershipId(null);
    }
  };

  const handleRemove = async () => {
    if (!memberToRemove) return;
    try {
      await removeMember(memberToRemove.membership.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("workspace_products.settings.members.removed_title"),
        message: t("workspace_products.settings.members.removed_message", {
          name: memberToRemove.member.display_name || getMemberFullName(memberToRemove.member),
        }),
      });
    } catch (requestError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("workspace_products.settings.members.remove_failed_title"),
        message: t("workspace_products.settings.members.try_again"),
      });
      throw requestError;
    }
  };

  const tableColumns = [
    {
      key: "full-name",
      content: t("workspace_products.settings.members.columns.full_name"),
      thRender: () => (
        <SortableHeader
          field="full_name"
          label={t("workspace_products.settings.members.columns.full_name")}
          orderBy={orderBy}
          onChange={toggleSort}
        />
      ),
      tdRender: (row: TProductMemberRow) => (
        <ProductMemberNameCell
          row={row}
          workspaceSlug={workspaceSlug}
          removeLabel={t("workspace_products.settings.members.remove")}
          onRemove={setMemberToRemove}
        />
      ),
    },
    {
      key: "display-name",
      content: t("workspace_products.settings.members.columns.display_name"),
      thRender: () => (
        <SortableHeader
          field="display_name"
          label={t("workspace_products.settings.members.columns.display_name")}
          orderBy={orderBy}
          onChange={toggleSort}
        />
      ),
      tdRender: (row: TProductMemberRow) => <div className="w-32 truncate">{row.member.display_name}</div>,
    },
    {
      key: "email",
      content: t("workspace_products.settings.members.columns.email"),
      thRender: () => (
        <SortableHeader
          field="email"
          label={t("workspace_products.settings.members.columns.email")}
          orderBy={orderBy}
          onChange={toggleSort}
        />
      ),
      tdRender: (row: TProductMemberRow) => (
        <div className="w-48 truncate text-secondary">{row.member.email ?? "-"}</div>
      ),
    },
    {
      key: "role",
      content: t("workspace_products.settings.members.columns.role"),
      thRender: () => (
        <SortableHeader
          field="role"
          label={t("workspace_products.settings.members.columns.role")}
          orderBy={orderBy}
          onChange={toggleSort}
        />
      ),
      tdRender: (row: TProductMemberRow) => (
        <ProductMemberRoleCell
          membership={row.membership}
          roles={roles}
          disabled={isRolesLoading || Boolean(rolesError) || updatingMembershipId === row.membership.id}
          onChange={(roleIds) => void handleRoleChange(row.membership, roleIds)}
        />
      ),
    },
    {
      key: "joining-date",
      content: t("workspace_products.settings.members.columns.joining_date"),
      thRender: () => (
        <SortableHeader
          field="joining_date"
          label={t("workspace_products.settings.members.columns.joining_date")}
          orderBy={orderBy}
          onChange={toggleSort}
        />
      ),
      tdRender: (row: TProductMemberRow) => <div>{renderFormattedDate(row.membership.created_at)}</div>,
    },
  ];

  const hasFilters = Boolean(searchQuery.trim() || roleFilters.length > 0);

  return (
    <>
      <AddProductMembersModal
        isOpen={isAddModalOpen}
        memberOptions={memberOptions}
        roles={roles}
        isRolesLoading={isRolesLoading || Boolean(rolesError)}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addMembers}
      />
      {memberToRemove && (
        <ConfirmProductMemberRemove
          isOpen
          displayName={memberToRemove.member.display_name || getMemberFullName(memberToRemove.member)}
          onClose={() => setMemberToRemove(null)}
          onConfirm={handleRemove}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 overflow-x-hidden border-b border-subtle py-2">
        <div className="flex items-center gap-2 text-14 font-semibold text-primary">
          <span>{t("workspace_products.settings.members.title")}</span>
          <span className="rounded bg-layer-1 px-1.5 py-0.5 text-12 font-medium text-tertiary">{members.length}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2 py-1">
            <SearchIcon className="size-3.5 text-tertiary" />
            <input
              className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
              placeholder={t("workspace_products.settings.members.search")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <ProductMemberRoleFilter
            value={roleFilters}
            roles={roles}
            disabled={isRolesLoading || Boolean(rolesError)}
            onChange={setRoleFilters}
          />
          <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
            {t("workspace_products.settings.members.add")}
          </Button>
        </div>
      </div>

      {rolesError && (
        <div className="flex items-center justify-between gap-3 border-b border-subtle px-2.5 py-2 text-12 text-danger-primary">
          <span>{t("workspace_products.settings.members.roles_load_failed")}</span>
          <button type="button" className="font-medium hover:underline" onClick={() => void fetchRoles()}>
            {t("workspace_products.settings.members.retry")}
          </button>
        </div>
      )}

      {isLoading ? (
        <MembersSettingsLoader />
      ) : error ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <SearchX className="size-6 text-placeholder" />
          <p className="text-13 text-secondary">{t("workspace_products.settings.members.load_failed")}</p>
          <Button variant="secondary" onClick={() => void fetchMembers()}>
            {t("workspace_products.settings.members.retry")}
          </Button>
        </div>
      ) : members.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
          <p className="text-13 font-medium text-primary">{t("workspace_products.settings.members.empty")}</p>
          <p className="max-w-sm text-12 text-tertiary">{t("workspace_products.settings.members.empty_description")}</p>
          <Button className="mt-2" variant="secondary" onClick={() => setIsAddModalOpen(true)}>
            {t("workspace_products.settings.members.add")}
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table<TProductMemberRow>
            columns={tableColumns}
            data={visibleRows}
            keyExtractor={(row) => String(row.membership.id)}
            tHeadClassName="border-b border-subtle"
            thClassName="text-left font-medium text-placeholder"
            tHeadTrClassName="divide-x-0"
            tBodyClassName="divide-y-0"
            tBodyTrClassName="h-10 divide-x-0 text-secondary hover:bg-surface-2"
          />
          {visibleRows.length === 0 && (
            <div className="flex min-h-40 items-center justify-center text-13 text-placeholder">
              {t(
                hasFilters
                  ? "workspace_products.settings.members.no_results"
                  : "workspace_products.settings.members.empty"
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
});
