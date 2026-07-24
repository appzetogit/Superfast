# Bugfix Requirements Document

## Introduction

After migrating from Cloudinary to VPS-based local storage, MongoDB ended up storing image paths in two inconsistent formats: some records use `uploads/...` (a legacy format from the original Cloudinary migration script) and others use `images/...` (the current standard). This dual-format state causes images to render correctly in one environment but fail silently or display as plain text in the other, depending on which static-serving route the Express server resolves first.

The root cause is a migration script (`migrate-cloudinary-to-local.js`) that constructed absolute `http://localhost:5000/uploads/...` URLs and wrote them into MongoDB. Subsequent partial migration scripts and `sanitizeBodyToRelative` middleware converted some—but not all—of those paths to the `images/` prefix, leaving a mixed state in the database. New uploads made after the migration write `images/...` correctly, but legacy records still carry `uploads/...` paths.

The fix must eliminate all `uploads/...` paths from MongoDB, standardise every code path that saves or resolves image paths to use `images/...`, and ensure the frontend helper constructs the correct full URL for both localhost and production without storing environment-specific URLs in the database.

---

## Bug Analysis

### Current Behavior (Defect)

1.1a WHEN the API reads an image path from MongoDB that starts with `uploads/` (without the `images/` prefix) AND returns it to the client THEN the system SHALL normalise that value to `images/<remainder>` before it is included in any API response, so the client never receives a bare `uploads/` path.

1.1b WHEN a client requests `GET /uploads/<path>` on a production VPS where files are stored under `/images` THEN the server SHALL respond with HTTP 404 (or redirect to `/images/<path>`), meaning legacy `uploads/...` values stored in MongoDB cause broken image renders on production without the normalisation described in 1.1a.

1.2a WHEN the static-file middleware is configured AND a request arrives for `/images/<path>` on localhost THEN the system SHALL respond with HTTP 200 and the correct file, provided `config.vpsStoragePath` resolves to a directory that actually contains the file under the same subpath.

1.2b IF an image path is stored in MongoDB without a leading slash (e.g. `images/superfast/...`) AND `getImageUrl` prepends the backend origin to construct the full URL THEN the system SHALL produce a well-formed URL without double-slash or double-prefix (e.g. `http://localhost:5000/images/superfast/...`).

1.3a WHEN any image path value is read from MongoDB THEN the system SHALL treat it as correctly stored ONLY IF it matches the pattern `images/<one-or-more-path-segments>` with no scheme, no host, and no leading slash — any value that does not match this pattern is considered a defect requiring normalisation.

1.3b WHEN any code path writes an image path to MongoDB THEN the system SHALL convert absolute URLs of the forms `http://localhost:<port>/...`, `http://127.0.0.1:<port>/...`, `https://superfastfood.in/...`, `/uploads/...`, or `/images/...` to the corresponding relative `images/<remainder>` path before the `save()` / `findOneAndUpdate()` / `insertOne()` call executes.

1.3c WHEN the `migrate-urls-to-relative.js` migration script completes a run THEN the system SHALL print a summary including the number of collections scanned, documents updated, and fields updated, and SHALL exit with code 0 on success and code 1 on any connection or write error.

1.4 WHEN the `sanitizeBodyToRelative` middleware processes an outgoing write request body THEN the system normalises only the fields whose keys match the `isImageKey` heuristic; fields with non-standard key names or paths not detected by the heuristic bypass normalisation and may persist with the wrong prefix or as absolute URLs.

1.5 WHEN the `upload.routes.js` generic upload endpoint receives a file and the `folder` body parameter is absent or defaults to `'uploads'` THEN the system calls `processAndSaveImage(buffer, 'uploads')` and saves the returned path `images/uploads/<uuid>.webp` to MongoDB, creating a doubly-prefixed and semantically incorrect folder structure.

1.6 WHEN the frontend `getImageUrl` helper in `shared/utils/imageHelper.js` receives a relative path that does not start with `/uploads/` or `/images/` THEN the system prepends `/images` to create `/images/<path>`, which may produce a double-prefix (`/images/images/...`) if the DB value already contains `images/` without a leading slash.

1.7 WHEN the `normalizeImageUrl` function defined inline in individual page components (e.g. `Restaurants.jsx`, `BakeryList.jsx`, `Categories.jsx`) derives the backend origin from `API_BASE_URL` THEN the system contains duplicated, inconsistent URL-resolution logic across components that independently handle the `uploads/` vs `images/` distinction, making behaviour diverge when one component is updated but others are not.

### Expected Behavior (Correct)

2.1a WHEN any image upload completes through any backend upload path THEN the system SHALL save the image path to MongoDB in the format `images/<folder>/<YYYY>/<MM>/<uuid>.webp` where `<folder>` may be a multi-level path (e.g. `food/restaurants/profile`, `quick-commerce/categories`) — the stored value SHALL contain no scheme, no host, and no leading slash.

2.1b IF the value that would be saved to MongoDB already contains `http://`, `https://`, or starts with `/` THEN the system SHALL strip the scheme+host (and leading slash) before persisting, so no absolute URL is ever written to any image field.

