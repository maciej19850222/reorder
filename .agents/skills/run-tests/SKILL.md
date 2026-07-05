---
name: run-tests
description: Instructions for running and writing unit and integration tests for the reorder plugin. Use this skill when your task requires code validation, writing new tests, or diagnosing test errors.
---

# Testing instructions for Reorder

This skill helps the AI agent effectively write, run, and verify tests for the `reorder` project.

## Core Testing Rules

1. **Run focused tests** for the area you modified whenever possible.
2. **Prefer integration HTTP tests** located in the `integration-tests/http/` directory.
3. **Always add or update tests** if you introduce changes to:
   - API contracts (route handlers)
   - Workflow behaviors (workflows)
   - Job scheduling logic (scheduler jobs)
   - State transitions between different domains
4. **Self-contained tests**: Tests must not depend on pre-seeded data in the database or on the results of other tests. Prepare all necessary fixtures in the `beforeAll` / `beforeEach` block and clean up afterwards.
5. **Documentation alignment**: If you modify plugin behavior described in the documentation (`docs/`), ensure the tests reflect these changes.

## Commands for Running Tests

Use the following scripts from `package.json` in the `reorder` directory:

- Run integration HTTP tests:
  ```bash
  yarn test:integration:http
  ```
- Run integration modules tests:
  ```bash
  yarn test:integration:modules
  ```
- Run all tests:
  ```bash
  yarn test
  ```

To run a single test file, use Jest with the file path, for example:
```bash
yarn jest integration-tests/http/subscriptions.spec.ts
```
