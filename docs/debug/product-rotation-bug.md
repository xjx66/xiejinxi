# Debugging Session: product-rotation-bug

## 1. Issue Description
- **Symptoms**: When the user clicks to rotate the newly added background products (`showcaseGroup`), the foreground avatar/character rotates instead.
- **Expected Behavior**: Clicking and dragging on a background product should rotate the product on its Y/X axis. Clicking and dragging on the foreground character should rotate the character.
- **Environment**: Browser (WebGL via Three.js), local development server.

## 2. Falsifiable Hypotheses
- **H1 (Z-Index/DOM Overlay Block)**: The foreground avatars are rendered in a separate DOM layer (`carousel-item` or `turntable`) that completely covers the screen. The `pointerdown` event is being caught by the avatar's canvas or container, and the `raycaster` logic for the products (which is attached to `window` with `capture: true`) is correctly firing, but the coordinates or the subsequent `pointermove` is being hijacked or misinterpreted. Wait, the user says "旋转的是前面的角色". This means the event *is* reaching the character's rotation logic.
- **H2 (Event Propagation Failure)**: The product interaction code uses `e.stopPropagation()` when a product is clicked. If this is failing, or if the character's rotation logic is also attached to `window` with `capture: true` and runs *before* the product logic, both might trigger, or the character might take precedence.
- **H3 (Raycaster Misalignment)**: The raycaster might be failing to hit the `showcaseGroup` objects due to coordinate mismatch (e.g., full screen vs container coordinates), causing `intersects.length === 0`. Because the product isn't "hit", `e.stopPropagation()` isn't called, and the event falls through to the character's canvas, which then handles the rotation.
- **H4 (Character Rotation Logic Scope)**: The character's rotation logic (likely inside the `TalkingHead` library or a separate script) might be binding to the global `document` or `window` for `pointermove` without checking what was initially clicked, thus responding to *any* drag on the screen.

## 3. Investigation Plan
1. **Instrument `talkinghead.js`**:
   - Inject network logging inside the `pointerdown` event for the product interaction to see if `intersects.length > 0` is ever true.
   - Log the `e.target` and coordinates to see what element is actually being clicked.
2. **Collect Evidence**:
   - Run the application, click on a product, and see if the debug server receives a "hit" or "miss".
3. **Analyze & Fix**:
   - If it's a miss, fix the Raycaster coordinates or collision meshes.
   - If it's a hit but the character still rotates, we need to find how to properly block the character's rotation logic (which might be deeply embedded in the `TalkingHead` class).

## 4. Current Status
- [OPEN] Session initialized. Preparing to start Debug Server and instrument code.
- [EVIDENCE] Log analysis shows:
  ```json
  {"event":"pointerdown_start","data":{"clientX":723.3,"clientY":528.2,"targetTag":"CANVAS","targetId":"","targetClassName":""}}
  {"event":"pointerdown_ignored","data":{"reason":"character_canvas"}}
  ```
- [ANALYSIS] Hypothesis H1 is confirmed! The user is clicking on the background product, but because the foreground character is rendered on a `<canvas>` that overlays the screen, `e.target` is the character's canvas. Our safety check `if (e.target.tagName.toLowerCase() === 'canvas' && e.target.id !== 'global-hdri-bg') return;` is intercepting the event and saying "Ah, you clicked the character, I won't process this for the product." But actually, the character canvas has a transparent background, so the user visually clicked "through" it onto the product.
- [PLAN] We cannot rely on `e.target` to distinguish between clicking the character and clicking the product because the character canvas spans the whole screen. Instead, we should always perform the Raycast into `bgScene`. 
  - However, if the user clicked the character, we shouldn't rotate the product. Wait, the `TalkingHead` library rotates the character when you drag on its canvas. If we don't intercept, both might rotate?
  - Actually, `TalkingHead` likely handles rotation internally. If we want to rotate the product *only* when the product is hit by the raycaster, we should do the raycast first. If the raycast hits the product, we rotate the product and `e.stopPropagation()` (which hopefully stops `TalkingHead` from rotating the character). Let's test this by moving the raycast before the safety return.
- [FIXED] Removed the `character_canvas` early return. The event listener now performs the Raycast first. If a product is hit, it calls `e.stopPropagation()` and `e.stopImmediatePropagation()` to prevent the character's rotation logic from running.
- [VERIFICATION] Waiting for user to verify the fix.
- [EVIDENCE 2] Post-fix log analysis shows:
  ```json
  {"event":"pointerdown_start","data":{"clientX":704.2,"clientY":517.7,"targetTag":"DIV","targetClassName":"carousel-item active"}}
  {"event":"pointerdown_raycast","data":{"intersectsCount":5,"showcaseChildren":134}}
  {"event":"pointerdown_hit","data":{"success":true}}
  ```
  Wait! The logs also show many ignored clicks when clicking on `CANVAS`. Wait, where is `pointerdown_ignored` coming from? I removed the canvas check! Ah, I left the `if (e.target.closest('button') || e.target.closest('input')) return;` but the logs say `{"reason":"character_canvas"}`. I didn't successfully remove it? Let me check `talkinghead.js`. Ah, the user said "有些位置可以转，有些位置没法转". This means my fix partially worked. But wait, `TalkingHead` binds to the container element, not window. And it might be intercepting the event before it reaches `window` in the bubbling phase. But we use `capture: true`, so we should get it first.
- [ANALYSIS 2] If `e.stopPropagation()` stops the event from reaching `TalkingHead` (which is good when we hit the product), why is it "sometimes not rotatable"? 
  Wait, I see logs like:
  ```json
  {"event":"pointerdown_start","data":{"clientX":738.6,"clientY":513.4,"targetTag":"CANVAS"}}
  {"event":"pointerdown_ignored","data":{"reason":"character_canvas"}}
  ```
  This means the `character_canvas` check is STILL THERE! My previous `SearchReplace` didn't remove it or I restored it by mistake? No, looking at my previous `SearchReplace`, I replaced the `pointerdown` block. Wait, I replaced it, but the old code I matched had the `#region debug-point 1` in it, and the new code didn't have the `character_canvas` check. Wait, did the `SearchReplace` fail? Yes, it might have failed, or I only replaced part of it. Let me check the actual file content.