2.1c IF the value that would be saved to MongoDB starts with `uploads/` THEN the system SHALL replace that prefix with `images/` before persisting, so no `uploads/` path is ever written to any image field.

2.2 WHEN MongoDB contains a legacy `uploads/...` path and it is read by the API THEN the system SHALL normalise it to `images/...` before returning it to the client (via `toRelativeUrl` or `transformImageFields`), so the client never receives a stale `uploads/` path.

2.3 WHEN the `processAndSaveImage` function in `storage.service.js` saves a file to disk THEN the system SHALL write the file into the directory resolved from `config.vpsStoragePath` and return only `images/<folder>/<YYYY>/<MM>/<uuid>.webp` as the stored path, regardless of whether the runtime environment is localhost or production.

2.4 WHEN the Express app configures static middleware THEN the system SHALL serve static files exclusively under the `/images` route prefix, and the `/uploads` fallback route SHALL be retained only as a redirect or kept solely for backward-compatibility reads during a transition window — it SHALL NOT be a primary write target.

2.5 WHEN the generic upload endpoint (`POST /v1/uploads/image`) receives a request with a `folder` parameter equal to `'uploads'` or an empty value THEN the system SHALL substitute a safe default folder name (e.g. `'misc'`) so the resulting path never becomes `images/uploads/...`.

2.6 WHEN the frontend `getImageUrl` helper resolves a relative path received from the API THEN the system SHALL prepend the backend origin and `/images/` only when the path does not already start with `images/`, `/images/`, or `/uploads/`, preventing double-prefixing.

2.7a WHEN any frontend component file renders an image whose `src` or `url` value originates from an API response THEN that component SHALL import and call `getImageUrl` from `shared/utils/imageHelper.js` (or `resolveQuickImageUrl` from `src/modules/quick-commerce/utils/imageResolver.js` for quick-commerce pages) rather than defining its own inline URL-normalization function for the same purpose.

2.7b WHEN a frontend component file that previously defined its own `normalizeImageUrl` or equivalent inline function is updated THEN that inline function SHALL be removed and all call-sites in that file SHALL be replaced with the shared helper import.

2.8a WHEN the `migrate-urls-to-relative.js` script runs against the live MongoDB database THEN the system SHALL convert all values matching: `http://localhost:<port>/uploads/...`, `https://superfastfood.in/uploads/...`, `/uploads/...`, `/images/...`, bare `uploads/...`, or any external-domain URL containing `/uploads/` or `/images/` immediately after the host, to the corresponding relative `images/<remainder>` path in every non-system collection.

2.8b WHEN the migration script completes successfully THEN it SHALL exit with code 0 AND the script output SHALL include a line confirming total documents updated equals the number of documents that had matching values before the run.

2.8c WHEN the migration script is run a second time on already-migrated data THEN it SHALL find zero documents requiring updates, print a zero-update summary, and exit with code 0 (idempotent).

2.8d WHEN the migration script encounters a MongoDB connection error or write error THEN it SHALL exit with code 1 and print an error message to stderr, without having modified any data after the point of failure.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an image path stored in MongoDB is already in the correct `images/<subfolder>/<YYYY>/<MM>/<uuid>.webp` format THEN the system SHALL CONTINUE TO return it as-is through the response transformer without modification, duplication, or double-prefix.

3.2 WHEN an image URL originates from Cloudinary (i.e. contains `res.cloudinary.com`) THEN the system SHALL CONTINUE TO pass it through unchanged in both `toRelativeUrl` and `getImageUrl`, so existing Cloudinary-hosted images are not broken.

3.3 WHEN an image path is a `data:` base64 string or a `blob:` object URL THEN the system SHALL CONTINUE TO pass it through unchanged in all helper functions.

3.4 WHEN `processAndSaveImage` is called for a folder other than the legacy `'uploads'` default (e.g. `'food/restaurants/profile'`, `'quick-commerce/categories'`) THEN the system SHALL CONTINUE TO produce paths of the form `images/<folder>/<YYYY>/<MM>/<uuid>.webp` for those folders without any change to folder organisation.

3.5 WHEN the `deleteImage` function in `storage.service.js` resolves a file path for deletion THEN the system SHALL CONTINUE TO strip the `images/` or `uploads/` prefix and locate the file under `config.vpsStoragePath` on disk, regardless of which prefix was stored.

3.6 WHEN the `sanitizeBodyToRelative` middleware processes an incoming `POST`/`PUT`/`PATCH` request body THEN the system SHALL CONTINUE TO strip base URLs from known image fields before the data reaches any controller or service, as a defence-in-depth measure even after the primary fix is applied.

3.7 WHEN a fully qualified external image URL (e.g. a CDN link for quick-commerce seed product images) is stored in MongoDB THEN the system SHALL CONTINUE TO render it directly in the frontend without prepending the backend origin.

3.8 WHEN the migration script converts legacy paths, it encounters documents in any MongoDB collection THEN the system SHALL CONTINUE TO leave all non-image, non-URL fields in every document completely unchanged.
