# Design Document — Image Storage Inconsistency Fix

## Overview

This fix standardises all image path handling across the stack so that MongoDB only ever holds paths in the form `images/<folder>/<YYYY>/<MM>/<uuid>.webp`, every API response presents a full URL to the client, and the frontend always constructs that URL through a single shared helper rather than duplicated inline functions.

The changes touch six distinct areas:

1. `toRelativeUrl` / `sanitizeBodyToRelative` — backend normalisation helpers  
2. `processAndSaveImage` — storage service write path  
3. `upload.routes.js` — generic upload endpoint default folder guard  
4. `app.js` — static-file middleware `/uploads` route  
5. `migrate-urls-to-relative.js` — one-time database clean-up script  
6. Frontend — `getImageUrl` double-prefix guard + removal of inline `normalizeImageUrl` functions in `Restaurants.jsx`, `BakeryList.jsx`, and `Categories.jsx`

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an image path stored in MongoDB that does NOT match the canonical `images/<folder>/...` format (e.g. starts with `uploads/`, contains an absolute URL like `http://localhost:5000/...`, or has a leading slash `/images/...`).
- **Property (P)**: The desired behavior — every image path persisted to MongoDB is a relative path matching `images/<folder>/<YYYY>/<MM>/<uuid>.webp` with no scheme, no host, and no leading slash; and every API response includes a fully-qualified URL constructed from that path.
- **Preservation**: Existing behaviors that must remain unchanged — correct `images/…` paths pass through unmodified, Cloudinary URLs are left intact, `data:` and `blob:` values are untouched, and non-image fields are never altered.
- **toRelativeUrl**: A utility in `Backend/src/utils/urlHelper.js` that converts absolute or prefixed image URLs to the canonical `images/…` relative form.
- **sanitizeBodyToRelative**: Express middleware that applies `toRelativeUrl` to known image fields on every incoming `POST`/`PUT`/`PATCH` request body before it reaches any controller.
- **processAndSaveImage**: The function in `Backend/src/services/storage.service.js` responsible for writing uploaded image buffers to disk and returning the canonical relative path.
- **getImageUrl**: A frontend helper in `Frontend/src/shared/utils/imageHelper.js` that prepends the backend origin to a relative path to form a fully-qualified image URL.
- **transformImageFields**: A response-layer wrapper in `app.js` that runs `getImageUrl` over known image fields before the JSON response is sent to the client.
- **isCanonical**: A proposed guard function that identifies paths already in the correct `images/…` format so the migration script does not touch them unnecessarily.
- **Legacy uploads/ path**: Any MongoDB image value that starts with `uploads/` (with or without a leading slash) or an absolute URL whose path component begins with `/uploads/` — the defective format left by the original Cloudinary-to-local migration script.

---

## Bug Details

### Bug Condition

The bug manifests when MongoDB contains image paths written by `migrate-cloudinary-to-local.js` that use the `uploads/` prefix (e.g. `http://localhost:5000/uploads/superfast/...` or bare `uploads/superfast/...`) instead of the canonical `images/` prefix. The Express server serves static files under both `/images` and `/uploads` on localhost, so images appear to render in development — masking the defect. On production VPS, where files are stored exclusively under `/images`, these legacy paths resolve to HTTP 404 and images render as broken or plain text.

Secondary manifestations: the generic upload endpoint defaults the folder to `'uploads'` when no folder is specified, creating `images/uploads/...` paths that are doubly-prefixed; inline `normalizeImageUrl` functions in page components duplicate URL-resolution logic inconsistently; and the frontend `getImageUrl` helper can produce `images/images/...` double-prefixes if a bare `images/...` relative path reaches it.

**Formal Specification:**
```
FUNCTION isBugCondition(path)
  INPUT: path — a string value stored or about to be stored in a MongoDB image field
  OUTPUT: boolean

  IF path is NULL or empty                          THEN RETURN false
  IF path starts with "data:" or "blob:"            THEN RETURN false
  IF path contains "res.cloudinary.com"             THEN RETURN false
  IF path matches "^images\/[^\/].*" (canonical)   THEN RETURN false

  // Bug condition: any of the following forms is defective
  RETURN path starts with "http://localhost"
      OR path starts with "http://127.0.0.1"
      OR path contains "superfastfood.in"
      OR path starts with "/uploads/"
      OR path starts with "/images/"
      OR path starts with "uploads/"
      OR path is an external-domain URL containing "/uploads/" or "/images/"
END FUNCTION
```

