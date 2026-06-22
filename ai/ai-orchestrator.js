import { ACTION_TYPES, createAction } from './action-protocol.js';
import { serializeWorldContext } from './world-context-serializer.js';

export const createAiOrchestrator = ({
    worldState,
    selectionStore,
    sceneObjectRegistry,
    ruleEngine,
    editPlanner = null
}) => ({
    getWorldContext() {
        return serializeWorldContext({ worldState, selectionStore, sceneObjectRegistry });
    },
    // 编辑已选中对象：把自然语言交给 LLM 规划成变换动作集合。
    // 返回 { actions, reply }；executor 负责把 actions 落地。
    async planEdit({ prompt }) {
        if (!editPlanner) {
            throw new Error('编辑规划器未配置');
        }
        const context = serializeWorldContext({ worldState, selectionStore, sceneObjectRegistry });
        if (!context.selection?.selectedWorldObjectId && !context.selectedWorldObject) {
            throw new Error('请先选中一个对象再编辑');
        }
        return editPlanner.plan({ prompt, context });
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
