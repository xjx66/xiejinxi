# Debugging Session: texture-corruption-bug

## 1. Issue Description
- **Symptoms**: During the carousel rotation ("轮播到后边"), the materials for the wall and floor change/corrupt. The floor becomes solid gray, and the wall changes to "another concrete material".
- **Expected Behavior**: The floor and wall should maintain their consistent rough concrete textures with randomized UV offsets, regardless of how far the carousel rotates.
- **Environment**: Browser (WebGL via Three.js), Vercel/Local.

## 2. Falsifiable Hypotheses
- **H1 (Texture Cloning Async Issue)**: The textures (`actualFloorTexture`, `wallPanelTexture`) are cloned from `sharedFloorTexture` *before* the underlying image is fully loaded via HTTP. While the original texture gets updated upon load, the clones might lose the reference or fail to upload to the GPU correctly in certain conditions.
- **H2 (Shader Uniform/Attribute Loss)**: As the camera moves and instances fall out of the initial frustum, Three.js might re-compile or re-bind shaders, and the custom `onBeforeCompile` attributes (`uvOffset`, `aWallVariant`) might not be properly retained or updated, causing the shader to fallback to default UVs or colors.
- **H3 (Frustum Culling / Bounding Box)**: The `InstancedMesh` for the floor or wall might have an incorrect bounding box. When the camera moves, parts of the mesh might be frustum culled unexpectedly, or LOD/rendering order changes causing rendering glitches.
- **H4 (Theme Switch Overwrite)**: The `updateBackgroundTheme` might be accidentally triggered during rotation (e.g., due to DOM attribute changes), overwriting `floorTileMat.color` or `emissive` values to solid gray and causing the texture to be obscured.

## 3. Investigation Plan
1. **Instrument `talkinghead.js`**:
   - Inject network logging to track the state of `actualFloorTexture.image` and `wallPanelTexture.image` over time (to check H1).
   - Log when `switchModel` and `updateBackgroundTheme` are called, along with the current camera position.
   - Log the exact `floorTileMat.color` and `wallPanelFaceMat.color` values during rotation.
2. **Collect Evidence**:
   - Run the application, simulate carousel rotation.
   - Analyze the log output to see if the material properties or texture references drop or change.
3. **Analyze & Fix**:
   - Depending on the log evidence, implement the fix (e.g., waiting for textures to load before cloning, or fixing frustum culling).

## 4. Current Status
- [CLOSED] Bug verified and fixed. Cleanup completed. All debugging artifacts have been removed.