# Contributing

Thanks for helping improve AI ToDo.

## Before you start

1. Create a focused branch for your change.
2. Keep secrets, local databases, installers, and generated directories out of commits.
3. Describe the user-visible behavior and the tests that cover it.

## Verification

From the repository root, run:

```powershell
npm ci
npm run verify
```

For packaging-related changes, also run:

```powershell
npm run dist:win
npm run test:desktop
```

Please avoid committing the generated dist/, release/, test-results/, or node_modules/ directories.
