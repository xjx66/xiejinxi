const fs = require('fs');

// 这是一个极其简化的 GLB 解析器，只为了寻找 "animations" 和它们的名称
// GLB 是一个二进制格式，包含 JSON chunk 和 BIN chunk
function listGLBAnimations(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        
        // 验证魔数 "glTF"
        const magic = buffer.toString('utf8', 0, 4);
        if (magic !== 'glTF') {
            console.error('Not a valid GLB file.');
            return;
        }

        // 读取 JSON chunk 的长度 (位于字节 12-15)
        const jsonChunkLength = buffer.readUInt32LE(12);
        
        // 验证 JSON chunk 类型 (位于字节 16-19, 应该是 "JSON")
        const jsonChunkType = buffer.toString('utf8', 16, 20);
        if (jsonChunkType !== 'JSON') {
            console.error('JSON chunk not found where expected.');
            return;
        }

        // 读取并解析 JSON
        const jsonString = buffer.toString('utf8', 20, 20 + jsonChunkLength);
        const gltf = JSON.parse(jsonString);

        console.log(`\n=== Animations found in ${filePath} ===`);
        
        if (!gltf.animations || gltf.animations.length === 0) {
            console.log('No animations found in this model.');
            return;
        }

        console.log(`Total animations: ${gltf.animations.length}`);
        gltf.animations.forEach((anim, index) => {
            console.log(`[${index}] ${anim.name || 'Unnamed Animation'}`);
        });
        console.log('====================================\n');

        // Check meshes
        console.log(`\n=== Meshes ===`);
        if (gltf.meshes) {
            gltf.meshes.forEach((mesh, index) => {
                console.log(`[${index}] Mesh: ${mesh.name || 'Unnamed'}`);
            });
        }
        
        // Check nodes to see if there are leg bones
        console.log(`\n=== Nodes (Bones) ===`);
        if (gltf.nodes) {
            const legBones = gltf.nodes.filter(n => n.name && (n.name.toLowerCase().includes('leg') || n.name.toLowerCase().includes('foot') || n.name.toLowerCase().includes('toe')));
            console.log(`Found ${legBones.length} leg/foot related nodes:`);
            legBones.forEach(b => console.log(`  - ${b.name}`));
        }
        console.log('====================================\n');

    } catch (error) {
        console.error('Error parsing GLB:', error.message);
    }
}

listGLBAnimations('./avatars/elonmask_animations.glb');
