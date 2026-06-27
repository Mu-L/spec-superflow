# Implementation Tasks

## File Structure

- `Create: path/to/new-file.ts` — One-sentence responsibility
- `Modify: path/to/existing.ts` — What changes and why

## Interfaces

### Batch N → Batch M
- **Produces**: `type/function name` — consumed by Batch M for purpose

## 1. Batch 1: [Batch Objective]

- [ ] **1.1 Write the failing test**

```language
// test code with exact assertions
```

**Files**: `Create/Modify: exact/path`

- [ ] **1.2 Run test and confirm it fails**

Run: `exact command`
Expected: FAIL with "specific error message"

- [ ] **1.3 Implement minimal code**

```language
// implementation code
```

**Files**: `Create/Modify: exact/path`
**Interfaces**: Produces `name(type): returnType` — consumed by Batch N

- [ ] **1.4 Run test and confirm it passes**

Run: `exact command`
Expected: PASS

- [ ] **1.5 Commit**

```bash
git add files
git commit -m "feat: description"
```
