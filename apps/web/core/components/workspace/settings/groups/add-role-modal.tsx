/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import type { IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { ShieldIcon } from "lucide-react";

type Props = {
  isOpen: boolean;
  availableRoles: IWorkspaceRole[];
  existingRoles: IWorkspaceGroupRole[];
  onClose: () => void;
  onAdd: (roleId: string) => Promise<void>;
};

export function AddRoleModal({ isOpen, availableRoles, existingRoles, onClose, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setSearch("");
  }, [isOpen]);

  const existingRoleIds = useMemo(
    () => new Set(existingRoles.map((gr) => gr.role)),
    [existingRoles]
  );

  const filtered = useMemo(
    () =>
      availableRoles.filter(
        (role) =>
          !existingRoleIds.has(role.id) &&
          role.name.toLowerCase().includes(search.toLowerCase())
      ),
    [availableRoles, existingRoleIds, search]
  );

  const handleAdd = async (roleId: string) => {
    setAdding(roleId);
    try {
      await onAdd(roleId);
    } finally {
      setAdding(null);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.MD}>
      <div className="flex flex-col gap-0 p-5">
        <h3 className="text-body-lg-medium text-primary mb-4">添加角色</h3>

        <div className="flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 mb-3">
          <SearchIcon className="size-3.5 shrink-0 text-placeholder" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索角色..."
            className="min-w-0 flex-1 bg-transparent text-body-sm-regular text-primary outline-none placeholder:text-placeholder"
          />
        </div>

        <div className="max-h-72 overflow-y-auto -mx-5 px-5 divide-y divide-subtle">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-body-sm-regular text-tertiary">
              {search ? "没有匹配的角色" : availableRoles.length === 0 ? "暂无可用角色" : "所有角色已在组中"}
            </p>
          ) : (
            filtered.map((role) => (
              <div key={role.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-layer-transparent-hover">
                    <ShieldIcon className="size-3.5 text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-body-sm-medium text-primary">{role.name}</p>
                    {role.description && (
                      <p className="truncate text-body-xs-regular text-tertiary">{role.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => handleAdd(role.id)}
                  loading={adding === role.id}
                  className="shrink-0"
                >
                  添加
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-4 mt-2 border-t border-subtle">
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
