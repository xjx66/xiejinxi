import { createVideoControlsController } from './video-controls-controller.js';

export const createAiPanelController = ({
    document,
    window,
    worldState,
    aiActionContext,
    selectionStore,
    sceneObjectRegistry,
    aiOrchestrator,
    actionExecutor,
    agentRuntime,
    motionPlayer,
    conversationStore,
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
    const nodeAgentReply = document.getElementById('ai-agent-reply');
    const nodeAgentReplyBody = document.getElementById('ai-agent-reply-body');
    const nodeConvNew = document.getElementById('ai-conv-new');
    const nodeConvCurrent = document.getElementById('ai-conv-current');
    const nodeConvHistory = document.getElementById('ai-conv-history');
    const nodeConvList = document.getElementById('ai-conv-list');
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
    const nodeAnimationList = document.getElementById('ai-animation-list');
    const nodeMotionControls = document.getElementById('ai-motion-controls');
    const nodeMotionToggle = document.getElementById('ai-motion-toggle');
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
        if (!nodeAnimationControls || !nodeAnimationList) return;
        const ctx = getSelectedAnimationRecord(state);
        if (!ctx) {
            nodeAnimationControls.style.display = 'none';
            return;
        }
        const { record, worldObjectId } = ctx;
        const wo = worldState.getWorldObjectById?.(worldObjectId);
        const lastAnimation = wo?.metadata?.lastAnimation || '';
        const desired = record.clipNames.join('|');
        const key = desired + '@' + worldObjectId;
        if (nodeAnimationList.dataset.clipsKey !== key) {
            nodeAnimationList.replaceChildren(...record.clipNames.map((name) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ai-animation-item';
                btn.textContent = name;
                btn.dataset.clipName = name;
                if (name === lastAnimation) btn.classList.add('is-active');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    playSelectedAnimation(name);
                });
                return btn;
            }));
            nodeAnimationList.dataset.clipsKey = key;
        } else {
            // 仅刷新 active 高亮
            nodeAnimationList.querySelectorAll('.ai-animation-item').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.clipName === lastAnimation);
            });
        }
        nodeAnimationControls.style.display = 'flex';
    };

    const playSelectedAnimation = (name) => {
        const ctx = getSelectedAnimationRecord();
        if (!ctx) return;
        const { record, worldObjectId } = ctx;
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
        // 刷新高亮
        if (nodeAnimationList) {
            nodeAnimationList.querySelectorAll('.ai-animation-item').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.clipName === name);
            });
        }
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

    const renderMotionControls = (state) => {
        if (!nodeMotionControls || !nodeMotionToggle || !motionPlayer) return;
        const id = state.selectedObjectId || selectionStore.getState().selectedWorldObjectId;
        if (!id || !motionPlayer.hasMotion(id)) {
            nodeMotionControls.style.display = 'none';
            return;
        }
        nodeMotionControls.style.display = 'flex';
        nodeMotionToggle.textContent = motionPlayer.isPlaying(id) ? '⏸ 暂停' : '▶ 播放';
    };

    const render = () => {
        if (!nodePanel || !nodeTitle || !nodeHint || !nodePrompt || !nodeMode || !nodeCoordinate || !nodeTarget || !nodeUploadPreview) return;
        const state = aiActionContext.getState();
        nodePanel.style.display = 'flex';
        nodeTitle.textContent = 'AI 操作面板';
        const isEditMode = state.mode === 'replace' && !state.uploadedAssetId;
        nodeHint.textContent = state.mode === 'replace'
            ? (isEditMode
                ? '输入指令编辑所选对象（如“放大1.2倍/向左移20/绕Y轴转90度/给这张图加个相框”），或上传资产以替换。Ctrl+Z 撤销。'
                : '已选择新资产，将替换所选对象，允许跨类型替换。')
            : '已锁定坐标：上传资产可直接创建，或输入指令让 AI 在此生成对象（如“在这里生成一张星空图”）。';
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
        renderMotionControls(state);
        if (nodePrompt.value !== state.prompt) {
            nodePrompt.value = state.prompt || '';
        }
        nodeSubmit.textContent = state.mode === 'replace'
            ? (state.uploadedAssetId ? '确认替换' : '应用编辑')
            : '确认创建';
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

    // —— AI 回复区 / 对话记录 ——
    const appendAgentLine = (text, kind = 'step') => {
        if (!nodeAgentReplyBody) return;
        const line = document.createElement('div');
        line.className = `ai-agent-line ai-agent-${kind}`;
        line.textContent = text;
        nodeAgentReplyBody.appendChild(line);
        nodeAgentReplyBody.scrollTop = nodeAgentReplyBody.scrollHeight;
        if (nodePanel) nodePanel.scrollTop = nodePanel.scrollHeight;
    };

    // 渲染当前会话的完整对话记录（切换/新建/初始化时调用）
    const renderConversation = () => {
        if (!nodeAgentReply || !nodeAgentReplyBody || !conversationStore) return;
        const conv = conversationStore.getCurrent();
        nodeAgentReplyBody.replaceChildren();
        const msgs = conv?.messages || [];
        if (msgs.length === 0) {
            nodeAgentReply.style.display = 'none';
            return;
        }
        nodeAgentReply.style.display = 'block';
        msgs.forEach((m) => {
            appendAgentLine(m.role === 'user' ? `🧑 ${m.content}` : m.content, m.role === 'user' ? 'goal' : 'reply');
        });
    };

    // 渲染会话栏（当前标题 + 历史列表）
    const renderConvBar = (storeState) => {
        if (!conversationStore) return;
        if (nodeConvCurrent) {
            const cur = storeState.conversations.find((c) => c.id === storeState.currentId);
            nodeConvCurrent.textContent = cur?.title || '新对话';
        }
        if (!nodeConvList) return;
        nodeConvList.replaceChildren(...storeState.conversations.map((c) => {
            const row = document.createElement('div');
            row.className = 'ai-conv-item' + (c.id === storeState.currentId ? ' is-active' : '');
            const label = document.createElement('span');
            label.className = 'ai-conv-item-title';
            label.textContent = c.title || '新对话';
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                conversationStore.switchTo(c.id);
                renderConversation();
                if (nodeConvList) nodeConvList.style.display = 'none';
            });
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'ai-conv-item-del';
            del.textContent = '×';
            del.title = '删除该对话';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                conversationStore.deleteConversation(c.id);
                renderConversation();
            });
            row.append(label, del);
            return row;
        }));
    };

    // Agent 路径：未上传新资产 + 有指令 + (选中了对象 或 锁定了坐标) → 交给 agent。
    // 选中对象 → 编辑该对象；只锁定坐标 → 在该坐标创建/生成对象。
    const runAgentTask = async () => {
        const actionContext = aiActionContext.getState();
        const selectedObjectId = actionContext.selectedObjectId || selectionStore.getState().selectedWorldObjectId;
        const prompt = (actionContext.prompt || '').trim();
        if (!prompt) {
            if (nodeLoading) nodeLoading.textContent = '请输入指令';
            return;
        }
        if (!selectedObjectId && !actionContext.worldPoint) {
            if (nodeLoading) nodeLoading.textContent = '请先选中一个对象或点击一个坐标';
            return;
        }
        if (selectedObjectId && actionContext.selectedObjectType === 'avatar') {
            if (nodeLoading) nodeLoading.textContent = '当前版本暂不支持编辑角色模板';
            return;
        }
        window.isAwaitingResponse = true;
        setBusy(true, 'Agent 思考中...');
        if (nodeAgentReply) nodeAgentReply.style.display = 'block';
        appendAgentLine(`🧑 ${prompt}`, 'goal'); // 接在本会话已有记录之后
        try {
            const worldContext = {
                ...aiOrchestrator.getWorldContext(),
                targetPoint: actionContext.worldPoint || null
            };
            const onStep = ({ phase, name, result }) => {
                if (phase === 'call') {
                    appendAgentLine(`🔧 ${name} …`, 'step');
                    if (nodeLoading) nodeLoading.textContent = `🔧 ${name} …`;
                } else if (phase === 'result' && result?.error) {
                    appendAgentLine(`⚠️ ${name}: ${result.error}`, 'error');
                }
            };
            // 带上本会话的历史，实现跨轮上下文记忆
            const history = conversationStore?.getHistory?.() || [];
            const { reply } = await agentRuntime.run({ goal: prompt, worldContext, history, onStep });
            aiActionContext.setPrompt('');
            if (nodePrompt) nodePrompt.value = '';
            appendAgentLine(reply || '完成', 'reply');
            appendAgentLine('（Ctrl+Z 撤销）', 'hint');
            if (nodeLoading) nodeLoading.textContent = '完成';
            // 记入会话历史（持久化 + 供下轮记忆）
            conversationStore?.addTurn?.(prompt, reply || '完成');
        } catch (error) {
            console.error('Agent run failed:', error);
            appendAgentLine(`❌ ${error.message || '执行失败'}`, 'error');
            if (nodeLoading) nodeLoading.textContent = error.message || '执行失败';
        } finally {
            setBusy(false);
            window.isAwaitingResponse = false;
            render();
        }
    };

    const executeCurrentAction = async () => {
        const actionContext = aiActionContext.getState();
        // 未上传新资产、但写了指令，且选中了对象或锁定了坐标 → 走 agent（编辑 或 在坐标处创建）。
        const selectedObjectId = actionContext.selectedObjectId || selectionStore.getState().selectedWorldObjectId;
        if (!actionContext.uploadedAssetId
            && (actionContext.prompt || '').trim()
            && (selectedObjectId || actionContext.worldPoint)) {
            return runAgentTask();
        }
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
    addListener(nodeMotionToggle, 'click', (e) => {
        e.stopPropagation();
        if (!motionPlayer) return;
        const id = aiActionContext.getState().selectedObjectId || selectionStore.getState().selectedWorldObjectId;
        if (!id || !motionPlayer.hasMotion(id)) {
            if (nodeLoading) nodeLoading.textContent = '该对象还没有运动轨迹（先让 AI 设定）';
            return;
        }
        motionPlayer.toggle(id);
        renderMotionControls(aiActionContext.getState());
    });
    // 防止按钮列表的 pointer 事件冒泡到 window 触发场景选中清除或 pointer-lock
    const stopBubble = (e) => { e.stopPropagation(); };
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach((type) => {
        addListener(nodeAnimationControls, type, stopBubble);
        addListener(nodeMotionControls, type, stopBubble);
    });
    // —— 会话栏：新建 / 历史 ——
    addListener(nodeConvNew, 'click', (e) => {
        e.stopPropagation();
        conversationStore?.newConversation();
        renderConversation();
        if (nodeConvList) nodeConvList.style.display = 'none';
    });
    addListener(nodeConvHistory, 'click', (e) => {
        e.stopPropagation();
        if (!nodeConvList) return;
        nodeConvList.style.display = nodeConvList.style.display === 'none' ? 'flex' : 'none';
    });
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach((type) => {
        addListener(nodeConvList, type, (e) => e.stopPropagation());
    });
    if (conversationStore) {
        disposers.push(conversationStore.subscribe(renderConvBar));
        renderConversation();
    }

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
