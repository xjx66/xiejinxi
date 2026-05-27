const sanitizeText = (text) => (text || '').trim();

const deriveDisplayName = ({ prompt, asset }) => {
    const cleanPrompt = sanitizeText(prompt);
    if (cleanPrompt) {
        return cleanPrompt.length > 24 ? `${cleanPrompt.slice(0, 24)}...` : cleanPrompt;
    }
    return asset?.name || '未命名对象';
};

const wantsImageFrame = (text) => {
    return text.includes('相框') || text.includes('画框') || text.includes('frame') || text.includes('framed');
};

const deriveTemplateId = ({ asset, cleanPrompt }) => {
    if (!asset) return null;
    if (asset.kind === 'image') return wantsImageFrame(cleanPrompt) ? 'template-painting-image' : 'template-image-plane';
    if (asset.kind === 'video') return 'template-product-video';
    if (asset.kind === 'glb') return 'template-product-model';
    return null;
};

const deriveWorldObjectType = (asset) => {
    if (!asset) return null;
    if (asset.kind === 'image') return 'image';
    if (asset.kind === 'video') return 'video';
    if (asset.kind === 'glb') return 'model';
    return null;
};

const deriveCollection = ({ asset, cleanPrompt }) => {
    if (!asset) return null;
    if (asset.kind === 'image') return wantsImageFrame(cleanPrompt) ? 'painting' : 'image';
    if (asset.kind === 'video' || asset.kind === 'glb') return 'product';
    return null;
};

const derivePresentation = ({ prompt, asset }) => {
    const cleanPrompt = sanitizeText(prompt).toLowerCase();
    const imageFrameStyle = wantsImageFrame(cleanPrompt) ? 'frame' : 'plain';
    const base = {
        frameStyle: asset?.kind === 'image' ? imageFrameStyle : asset?.kind === 'video' ? 'screen' : 'object',
        floatMode: cleanPrompt.includes('悬浮') || cleanPrompt.includes('floating')
    };
    if (cleanPrompt.includes('玻璃')) {
        base.materialHint = 'glass';
    } else if (cleanPrompt.includes('雕塑') || cleanPrompt.includes('sculpture')) {
        base.materialHint = 'sculpture';
    } else if (cleanPrompt.includes('屏') || cleanPrompt.includes('screen')) {
        base.materialHint = 'screen';
    } else {
        base.materialHint = 'default';
    }
    return base;
};

export const createAiRuleEngine = () => ({
    resolveAction({ prompt, asset }) {
        if (!asset) {
            throw new Error('请先上传一个资产');
        }
        const cleanPrompt = sanitizeText(prompt).toLowerCase();
        const templateId = deriveTemplateId({ asset, cleanPrompt });
        const type = deriveWorldObjectType(asset);
        const collection = deriveCollection({ asset, cleanPrompt });
        if (!templateId || !type || !collection) {
            throw new Error('当前资产类型无法被规则引擎解析');
        }
        return {
            type,
            templateId,
            metadata: {
                collection,
                name: deriveDisplayName({ prompt, asset }),
                desc: sanitizeText(prompt),
                presentation: derivePresentation({ prompt, asset })
            }
        };
    }
});
