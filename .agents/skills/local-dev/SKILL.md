---
name: local-dev
description: Guidelines for local development and testing of the reorder plugin in an external Medusa backend project. Use this skill only when the task involves deploying, syncing, or locally running the plugin with a backend.
---

# Local development in Medusa backend

This skill describes how to sync local changes in the `reorder` plugin with an external Medusa backend during local development.

## Prerequisites

In the Medusa backend's `package.json` file, declare the plugin dependency using a local file path:
```json
"@reorderjs/reorder": "file:../reorder"
```
Ensure you run `yarn install` in the Medusa backend project after adding or updating this path.

## Synchronization Workflow

When you modify code in this repository (`reorder`) and want the external Medusa backend to import the newest changes:

1. In the `reorder` repository, run:
   ```bash
   yarn medusa plugin:publish
   ```
2. In the Medusa backend project directory, run:
   ```bash
   yarn medusa db:migrate
   ```
3. In the Medusa backend project directory, reinstall the package from the filesystem:
   ```bash
   yarn install
   ```

> [!IMPORTANT]
> Do not assume the Medusa backend is using the newest local plugin code until this entire command sequence has successfully completed.

## Useful Plugin Commands

In the `reorder` directory, you can run:
- `yarn dev` – Runs the process in development mode.
- `yarn build` – Builds the plugin files for production.