### Examples

- **Absolute localhost URL** — DB contains `http://localhost:5000/uploads/superfast/2023/04/abc.webp`; expected stored value: `images/superfast/2023/04/abc.webp`. On VPS the full URL resolves to 404.
- **Bare uploads/ path** — DB contains `uploads/food/restaurants/profile/2024/01/xyz.webp`; expected stored value: `images/food/restaurants/profile/2024/01/xyz.webp`. The `/uploads` static route is absent on VPS.
- **Leading-slash /images/ path** — DB contains `/images/superfast/2024/03/def.webp`; expected stored value: `images/superfast/2024/03/def.webp`. `getImageUrl` prepends the origin to produce `http://localhost:5000//images/...` (double slash) in some code paths.
- **Double-prefixed folder** — Upload endpoint saves `images/uploads/2024/06/ghi.webp` when no folder is provided; expected stored value: `images/misc/2024/06/ghi.webp`.
- **Double-prefix in frontend** — `getImageUrl` receives bare `images/superfast/...` (no leading slash) and can produce `/images/images/superfast/...` if guard logic is absent.
- **Already-correct path** (no bug) — DB contains `images/food/restaurants/profile/2024/01/abc.webp`; this value passes through all helpers unchanged.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Image paths already stored in MongoDB in the canonical `images/<folder>/<YYYY>/<MM>/<uuid>.webp` format SHALL pass through `toRelativeUrl`, `transformImageFields`, and `getImageUrl` without modification, duplication, or double-prefix (req 3.1).
- Cloudinary-hosted image URLs (containing `res.cloudinary.com`) SHALL be returned unchanged by both `toRelativeUrl` and `getImageUrl` (req 3.2).
- `data:` base64 strings and `blob:` object URLs SHALL pass through all helper functions unchanged (req 3.3).
- `processAndSaveImage` calls using non-legacy folders (e.g. `food/restaurants/profile`, `quick-commerce/categories`) SHALL continue to produce paths of the form `images/<folder>/<YYYY>/<MM>/<uuid>.webp` without any change to folder organisation (req 3.4).
- `deleteImage` SHALL continue to strip both `images/` and `uploads/` prefixes when resolving a file path for deletion on disk (req 3.5).
- `sanitizeBodyToRelative` middleware SHALL continue to strip base URLs from known image fields on every `POST`/`PUT`/`PATCH` request as a defence-in-depth layer (req 3.6).
- Fully-qualified external CDN image URLs stored in MongoDB (e.g. quick-commerce seed product images) SHALL continue to render directly in the frontend without the backend origin being prepended (req 3.7).
- The migration script SHALL leave all non-image, non-URL fields in every MongoDB document completely unchanged (req 3.8).

**Scope:**
All inputs that do NOT satisfy `isBugCondition` — i.e. correct `images/…` relative paths, Cloudinary URLs, `data:` / `blob:` strings, and all non-image fields — SHALL be completely unaffected by this fix.

---

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely causes are:

1. **Migration script wrote absolute localhost URLs**: `migrate-cloudinary-to-local.js` constructed `http://localhost:5000/uploads/...` absolute URLs and persisted them directly to MongoDB. Subsequent partial migrations and `sanitizeBodyToRelative` normalised some but not all of these records, leaving a mixed state.

2. **Dual static routes mask the defect in development**: `app.js` mounts express.static under both `/images` and `/uploads`, so both path formats resolve successfully on localhost. The bug only manifests on the VPS where only the `/images` route is backed by actual files, making it invisible during local development and QA.

3. **Generic upload endpoint defaults to the `'uploads'` folder name**: `upload.routes.js` falls back to `folder = 'uploads'` when the client omits the `folder` parameter. `processAndSaveImage` then prepends `images/` to produce `images/uploads/<uuid>.webp` — a semantically incorrect and confusing double-component path.

4. **`isCanonical` guard absent from migration script**: `migrate-urls-to-relative.js` matches paths with the regex `/^\/?(uploads|images)\//i`, which also matches already-correct `images/…` values. While `toRelativeUrl` returns them unchanged, the script still counts them as updates, making idempotency reporting inaccurate.

