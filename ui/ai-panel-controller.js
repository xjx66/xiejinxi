import { createVideoControlsController } from './video-controls-controller.js';

export const createAiPanelController = ({
    document,
    window,
    worldState,
    aiActionContext,
    selectionStore,
    sceneObjectRegistry,
    aiOrchestrator,
    createAssetFromUpload,
    uploadRuntime,
    createWorldObjectFromAsset,
    replaceWorldObjectAsset,
    createManagedWorldObject,
    replaceManagedSceneObject,
    deleteWorldObject,
    clearSelection,
    focusWorldObject,
    updateSelectedAvatarEntry,
    debugLogger
}) => {
    const nodePanel = document.getElementById('avatar-dialogue-panel');
    const nodeTitle = document.getElementById('avatar-dialogue-title');
    const nodeHint = document.getElementById('avatar-dialogue-hint');
    const nodeLoading = document.getElementById('avatar-dialogue-loading');
    const nodeMode = document.getElementById('ai-action-mode');
    const nodeCoordinate = document.getElementById('ai-context-coordinate');
    const nodeTarget = document.getElementById('ai-context-target');
    const nodeAssetSummary = document.getElementById('ai-asset-summary');
    const nodeAssetFields = document.getElementById('ai-asset-fields');
    const nodeVideoControls = document.getElementById('ai-video-controls');
    const nodeVideoToggle = document.getElementById('ai-video-toggle');
    const nodeVideoProgress = document.getElementById('ai-video-progress');
    const nodeVideoTime = document.getElementById('ai-video-time');
    const nodeAnimationControls = document.getElementById('ai-animation-controls');
    const nodeAnimationClip = document.getElementById('ai-animation-clip');
    const nodeAnimationPlay = document.getElementById('ai-animation-play');
    const nodePrompt = document.getElementById('ai-prompt-text');
    const nodeUpload = document.getElementById('ai-upload-input');
    const nodeUploadPreview = document.getElementById('ai-upload-preview');
    const nodeSubmit = document.getElementById('ai-submit');
    const nodeDelete = document.getElementById('ai-delete');
    const nodeReset = document.getElementById('ai-reset');
    const disposers = [];

    const formatWorldPoint = (point) => {
        if (!point) return '未锁定';
        return `X ${point.x.toFixed(2)}  Y ${point.y.toFixed(2)}  Z ${point.z.toFixed(2)}`;
    };

    const getSelectedSceneRoot = (state) => {
        const selectedObjectId = state.selectedObjectId || selectionStore.getState().selectedWorldObjectId;
        if (!selectedObjectId) return null;
        const sceneRecord = sceneObjectRegistry.getByWorldObjectId(selectedObjectId);
        return sceneRecord?.root || window.activeBackgroundSelectable || null;
    };

    const getSelectedVideo = (state = aiActionContext.getState()) => {
        const root = getSelectedSceneRoot(state);
        return root?.userData?.isVideo ? root.userData.video || null : null;
    };

    const getSelectedAssetInfo = (state) => {
        const selectedObjectId = state.selectedObjectId || selectionStore.getState().selectedWorldObjectId;
        if (!selectedObjectId) return null;
        const root = getSelectedSceneRoot(state);
        const worldObject = worldState.getWorldObjectById?.(selectedObjectId);
        const asset = worldObject?.assetId ? worldState.getAssetById(worldObject.assetId) : null;
        const objectInfo = root?.userData?.assetInfo || {};
        const assetMetadata = asset?.metadata || {};
        const objectMetadata = worldObject?.metadata || {};
        return {
            name: objectInfo.name || objectMetadata.name || asset?.name || state.selectedObjectName || '',
            type: objectInfo.type || state.selectedObjectType || worldObject?.type || '',
            kind: objectInfo.kind || asset?.kind || '',
            source: objectInfo.source || asset?.source || '',
            collection: objectInfo.collection || objectMetadata.collection || assetMetadata.collection || '',
            time: objectInfo.time || objectMetadata.time || assetMetadata.time || '',
            status: objectInfo.status || worldObject?.status || assetMetadata.status || '',
            desc: objectInfo.desc || objectMetadata.desc || assetMetadata.desc || '',
            id: objectInfo.id || asset?.id || selectedObjectId || '',
            url: objectInfo.url || asset?.url || ''
        };
    };

    const getSelectedAnimationRecord = (state = aiActionContext.getState()) => {
        const selectedObjectId = state.selectedObjectId || selectionStore.getState().selectedWorldObjectId;
        if (!selectedObjectId) return null;
        const record = sceneObjectRegistry.getByWorldObjectId(selectedObjectId);
        if (!record || !Array.isArray(record.clipNames) || record.clipNames.length === 0) return null;
        return { record, worldObjectId: selectedObjectId };
    };

    const renderAnimationControls = (state) => {
        if (!nodeAnimationControls || !nodeAnimationClip) return;
        const ctx = getSelectedAnimationRecord(state);
        if (!ctx) {
            nodeAnimationControls.style.display = 'none';
            return;
        }
        const { record, worldObjectId } = ctx;
        const wo = worldState.getWorldObjectById?.(worldObjectId);
        const lastAnimation = wo?.metadata?.lastAnimation || '';
        const currentValue = nodeAnimationClip.value;
        // 重新填充选项（仅当 clip 列表与当前不一致时）
        const desired = record.clipNames.join('|');
        if (nodeAnimationClip.dataset.clipsKey !== desired + '@' + worldObjectId) {
            nodeAnimationClip.replaceChildren(...record.clipNames.map((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                return opt;
            }));
            nodeAnimationClip.dataset.clipsKey = desired + '@' + worldObjectId;
            // 默认选中：上次播过的；否则保留上次输入；否则第一项
            const initial = (lastAnimation && record.clipNames.includes(lastAnimation))
                ? lastAnimation
                : (record.clipNames.includes(currentValue) ? currentValue : record.clipNames[0]);
            nodeAnimationClip.value = initial;
        }
        nodeAnimationControls.style.display = 'flex';
    };

    const playSelectedAnimation = () => {
        const ctx = getSelectedAnimationRecord();
        if (!ctx) return;
        const { record, worldObjectId } = ctx;
        const name = nodeAnimationClip?.value;
        if (!name) return;
        const ok = record.playClip?.(name);
        if (!ok) {
            if (nodeLoading) nodeLoading.textContent = `动作不存在：${name}`;
            return;
        }
        // 持久化最后播放的动作（刷新后恢复）
        const wo = worldState.getWorldObjectById?.(worldObjectId);
        if (wo && worldState.upsertWorldObject) {
            worldState.upsertWorldObject({
                ...wo,
                metadata: { ...(wo.metadata || {}), lastAnimation: name }
            });
        }
        if (nodeLoading) nodeLoading.textContent = `已播放动作：${name}`;
    };

    const renderAssetInfo = (state) => {
        if (!nodeAssetSummary || !nodeAssetFields) return;
        const assetInfo = getSelectedAssetInfo(state);
        if (!assetInfo) {
            nodeAssetSummary.style.display = 'none';
            nodeAssetFields.textContent = '未选中对象';
            return;
        }
        const rows = [
            ['名称', assetInfo.name],
            ['类型', assetInfo.type],
            ['资产类型', assetInfo.kind],
            ['来源', assetInfo.source],
            ['集合', assetInfo.collection],
            ['时间', assetInfo.time],
            ['状态', assetInfo.status],
            ['描述', assetInfo.desc],
            ['资产ID', assetInfo.id]
        ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
        nodeAssetFields.replaceChildren(...rows.map(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'ai-asset-row';
            const labelNode = document.createElement('span');
            labelNode.textContent = label;
            const valueNode = document.createElement('span');
            valueNode.textContent = String(value);
            row.append(labelNode, valueNode);
            return row;
        }));
        nodeAssetSummary.style.display = rows.length > 0 ? 'flex' : 'none';
    };

    const videoControlsController = createVideoControlsController({
        document,
        window,
        nodes: {
            controls: nodeVideoControls,
            toggle: nodeVideoToggle,
            progress: nodeVideoProgress,
            time: nodeVideoTime
        },
        getSelectedVideo,
        getState: () => aiActionContext.getState()
    });

    const setBusy = (busy, message = '') => {
        if (!nodePrompt || !nodeSubmit || !nodeReset || !nodeUpload || !nodeDelete) return;
        nodePrompt.disabled = busy;
        nodeSubmit.disabled = busy;
        nodeDelete.disabled = busy;
        nodeReset.disabled = busy;
        nodeUpload.disabled = busy;
        nodePrompt.style.opacity = busy ? '0.5' : '1';
        nodePrompt.style.cursor = busy ? 'not-allowed' : 'text';
        if (nodeLoading) {
            nodeLoading.textContent = message || (busy ? '处理中...' : 'Waiting for input...');
        }
    };

    const buildWorldObjectPayload = (actionContext, asset, resolvedAction) => {
        return createWorldObjectFromAsset({
            actionContext,
            asset,
            resolvedAction,
            worldState,
            sceneObjectRegistry
        });
    };

    const render = () => {
        if (!nodePanel || !nodeTitle || !nodeHint || !nodePrompt || !nodeMode || !nodeCoordinate || !nodeTarget || !nodeUploadPreview) return;
        const state = aiActionContext.getState();
        nodePanel.style.display = 'flex';
        nodeTitle.textContent = 'AI 操作面板';
        nodeHint.textContent = state.mode === 'replace'
            ? '当前将替换所选对象，允许跨类型替换。'
            : '点击空白处锁定坐标后，可在该坐标创建一个新对象。';
        nodeMode.textContent = `模式：${state.mode === 'replace' ? '替换对象' : state.mode === 'create' ? '创建对象' : '未选择'}`;
        nodeCoordinate.textContent = formatWorldPoint(state.worldPoint);
        const selectedAssetInfo = getSelectedAssetInfo(state);
        const selectedName = state.selectedObjectName || selectedAssetInfo?.name || '';
        const selectedType = state.selectedObjectType || selectedAssetInfo?.type || '';
        nodeTarget.textContent = selectedName
            ? `${selectedName} (${selectedType || 'object'})`
            : '空白点位';
        renderAssetInfo(state);
        videoControlsController.render();
        renderAnimationControls(state);
        if (nodePrompt.value !== state.prompt) {
            nodePrompt.value = state.prompt || '';
        }
        nodeSubmit.textContent = state.mode === 'replace' ? '确认替换' : '确认创建';
        const canDelete = state.mode === 'replace' && state.selectedObjectId && state.selectedObjectType !== 'avatar';
        nodeDelete.disabled = !canDelete;
        const asset = state.uploadedAssetId ? worldState.getAssetById(state.uploadedAssetId) : null;
        nodeUploadPreview.textContent = asset
            ? `已选择：${asset.name}\n类型：${asset.kind}\n来源：${asset.source}`
            : '未选择文件';
        if (nodeLoading && !nodeLoading.dataset.locked) {
            if (!window.renderSceneLoadingNotice?.('Waiting for input...')) {
                nodeLoading.textContent = 'Waiting for input...';
            }
        }
    };

    const executeCurrentAction = async () => {
        const actionContext = aiActionContext.getState();
        if (!actionContext.worldPoint) {
            if (nodeLoading) nodeLoading.textContent = '请先点击一个坐标或对象';
            return;
        }
        if (!actionContext.uploadedAssetId) {
            if (nodeLoading) nodeLoading.textContent = '请先上传一个资产';
            return;
        }
        if (actionContext.mode === 'replace' && actionContext.selectedObjectType === 'avatar') {
            if (nodeLoading) nodeLoading.textContent = '当前版本暂不支持直接替换角色模板';
            return;
        }
        const asset = worldState.getAssetById(actionContext.uploadedAssetId);
        if (!asset) {
            if (nodeLoading) nodeLoading.textContent = '上传资产不存在，请重新选择文件';
            return;
        }
        window.isAwaitingResponse = true;
        setBusy(true, '规则模拟中...');
        try {
            const [intentAction] = aiOrchestrator.resolveUserIntent({
                prompt: actionContext.prompt,
                asset,
                actionContext
            });
            const resolvedAction = intentAction.payload.resolvedAction;
            const worldObject = buildWorldObjectPayload(actionContext, asset, resolvedAction);
            let nextRoot = null;
            if (actionContext.mode === 'replace' && actionContext.selectedObjectId) {
                nextRoot = replaceWorldObjectAsset({
                    worldState,
                    replaceManagedSceneObject,
                    targetObjectId: actionContext.selectedObjectId,
                    worldObject
                });
            } else {
                worldState.upsertWorldObject(worldObject);
                nextRoot = createManagedWorldObject(worldObject);
            }
            updateSelectedAvatarEntry(null);
            debugLogger.emit({
                sessionId: 'hit-selection-accuracy',
                runId: 'post-fix',
                hypothesisId: 'C',
                location: 'ui/ai-panel-controller.js:executeCurrentAction',
                msg: '[DEBUG] post create/replace selection state',
                data: {
                    mode: actionContext.mode,
                    worldObjectId: worldObject?.id || null,
                    nextRootName: nextRoot?.name || null,
                    nextRootWorldObjectId: nextRoot?.userData?.worldObjectId || null,
                    nextRootSelectableType: nextRoot?.userData?.selectableType || null
                },
                ts: Date.now()
            });
            aiActionContext.setTarget({
                mode: 'replace',
                worldPoint: worldObject.position,
                selectedObjectId: worldObject.id,
                selectedObjectType: worldObject.type,
                selectedObjectName: worldObject.metadata?.name || asset.name
            });
            aiActionContext.setPrompt('');
            aiActionContext.setUploadedAsset(null);
            if (nodePrompt) nodePrompt.value = '';
            if (nodeUpload) nodeUpload.value = '';
            focusWorldObject(worldObject);
            if (nodeLoading) nodeLoading.textContent = actionContext.mode === 'replace' ? '替换完成' : '创建完成';
        } catch (error) {
            console.error('AI action execution failed:', error);
            if (nodeLoading) nodeLoading.textContent = error.message || '执行失败';
        } finally {
            setBusy(false);
            window.isAwaitingResponse = false;
            render();
        }
    };

    const addListener = (node, type, listener) => {
        node?.addEventListener(type, listener);
        if (node) {
            disposers.push(() => node.removeEventListener(type, listener));
        }
    };

    addListener(nodePrompt, 'input', (event) => {
        aiActionContext.setPrompt(event.target.value);
    });
    addListener(nodeUpload, 'change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const asset = createAssetFromUpload({ uploadRuntime, worldState, file });
            aiActionContext.setUploadedAsset(asset);
            if (nodeLoading) nodeLoading.textContent = `已上传 ${asset.name}`;
        } catch (error) {
            if (nodeLoading) nodeLoading.textContent = error.message;
        }
    });
    addListener(nodeSubmit, 'click', () => {
        executeCurrentAction();
    });
    addListener(nodeDelete, 'click', () => {
        const actionContext = aiActionContext.getState();
        if (actionContext.mode !== 'replace' || !actionContext.selectedObjectId) {
            if (nodeLoading) nodeLoading.textContent = '请先选中一个对象';
            return;
        }
        if (actionContext.selectedObjectType === 'avatar') {
            if (nodeLoading) nodeLoading.textContent = '当前版本暂不支持直接删除角色模板';
            return;
        }
        const sceneRecord = sceneObjectRegistry.getByWorldObjectId(actionContext.selectedObjectId);
        const fallbackPoint = sceneRecord?.root
            ? {
                x: sceneRecord.root.position.x,
                y: sceneRecord.root.position.y,
                z: sceneRecord.root.position.z
            }
            : actionContext.worldPoint;
        deleteWorldObject(actionContext.selectedObjectId);
        aiActionContext.setTarget({
            mode: 'create',
            worldPoint: fallbackPoint,
            selectedObjectId: null,
            selectedObjectType: null,
            selectedObjectName: null
        });
        clearSelection('deleted');
        updateSelectedAvatarEntry(null);
        if (nodeLoading) nodeLoading.textContent = '对象已删除';
    });
    addListener(nodeReset, 'click', () => {
        aiActionContext.clear();
        if (nodeUpload) nodeUpload.value = '';
        if (nodeLoading) nodeLoading.textContent = '上下文已清空';
    });
    addListener(nodeAnimationPlay, 'click', () => {
        playSelectedAnimation();
    });
    disposers.push(aiActionContext.subscribe(render));
    disposers.push(selectionStore.subscribe(render));
    disposers.push(() => videoControlsController.dispose());
    window.handleSpeak = executeCurrentAction;
    window.updateAvatarDialogueUi = render;

    return {
        render,
        setBusy,
        dispose() {
            disposers.splice(0).forEach((dispose) => dispose());
            if (window.handleSpeak === executeCurrentAction) {
                delete window.handleSpeak;
            }
            if (window.updateAvatarDialogueUi === render) {
                delete window.updateAvatarDialogueUi;
            }
        }
    };
};
