# Implementation Plan

## Overview

This task list implements the image storage inconsistency bugfix following the exploratory bugfix workflow. It covers the four distinct fix areas: the upload route default folder guard, the `/uploads` static route redirect, the migration script idempotency fix, and the removal of duplicated inline `normalizeImageUrl` functions from three frontend components. Tasks are ordered: explore the bug first (Property 1), establish preservation baseline (Property 2), then implement and validate.

## Task Dependency Graph

```
Task 1 (Bug Condition Test) → Task 3 (Implementation) → Task 3.7 (Re-run Property 1)
Task 2 (Preservation Test)  → Task 3 (Implementation) → Task 3.8 (Re-run Property 2)
Task 3 (Implementation)     → Task 4 (Migration)      → Task 5 (Integration)
Task 4 (Migration)          → Task 6 (Checkpoint)
Task 5 (Integration)        → Task 6 (Checkpoint)
```

```json
{
  "waves": [
    {
      "tasks": ["1", "2"],
      "description": "Exploration and Preservation Testing (before fix)"
    },
    {
      "tasks": ["3"],
      "description": "Implementation"
    },
    {
      "tasks": ["4"],
      "description": "Database Migration"
    },
    {
      "tasks": ["5"],
      "description": "Integration Testing"
    },
    {
      "tasks": ["6"],
      "description": "Final Checkpoint"
    }
  ]
}
```

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Legacy Path Normalisation
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test that paths matching `isBugCondition` (absolute localhost/production URLs, bare `uploads/...` paths, leading-slash `/uploads/` or `/images/` paths) are NOT stored in MongoDB in canonical `images/<folder>/<YYYY>/<MM>/<uuid>.webp` format
  - Test case 1: Verify `http://localhost:5000/uploads/superfast/2023/04/abc.webp` stored in DB is normalised to `images/superfast/2023/04/abc.webp` when read by API
  - Test case 2: Verify bare `uploads/superfast/2024/01/xyz.webp` stored in DB is normalised to `images/superfast/2024/01/xyz.webp` when read by API
  - Test case 3: Verify `/images/superfast/2024/03/def.webp` stored in DB is normalised to `images/superfast/2024/03/def.webp` when read by API
  - Test case 4: Verify upload endpoint with no `folder` parameter creates path starting with `images/uploads/`
  - Test case 5: Verify frontend `getImageUrl` receiving bare `images/superfast/...` produces double-prefix `/images/images/...`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1a, 1.1b, 1.3a, 1.3b, 1.4, 1.5, 1.6, 1.7_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Input Behaviour
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Test case 1: Verify canonical `images/superfast/2024/01/abc.webp` passes through `toRelativeUrl` unchanged
  - Test case 2: Verify Cloudinary URLs containing `res.cloudinary.com` pass through `toRelativeUrl` and `getImageUrl` unchanged
  - Test case 3: Verify `data:` base64 strings pass through all helper functions unchanged
  - Test case 4: Verify `blob:` object URLs pass through all helper functions unchanged
  - Test case 5: Verify `processAndSaveImage` with non-legacy folders (e.g. `food/restaurants/profile`) produces `images/<folder>/<YYYY>/<MM>/<uuid>.webp`
  - Test case 6: Verify `deleteImage` strips both `images/` and `uploads/` prefixes when resolving file paths
  - Test case 7: Verify `sanitizeBodyToRelative` middleware continues to strip base URLs from known image fields
  - Test case 8: Verify external CDN URLs render directly in frontend without backend origin prepending
  - Test case 9: Verify migration script leaves all non-image fields unchanged
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 3. Fix for image storage inconsistency

  - [ ] 3.1 Update upload route default folder guard
    - Open `Backend/src/modules/uploads/routes/upload.routes.js`
    - Replace the fallback `'uploads'` with `'misc'`
    - Reject the literal string `'uploads'` as a caller-supplied folder value
    - Change: `const raw = typeof req.body?.folder === 'string' ? req.body.folder.trim() : '';`
    - Change: `const folder = (raw && raw !== 'uploads') ? raw : 'misc';`
    - _Bug_Condition: isBugCondition(path) where path starts with `images/uploads/` due to default folder being `'uploads'`_
    - _Expected_Behavior: Upload endpoint SHALL substitute safe default folder name (e.g. `'misc'`) when folder parameter equals `'uploads'` or empty, so resulting path never becomes `images/uploads/...`_
    - _Preservation: Non-legacy folder uploads (e.g. `food/restaurants/profile`) SHALL continue to produce `images/<folder>/<YYYY>/<MM>/<uuid>.webp` paths_
    - _Requirements: 1.5, 2.5_

  - [ ] 3.2 Convert `/uploads` static route to redirect
    - Open `Backend/src/app.js`
    - Keep `/images` static route unchanged
    - Convert `/uploads` from transparent static alias to `301` redirect
    - Add redirect middleware: `app.use('/uploads', (req, res) => { res.redirect(301, \`/images\${req.path}\`); });`
    - Remove or comment out the existing `app.use('/uploads', express.static(...))` line
    - _Bug_Condition: isBugCondition(path) where path starts with `/uploads/` and VPS only serves files under `/images`_
    - _Expected_Behavior: `/uploads` route SHALL redirect to `/images` so legacy browser requests resolve, but route is no longer a writable primary path_
    - _Preservation: `/images` static route SHALL continue to serve files unchanged_
    - _Requirements: 1.1b, 2.4_

  - [ ] 3.3 Add `isCanonical` pre-filter to migration script
    - Open `Backend/scripts/migrate-urls-to-relative.js`
    - Add `isCanonical` function to skip values already in correct `images/...` form
    - Implementation: `const isCanonical = (val) => typeof val === 'string' && /^images\/.+/.test(val.trim()) && !/^https?:\/\//i.test(val.trim());`
    - In `shouldConvertToRelative`, add early exit: `if (isCanonical(t)) return false;`
    - _Bug_Condition: isBugCondition(path) for any path NOT matching canonical `images/<folder>/...` format_
    - _Expected_Behavior: Migration script SHALL skip already-canonical paths so it is truly idempotent (second run finds zero updates)_
    - _Preservation: Migration script SHALL leave all non-image fields unchanged_
    - _Requirements: 2.8a, 2.8c_

  - [ ] 3.4 Remove inline `normalizeImageUrl` from Restaurants.jsx
    - Open `Frontend/src/modules/Food/pages/user/restaurants/Restaurants.jsx`
    - Remove the inline `normalizeImageUrl` function declaration
    - Remove the `BACKEND_ORIGIN` constant if present
    - Import shared helper at top: `import { getImageUrl } from '@/shared/utils/imageHelper.js';`
    - Replace all `normalizeImageUrl(...)` call sites with `getImageUrl(...)`
    - Update `pickRestaurantImage` function to use `getImageUrl`
    - _Bug_Condition: isBugCondition(path) - inline function does not correctly handle `uploads/` vs `images/` distinction on VPS_
    - _Expected_Behavior: Component SHALL use shared `getImageUrl` helper from `imageHelper.js` rather than defining its own inline URL-normalization function_
    - _Preservation: Correct `images/...` paths SHALL continue to render properly_
    - _Requirements: 1.7, 2.7a, 2.7b_

  - [ ] 3.5 Remove inline `normalizeImageUrl` from BakeryList.jsx
    - Open `Frontend/src/modules/Food/pages/user/restaurants/BakeryList.jsx`
    - Remove the inline `normalizeImageUrl` function declaration
    - Remove the `BACKEND_ORIGIN` constant if present
    - Import shared helper at top: `import { getImageUrl } from '@/shared/utils/imageHelper.js';`
    - Replace all `normalizeImageUrl(...)` call sites with `getImageUrl(...)`
    - Update `pickRestaurantImage` function to use `getImageUrl`
    - _Bug_Condition: isBugCondition(path) - inline function does not correctly handle `uploads/` vs `images/` distinction on VPS_
    - _Expected_Behavior: Component SHALL use shared `getImageUrl` helper from `imageHelper.js` rather than defining its own inline URL-normalization function_
    - _Preservation: Correct `images/...` paths SHALL continue to render properly_
    - _Requirements: 1.7, 2.7a, 2.7b_

  - [ ] 3.6 Remove inline `normalizeImageUrl` from Categories.jsx
    - Open `Frontend/src/modules/Food/pages/user/Categories.jsx`
    - Remove the inline `normalizeImageUrl` function declaration
    - Remove the `BACKEND_ORIGIN` constant if present
    - Import shared helper at top: `import { getImageUrl } from '@/shared/utils/imageHelper.js';`
    - Replace all `normalizeImageUrl(...)` call sites with `getImageUrl(...)`
    - Update image `src` expression to use `getImageUrl`
    - _Bug_Condition: isBugCondition(path) - inline function does not correctly handle `uploads/` vs `images/` distinction on VPS_
    - _Expected_Behavior: Component SHALL use shared `getImageUrl` helper from `imageHelper.js` rather than defining its own inline URL-normalization function_
    - _Preservation: Correct `images/...` paths SHALL continue to render properly_
    - _Requirements: 1.7, 2.7a, 2.7b_

  - [ ] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Legacy Path Normalisation
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - Verify all test cases now pass:
      - Absolute URLs are normalised to canonical form
      - Bare `uploads/...` paths are normalised to `images/...`
      - Leading-slash paths are normalised correctly
      - Upload endpoint with no folder creates `images/misc/...` paths
      - Frontend `getImageUrl` does not produce double-prefix
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1a, 2.1b, 2.1c, 2.2, 2.3, 2.5, 2.6, 2.7a_

  - [ ] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Input Behaviour
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - Verify all preservation test cases still pass:
      - Canonical paths pass through unchanged
      - Cloudinary URLs preserved
      - `data:` and `blob:` values unchanged
      - Non-legacy folder uploads work correctly
      - `deleteImage` strips both prefixes
      - `sanitizeBodyToRelative` continues to work
      - External CDN URLs render properly
      - Migration script preserves non-image fields
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 4. Run migration script and verify idempotency
  - Back up the MongoDB database before running migration
  - Run `node Backend/scripts/migrate-urls-to-relative.js` against the live database
  - Verify script completes with exit code 0
  - Verify script output includes total documents updated
  - Run script a second time on already-migrated data
  - Verify second run reports zero documents updated (idempotency confirmed)
  - Verify all non-image fields remain unchanged
  - _Requirements: 2.8a, 2.8b, 2.8c, 2.8d, 3.8_