5. **Inline `normalizeImageUrl` functions in page components**: `Restaurants.jsx`, `BakeryList.jsx`, and `Categories.jsx` each define their own URL-normalisation logic that does not correctly handle the `uploads/` vs `images/` distinction on VPS. When `getImageUrl` in `imageHelper.js` is improved, these components remain unpatched and diverge in behaviour.

6. **Frontend `getImageUrl` double-prefix risk**: When a raw relative `images/superfast/…` value (no leading slash) reaches the frontend helper without passing through `transformImageFields`, the guard `!pathPart.startsWith('/images/')` does not catch it (because the path lacks the leading slash), risking a `/images/images/…` result.

---

## Correctness Properties

Property 1: Bug Condition - Legacy Path Normalisation

_For any_ image path value where `isBugCondition(path)` returns `true` (absolute localhost/production URLs,
bare `uploads/…` paths, leading-slash `/uploads/` or `/images/` paths), the fixed system SHALL store and
serve only the canonical relative form `images/<folder>/<YYYY>/<MM>/<uuid>.webp` with no scheme, no host,
and no leading slash — both in the MongoDB write path and in any API response.
**Validates: Requirements 1.3a, 1.3b, 2.1a, 2.1b, 2.1c, 2.2, 2.3, 2.8a**


Property 2: Preservation - Non-Buggy Input Behaviour

_For any_ image path value where `isBugCondition(path)` returns `false` (canonical `images/…` paths, Cloudinary URLs, `data:`/`blob:` strings) and for all non-image fields, the fixed system SHALL produce exactly the same result as the original system — passing such values through unchanged without modification, truncation, or double-prefix.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

---

## Fix Implementation

### Changes Required

Assuming the root cause analysis above is correct, the following targeted changes are needed:

**File: `Backend/src/modules/uploads/routes/upload.routes.js`**  
**Requirement(s): 1.5, 2.5**

1. **Default folder guard**: Replace the fallback `'uploads'` with `'misc'` and reject the literal string `'uploads'` as a caller-supplied folder value:
   ```js
   const raw = typeof req.body?.folder === 'string' ? req.body.folder.trim() : '';
   const folder = (raw && raw !== 'uploads') ? raw : 'misc';
   ```

---

**File: `Backend/src/app.js`**  
**Requirement(s): 1.1b, 2.4**

2. **Convert `/uploads` static route to a redirect**: Keep the `/images` static route unchanged. Convert `/uploads` from a transparent static alias to a `301` redirect so legacy browser requests still resolve, but the route is no longer a writable primary path:
   ```js
   // Primary static route
   app.use('/images', express.static(storageDir, staticOptions), express.static(localUploadsDir, staticOptions));

   // Backward-compat redirect only
   app.use('/uploads', (req, res) => {
     res.redirect(301, `/images${req.path}`);
   });
   ```

---

**File: `Backend/scripts/migrate-urls-to-relative.js`**  
**Requirement(s): 2.8a, 2.8c**

3. **Add `isCanonical` pre-filter**: Skip values that are already in the correct `images/…` form so they are not counted as updates and the script is truly idempotent:
   ```js
   const isCanonical = (val) =>
     typeof val === 'string' &&
     /^images\/.+/.test(val.trim()) &&
     !/^https?:\/\//i.test(val.trim());

   // In shouldConvertToRelative, add early exit:
   if (isCanonical(t)) return false;
   ```

---

**Files: `Frontend/src/modules/Food/pages/user/restaurants/Restaurants.jsx`,  
`Frontend/src/modules/Food/pages/user/restaurants/BakeryList.jsx`,  
`Frontend/src/modules/Food/pages/user/Categories.jsx`**  
**Requirement(s): 1.7, 2.7a, 2.7b**

4. **Remove inline `normalizeImageUrl` / `BACKEND_ORIGIN` declarations** from each of the three components.

5. **Import shared helper** at the top of each file:
   ```js
   import { getImageUrl } from '@/shared/utils/imageHelper.js';
   ```

6. **Replace all `normalizeImageUrl(…)` call sites** with `getImageUrl(…)`. In `Restaurants.jsx` and `BakeryList.jsx` the replacement is a single-line change inside `pickRestaurantImage`; in `Categories.jsx` it is a single call site in the image `src` expression.

---

**No changes required** to `storage.service.js` (already returns canonical paths), `src/utils/urlHelper.js` `toRelativeUrl` (already handles all known bad forms), `imageHelper.js` `getImageUrl` (the existing guard correctly prevents double-prefix for the current backend output), or the migration script's summary/exit-code logic (already correct).

