import { ACTION_TYPES, createAction } from './action-protocol.js';
import { serializeWorldContext } from './world-context-serializer.js';

export const createAiOrchestrator = ({
    worldState,
    selectionStore,
    sceneObjectRegistry,
    ruleEngine
}) => ({
    getWorldContext() {
        return serializeWorldContext({ worldState, selectionStore, sceneObjectRegistry });
    },
    resolveUserIntent({ prompt, asset, actionContext }) {
        const resolved = ruleEngine.resolveAction({ prompt, asset });
        const actionType = actionContext.mode === 'replace'
            ? ACTION_TYPES.REPLACE_WORLD_OBJECT
            : ACTION_TYPES.CREATE_WORLD_OBJECT;
        return [
            createAction({
                type: actionType,
                payload: {
                    resolvedAction: resolved,
                    assetId: asset.id,
                    selectedObjectId: actionContext.selectedObjectId || null
                }
            })
        ];
    }
});