- [ ] 5. Integration testing
  - Test full upload flow: POST image with no `folder` parameter → verify DB stores `images/misc/...`
  - Test static route: GET `/images/misc/...` returns 200
  - Test redirect: GET `/uploads/misc/...` returns 301 redirect to `/images/misc/...`
  - Test read flow: Seed MongoDB with legacy `http://localhost:5000/uploads/...` path → call API → verify response contains full `https://.../images/...` URL
  - Test frontend rendering: Mount Restaurants.jsx, BakeryList.jsx, Categories.jsx → verify all `<img>` elements have `src` with backend origin and `/images/`, not `/uploads/` or `/images/images/`
  - _Requirements: 2.1a, 2.2, 2.4, 2.6, 2.7a_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all unit tests pass
  - Ensure all property-based tests pass
  - Ensure all integration tests pass
  - Ensure migration script is idempotent
  - Verify no regressions in existing functionality
  - Ask the user if questions arise

## Notes

- No changes are required to `storage.service.js`, `urlHelper.js`, `imageHelper.js`, or the migration script summary/exit-code logic — they already implement correct behaviour.
- The `/uploads` route should be retained as a redirect (not removed entirely) to avoid breaking any bookmarked or cached URLs during the transition window.
- Back up MongoDB before running the migration script.
- The `isBugCondition` pseudocode in the design document is the authoritative source for identifying defective path values across all test cases.
- Property-based testing is strongly recommended for the preservation tests (Task 2) because the input domain (arbitrary path strings) is too large to enumerate manually.