---

## Architecture

### Canonical path contract

**Write path (all routes):**  
`Buffer → processAndSaveImage(buffer, folder) → images/<folder>/<YYYY>/<MM>/<uuid>.webp` saved to MongoDB

**Read path (API responses):**  
MongoDB value `images/…` → `transformImageFields` → `getImageUrl` → `http(s)://<host>/images/…`

**Frontend render path:**  
API response field (already a full URL from `transformImageFields`) → `getImageUrl` helper → `<img src>` / `background-image`

The invariant is: **MongoDB stores only `images/…` relative paths. Clients receive only full URLs.**

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug manifestation on the unfixed code to confirm the root cause analysis, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that feed known-defective path strings into `toRelativeUrl`, `getImageUrl`, and `processAndSaveImage`, and simulate the upload endpoint with a missing `folder` parameter. Run these tests against the **unfixed** code to observe the failures and understand the root cause.

**Test Cases**:
1. **Absolute localhost URL normalisation**: Feed `http://localhost:5000/uploads/superfast/2023/04/abc.webp` into `toRelativeUrl` — assert output equals `images/superfast/2023/04/abc.webp` (will pass on unfixed code because `toRelativeUrl` already handles this; confirms this helper is not the defect location).
2. **Frontend double-prefix**: Feed bare `images/superfast/2024/01/abc.webp` into frontend `getImageUrl` — assert output does NOT contain `images/images/` (may fail on unfixed code if guard is absent).
3. **Default folder produces `images/uploads/…`**: POST to `/v1/uploads/image` without a `folder` body parameter — assert the saved path does NOT start with `images/uploads/` (will fail on unfixed code, confirms req 1.5).
4. **`/uploads` route returns 200 on localhost**: GET `/uploads/superfast/2023/04/abc.webp` — assert response is 200 (will pass on unfixed code, confirming the static alias masks the defect).
5. **Migration script idempotency**: Run the migration script twice on a seeded dataset of already-canonical `images/…` paths — assert `documentsUpdated = 0` on the second run (will fail on unfixed code if `isCanonical` guard is absent).

**Expected Counterexamples**:
- Upload endpoint returns a path of the form `images/uploads/<uuid>.webp` when `folder` is omitted.
- Frontend `getImageUrl` returns `/images/images/superfast/…` for a bare `images/superfast/…` input.
- Migration script second run reports non-zero `documentsUpdated` for already-correct data.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system produces the canonical correct output.

**Pseudocode:**
```
FOR ALL path WHERE isBugCondition(path) DO
  result := toRelativeUrl_fixed(path)
  ASSERT result MATCHES /^images\/.+/
  ASSERT result NOT CONTAINS "://"
  ASSERT result NOT STARTS WITH "/"
  ASSERT result NOT STARTS WITH "uploads/"
END FOR

FOR ALL uploadRequest WHERE uploadRequest.folder IS ABSENT OR uploadRequest.folder = 'uploads' DO
  savedPath := uploadRoute_fixed(uploadRequest)
  ASSERT savedPath NOT STARTS WITH "images/uploads/"
  ASSERT savedPath STARTS WITH "images/misc/"
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system produces the same result as the original.

**Pseudocode:**
```
FOR ALL path WHERE NOT isBugCondition(path) DO
  ASSERT toRelativeUrl_original(path) = toRelativeUrl_fixed(path)
  ASSERT getImageUrl_original(path) = getImageUrl_fixed(path)
END FOR

FOR ALL doc IN mongodb WHERE ALL image fields match canonical form DO
  ASSERT migrationScript_fixed finds 0 updates for doc
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many path string variants automatically, catching edge cases that hand-crafted unit tests miss.
- It provides strong guarantees that `toRelativeUrl` and `getImageUrl` remain unchanged for already-correct inputs.
- It can exhaustively verify the `isCanonical` guard over a large sample of path strings.

**Test Cases**:
1. **Canonical path pass-through**: Verify `toRelativeUrl('images/superfast/2024/01/abc.webp')` returns the input unchanged before and after the fix.
2. **Cloudinary URL preservation**: Verify Cloudinary URLs pass through `toRelativeUrl` and `getImageUrl` unchanged.
3. **`data:` / `blob:` pass-through**: Verify neither helper mutates base64 or blob strings.
4. **Migration idempotency**: Run the fixed migration script twice on a dataset mixing legacy and canonical paths; assert the second run reports zero updates.
5. **Folder-specified uploads unchanged**: POST to the upload endpoint with `folder = 'food/restaurants/profile'` and assert the saved path is `images/food/restaurants/profile/<YYYY>/<MM>/<uuid>.webp`.

