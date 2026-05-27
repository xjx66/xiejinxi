# Product Picking Angle Debug [OPEN]

## Session

- sessionId: `product-picking-angle`
- symptom: Product objects require very close camera distance and front-facing clicks to be selected.
- expected: Product objects should be selectable from practical scene distances and angles through real 3D mesh/collider hits, without screen fallback.
- started: 2026-05-17

## Hypotheses

1. H1 collider-thin-depth: Product pick-volume/collider is too thin or aligned only to the front face, so side/oblique rays miss it.
2. H2 precise-root-missing: Product precise picking roots only include visible mesh children that are hard to hit from non-front angles.
3. H3 broad-phase-cull: Product worldBox/worldSphere/spatial grid broad phase excludes product candidates at distance or oblique camera rays.
4. H4 distance-filter: Product hit results are discarded by max distance, LOD, or stale bounds after camera movement.
5. H5 ui-or-layer-blocking: Pointer event routing or scene layer state causes product clicks to be interpreted as empty unless close/front.

## Evidence Log

- Added pre-fix instrumentation:
  - `infrastructure/picking-system.js`
    - `product-evaluate`: logs product collider/precise distances, collider presence, collider size, bounds, and LOD.
    - `product-query-candidates`: logs product candidate count and candidate metadata for each pointer query.
  - `talkinghead.js`
    - `product-registration`: logs whether a product has `pickVolume` when it is registered.
- Static check passed for instrumented files:
  - `node --check infrastructure/picking-system.js`
  - `node --check talkinghead.js`
- Pre-fix evidence collected:
  - 6 product registrations captured.
  - Model products registered before their async GLB hitBox existed: `hasPickVolumeAtRegister: false` for `world-product-1__instance_0` and `world-product-2__instance_1`.
  - Product candidates were present for pointer queries, so broad phase was not the primary failure.
  - Product evaluations: 846 total, only 2 collider hits, 0 precise hits.
  - All evaluated products were `lod: near`, so distance LOD was not the primary failure.

## Evidence Analysis

- H1 collider-thin-depth: confirmed. Product candidates exist, but ray intersections with current colliders are extremely sparse.
- H2 precise-root-missing: partially confirmed. Product precise hits were 0 in sampled evidence; product selection currently depends almost entirely on collider.
- H3 broad-phase-cull: rejected for the sampled case. Product candidates were present in queries.
- H4 distance-filter: rejected for the sampled case. Product LOD was `near` with camera distance around 190-210.
- H5 ui-or-layer-blocking: not supported by sampled evidence; query path ran and produced candidates/hits.

## Fix Plan

- Keep real 3D picking only.
- Enlarge product pick-volume in world units, with width constrained below product spacing to avoid neighboring-product overlap.
- Create model product pick-volume before async GLB loading so registration always has a collider.
- Update uploaded model/video renderers with the same pick-volume sizing policy.

## Fix Applied

- `talkinghead.js`
  - Added `createProductPickVolume()` / `resizeProductPickVolume()` for system products.
  - Product pick-volume now uses a larger real 3D box: width `max(targetSize * 1.7, targetSize + 12)`, height `max(height * 1.6, targetSize + 10)`, depth `max(targetSize * 2.4, targetSize + 24)`.
  - Model product pick-volume is created before async GLB loading, so registration always has a collider.
  - Product lane is split left/right and shifted upward/forward to reduce foreground avatar occlusion while preserving nearest-real-hit semantics.
- `renderers/model-renderer.js`
  - Uploaded model products use the same enlarged pick-volume.
- `renderers/video-renderer.js`
  - Uploaded video products use the same enlarged/resizable pick-volume.

## Post-fix Evidence

- Static checks passed:
  - `node --check talkinghead.js`
  - `node --check renderers/model-renderer.js`
  - `node --check renderers/video-renderer.js`
  - `node --check infrastructure/picking-system.js`
- Registration improved:
  - Model product registrations changed from `hasPickVolumeAtRegister: false` to `true`.
- Hit coverage improved:
  - Coarse grid product hits increased from 2 to 10 in sampled runs.
  - Center-offset tests show products in unobstructed lanes now return product hits across sampled offsets.
- Remaining constraint:
  - If a foreground avatar physically occludes a product ray, the picker still selects the avatar first by design. This preserves 3D editor semantics and avoids click-through.

## Follow-up Evidence

- Current live page is now an empty system scene:
  - `sceneObjectRegistry`: 0 initial objects.
  - `worldState`: 0 initial assets and 0 initial world objects.
  - AI upload panel, coordinate HUD, and collision debug UI remain available.
- Uploaded-product smoke sample using `/assets/products/virtual/studio.glb`:
  - Product root: `debug-product-world-studio`.
  - Previous uploaded model pick-volume: `28 x 26 x 40`.
  - Near/front, left-oblique, right-oblique, and rear-oblique center/20px offset samples hit the product.
  - Far/front sample at about `480` world units only hit at exact center; `left-20`, `right-20`, `up-20`, and `down-20` missed.

## Follow-up Fix

- Increased product pick-volume dimensions for both built-in and uploaded product renderers:
  - Width: `max(targetSize * 2.8, targetSize + 30)`.
  - Height: `max(height * 2.4, targetSize + 24)`.
  - Depth: `max(targetSize * 3.2, targetSize + 36)`.
- This remains a real 3D collider hit strategy and does not reintroduce screen fallback.

## Follow-up Verification

- Static checks passed:
  - `node --check talkinghead.js`
  - `node --check renderers/model-renderer.js`
  - `node --check renderers/video-renderer.js`
  - `node --check infrastructure/picking-system.js`
- Diagnostics returned no errors.
- Reloaded page and recreated the uploaded GLB product:
  - New uploaded model pick-volume: `46 x 40 x 52`.
- Post-fix smoke results:
  - `front-near`: 7 / 7 sampled offsets hit.
  - `front-far`: 5 / 7 sampled offsets hit; `center`, `left-20`, `right-20`, `up-20`, and `down-20` hit. Wider `35px` side offsets still miss at this distance, which avoids excessive click-through.
  - `left-oblique`: 7 / 7 sampled offsets hit.
  - `right-oblique`: 7 / 7 sampled offsets hit.
  - `rear-oblique`: 7 / 7 sampled offsets hit.

## Status

- [OPEN] Do not clean up debug artifacts until user confirms the final result.
