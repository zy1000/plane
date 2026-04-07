# Plane AI Development Guide

## Repository Map

- `apps/api`: Django backend, project/workspace scoped APIs, serializers, permissions, business workflows
- `apps/web`: Main web frontend, React Router app, page orchestration and feature integration
- `packages/shared-state`: Shared MobX state and cross-app business stores
- `packages/ui`: Shared UI components, primitives, and reusable presentation building blocks
- `packages/services`, `packages/types`, `packages/utils`, `packages/constants`: Shared client-side support packages
- `docs`: Human-readable project docs; use it for change maps and AI-facing guidance when the context is cross-cutting

## How To Navigate Changes

- Backend feature or endpoint:
  Start in `apps/api`, usually across model, serializer, view, URL, and permission layers.
- Frontend data integration:
  Start in `apps/web/core/services`, then `apps/web/core/hooks` or store, then the page or component.
- Shared business state:
  Start in `packages/shared-state/src/store`.
- Reusable UI:
  Start in `packages/ui/src`; prefer extending shared primitives only when the behavior is app-agnostic.

## Preferred Layering

- Web frontend should usually follow `service -> hook/store -> component/page`.
- Backend APIs should usually keep validation in serializers and keep views thin.
- Shared state should remain the source of truth for cross-page or cross-feature state, instead of duplicating local component state.
- Shared UI should stay generic; business-specific fetching and state logic belong in `apps/web`.

## Common Terms

- `workspace`: The top-level tenant or organization scope.
- `project`: The project scope within a workspace.
- `issue` / `work item`: The core tracked work object; some newer modules may use `work item` naming while older code still uses `issue`.
- `cycle`, `module`, `view`, `page`: Product concepts with established backend and frontend flows; search for existing implementations before introducing new patterns.

## Editing Rules For AI

- Prefer following existing patterns in the target directory over inventing a new abstraction.
- Do not edit generated output in `dist`, build artifacts, or vendored dependencies.
- For Python backend work, keep project/workspace scoping explicit in querysets and routes.
- For frontend work, avoid putting request details directly in page components when the logic can live in a service or hook.
- If new logic exceeds roughly 30 lines or is likely reusable, extract it into a hook, store helper, or shared component.

## High-Value Entry Points

- `apps/api/AGENTS.md`: Backend API and resource conventions
- `apps/api/plane/app/serializers/AGENTS.md`: Serializer contract and validation guidance
- `apps/api/plane/db/models/AGENTS.md`: Model invariants, constraints, and scope propagation guidance
- `apps/api/plane/app/views/workflow/AGENTS.md`: Workflow and approval endpoint guidance
- `apps/web/AGENTS.md`: Frontend service, hook, and page integration flow
- `apps/web/core/hooks/store/AGENTS.md`: Hook/store synchronization and source-of-truth guidance
- `apps/web/core/services/project/AGENTS.md`: Project-scoped API service guidance
- `apps/web/core/components/issues/AGENTS.md`: Issue detail, modal, layout, and approval UI guidance
- `packages/shared-state/AGENTS.md`: Shared store and filter-state guidance
- `packages/shared-state/src/store/rich-filters/AGENTS.md`: Generic rich-filter engine guidance
- `packages/shared-state/src/store/work-item-filters/AGENTS.md`: Work-item filter instance and sidebar sync guidance
- `packages/ui/AGENTS.md`: Reusable UI component guidance
- `docs/ai-change-map.md`: Fast lookup for common change requests

## Commands

- `pnpm dev` - Start all dev servers (web:3000, admin:3001)
- `pnpm build` - Build all packages and apps
- `pnpm check` - Run all checks (format, lint, types)
- `pnpm check:lint` - OxLint across all packages
- `pnpm check:types` - TypeScript type checking
- `pnpm fix` - Auto-fix format and lint issues
- `pnpm turbo run <command> --filter=<package>` - Target a specific package or app
- `pnpm --filter=@plane/ui storybook` - Start Storybook on port 6006

## Code Style

- Imports: Use `workspace:*` for internal packages and `catalog:` for external dependencies
- TypeScript: Strict mode enabled; keep exported APIs typed
- Formatting: `oxfmt`
- Linting: OxLint with shared config
- Naming: camelCase for values/functions, PascalCase for components/types
- Error handling: keep errors typed and consistent with surrounding code
- State management: MobX stores live in `packages/shared-state`
