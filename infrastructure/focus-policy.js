export const createFocusPolicy = ({ cameraController, debugLogger = { emit() {} } }) => ({
    focusSelection({ targetX, targetZ, activeType = null } = {}) {
        const before = cameraController.getState();
        const after = cameraController.setTarget({ x: targetX, z: targetZ });
        debugLogger.emit({
            sessionId: 'avatar-focus-hit-test',
            runId: 'refactor',
            hypothesisId: 'focus-policy',
            location: 'focus-policy:focusSelection',
            msg: '[DEBUG] focus policy changed camera target',
            data: {
                input: { targetX, targetZ, activeType },
                before,
                after
            }
        });
        return after;
    }
});