### Unit Tests

- Test `toRelativeUrl` with every known defective form: absolute localhost, absolute VPS, `/uploads/…`, `/images/…`, bare `uploads/…`, multi-segment Cloudinary URL, `data:`, `blob:`.
- Test `getImageUrl` (frontend) with bare `images/…`, `/images/…`, full `https://…` URL, Cloudinary URL, null/empty input.
- Test the upload route default-folder guard: absent `folder`, empty string `folder`, literal `'uploads'` `folder`, valid `folder`.
- Test `isCanonical` guard in migration script with canonical paths, all defective forms, Cloudinary URLs, and empty strings.

### Property-Based Tests

- Generate random strings prefixed with `http://localhost:<port>/uploads/` and verify `toRelativeUrl` always produces a canonical `images/…` output.
- Generate random canonical `images/<n>/<m>/<uuid>.webp` strings and verify `toRelativeUrl` returns them unchanged (preservation property).
- Generate random folder name strings (excluding `'uploads'` and empty) and verify the upload route always produces `images/<folder>/…` paths.
- Generate mixed datasets of canonical and defective MongoDB image field values and verify the migration script's `updatesCount` exactly equals the number of non-canonical values in the dataset.

### Integration Tests

- Full upload flow: POST an image with no `folder` parameter → assert DB stores `images/misc/…` → assert GET `/images/misc/…` returns 200 → assert GET `/uploads/misc/…` returns 301 redirect to `/images/misc/…`.
- Full read flow: Seed MongoDB with a legacy `http://localhost:5000/uploads/…` path → call the relevant API endpoint → assert the response JSON contains a full `https://…/images/…` URL with no `uploads/` segment.
- Frontend rendering: Mount `Restaurants.jsx`, `BakeryList.jsx`, and `Categories.jsx` in a test environment with a mocked API returning `images/…` relative paths — assert all `<img>` elements have `src` values that start with the backend origin and contain `/images/`, not `/uploads/` or `/images/images/`.
- Migration script end-to-end: Run against a seeded test database → assert all documents updated → assert second run reports zero updates (idempotent) → assert all non-image fields are unchanged.

---

## Files Changed

| File | Change type | Requirement(s) |
|---|---|---|
| `Backend/src/modules/uploads/routes/upload.routes.js` | Edit — default folder guard | 1.5, 2.5 |
| `Backend/src/app.js` | Edit — `/uploads` redirect | 1.1b, 2.4 |
| `Backend/scripts/migrate-urls-to-relative.js` | Edit — `isCanonical` guard | 2.8a, 2.8c |
| `Frontend/src/modules/Food/pages/user/restaurants/Restaurants.jsx` | Edit — remove inline helper | 1.7, 2.7a, 2.7b |
| `Frontend/src/modules/Food/pages/user/restaurants/BakeryList.jsx` | Edit — remove inline helper | 1.7, 2.7a, 2.7b |
| `Frontend/src/modules/Food/pages/user/Categories.jsx` | Edit — remove inline helper | 1.7, 2.7a, 2.7b |

`storage.service.js`, `urlHelper.js` (backend), `imageHelper.js` (frontend), and the migration script summary/exit-code logic require **no structural changes** — they already implement the correct behaviour.

---

## Regression Safeguards

- `toRelativeUrl`: Cloudinary URLs (`res.cloudinary.com`), `data:`, and `blob:` values are returned unchanged (req 3.2, 3.3).
- `transformImageFields`: Already-correct `images/…` paths pass through `getImageUrl` and gain the correct host prefix without duplication (req 3.1).
- `deleteImage`: Strips both `images/` and `uploads/` prefixes before resolving the file path on disk — unchanged (req 3.5).
- `sanitizeBodyToRelative`: Continues to strip base URLs from known image fields on every `POST`/`PUT`/`PATCH` (req 3.6).
- External CDN URLs (e.g. quick-commerce seed data) pass through `getImageUrl` unchanged because they start with `https://` and do not match localhost/127.0.0.1/superfastfood.in (req 3.7).
- Migration script only modifies matching URL fields; all other fields are untouched (req 3.8).
