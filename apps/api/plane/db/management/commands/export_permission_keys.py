"""把权限注册表导出成前端常量文件。

    python manage.py export_permission_keys            # 写 packages/constants/src/permission-keys.generated.ts
    python manage.py export_permission_keys --check    # 只比对，不一致时非零退出

改了 plane/app/permissions/registry.py 之后跑一次，再 build @plane/constants。
"""

import json
import pathlib

from django.core.management.base import BaseCommand, CommandError

from plane.app.permissions.registry import PERMISSION_DEFS, export_payload

DEFAULT_OUT = pathlib.Path(__file__).resolve().parents[6] / "packages/constants/src/permission-keys.generated.ts"


def render() -> str:
    lines = [
        "/**",
        " * 由 apps/api `python manage.py export_permission_keys` 生成，不要手改。",
        " * 来源：apps/api/plane/app/permissions/registry.py",
        " */",
        "",
        "export const PERMISSION_KEYS = {",
    ]
    for definition in PERMISSION_DEFS:
        name = definition.key.upper().replace(".", "_")
        lines.append(f'  {name}: "{definition.key}",')
    lines += [
        "} as const;",
        "",
        "export type TPermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];",
        "",
        "export type TPermissionScope = \"workspace\" | \"project\";",
        "",
        "export type TPermissionCatalogAction = {",
        "  key: TPermissionKey;",
        "  action: string;",
        "  label: string;",
        "  type_limitable: boolean;",
        "};",
        "",
        "export type TPermissionCatalogModule = {",
        "  key: string;",
        "  label: string;",
        "  actions: TPermissionCatalogAction[];",
        "};",
        "",
        "export type TPermissionCatalogGroup = {",
        "  scope: TPermissionScope;",
        "  label: string;",
        "  modules: TPermissionCatalogModule[];",
        "};",
        "",
        "export type TPermissionCatalog = {",
        "  actions: { action: string; label: string }[];",
        "  groups: TPermissionCatalogGroup[];",
        "};",
        "",
        "/** 权限组编辑器的分组 / 行 / 动作，以及「按动作勾选」的动作顺序 */",
        f"export const PERMISSION_CATALOG: TPermissionCatalog = {json.dumps(export_payload(), ensure_ascii=False, indent=2)};",
        "",
    ]
    return "\n".join(lines)


class Command(BaseCommand):
    help = "Export the permission registry to packages/constants/src/permission-keys.generated.ts"

    def add_arguments(self, parser):
        parser.add_argument("--out", default=str(DEFAULT_OUT))
        parser.add_argument("--check", action="store_true")

    def handle(self, *args, **options):
        out = pathlib.Path(options["out"])
        content = render()
        if options["check"]:
            current = out.read_text(encoding="utf-8") if out.exists() else ""
            if current != content:
                raise CommandError(f"{out} 与注册表不一致，请运行 export_permission_keys")
            self.stdout.write("permission keys are up to date")
            return
        out.write_text(content, encoding="utf-8")
        self.stdout.write(f"wrote {out} ({len(PERMISSION_DEFS)} keys)")
