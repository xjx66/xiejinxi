export const OBJECT_TEMPLATES = [
    {
        id: 'template-product-model',
        objectType: 'model',
        collection: 'product',
        renderMode: 'model',
        defaultScale: { x: 1, y: 1, z: 1 },
        interactionConfig: {
            selectable: true,
            editable: true
        },
        capabilities: {
            selectable: true,
            editable: true,
            move: true,
            editMaterial: true,
            playAnimation: false
        },
        hitTestConfig: {
            nearDistance: 320,
            midDistance: 900,
            screenPadding: 20,
            farScreenPadding: 26,
            selectionBias: 16
        }
    },
    {
        id: 'template-product-video',
        objectType: 'video',
        collection: 'product',
        renderMode: 'video-screen',
        defaultScale: { x: 1, y: 1, z: 1 },
        interactionConfig: {
            selectable: true,
            editable: true
        },
        capabilities: {
            selectable: true,
            editable: true,
            move: true,
            setVideoPlayback: true
        },
        hitTestConfig: {
            nearDistance: 320,
            midDistance: 900,
            screenPadding: 20,
            farScreenPadding: 26,
            selectionBias: 16
        }
    },
    {
        id: 'template-painting-image',
        objectType: 'image',
        collection: 'painting',
        renderMode: 'framed-image',
        defaultScale: { x: 1, y: 1, z: 1 },
        interactionConfig: {
            selectable: true,
            editable: true
        },
        capabilities: {
            selectable: true,
            editable: true,
            move: true,
            editMaterial: true
        },
        hitTestConfig: {
            nearDistance: 260,
            midDistance: 840,
            screenPadding: 18,
            farScreenPadding: 24,
            selectionBias: 10
        }
    },
    {
        id: 'template-avatar-system',
        objectType: 'avatar-template',
        collection: 'avatar',
        renderMode: 'avatar-runtime',
        defaultScale: { x: 1, y: 1, z: 1 },
        interactionConfig: {
            selectable: true,
            editable: true
        },
        capabilities: {
            selectable: true,
            editable: true,
            move: true,
            speak: true,
            gesture: true,
            playAnimation: true
        }
    }
];

export const OBJECT_TEMPLATE_INDEX = new Map(OBJECT_TEMPLATES.map((template) => [template.id, template]));

export const getObjectTemplateById = (templateId) => {
    return OBJECT_TEMPLATE_INDEX.get(templateId) || null;
};
