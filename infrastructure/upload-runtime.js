const guessKindFromFile = (file) => {
    const fileName = file.name.toLowerCase();
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(fileName)) return 'image';
    if (file.type.startsWith('video/') || /\.mp4$/i.test(fileName)) return 'video';
    if (/\.glb$/i.test(fileName)) return 'glb';
    return null;
};

export const createUploadRuntime = () => {
    return {
        createAssetFromFile(file) {
            const kind = guessKindFromFile(file);
            if (!kind) {
                throw new Error('当前仅支持图片、视频和 GLB 文件');
            }
            const asset = {
                id: `asset-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                kind,
                source: 'user-upload',
                name: file.name,
                url: URL.createObjectURL(file),
                metadata: {
                    mimeType: file.type || '',
                    size: file.size,
                    createdAt: Date.now()
                }
            };
            return asset;
        }
    };
};
