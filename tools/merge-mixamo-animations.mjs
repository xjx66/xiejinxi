// 把临时 GLB 目录中的所有动作合并到一个角色 GLB 中
// 用法: node tools/merge-mixamo-animations.mjs <animDir> <outputPath>
// 约定: animDir 中包含一个 Peasant_Girl.glb 作为角色本体（带 skin），其余 *.glb 仅提供动作
import path from 'node:path';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';

const animDir = process.argv[2] || '/tmp/sword-pack-glb';
const outputPath = process.argv[3] || '/Users/bytedance/Desktop/our-website/TalkingHead/avatars/peasant-girl-sword.glb';

const io = new NodeIO();
const baseFile = path.join(animDir, 'Peasant_Girl.glb');
if (!fs.existsSync(baseFile)) throw new Error(`base GLB not found: ${baseFile}`);

const baseDoc = await io.read(baseFile);
const baseRoot = baseDoc.getRoot();

// 清掉 base 自带的（默认 idle）动画——会作为单独的 idle 动作再加入
baseRoot.listAnimations().forEach((a) => a.dispose());

// bone name → base scene Node
const baseBoneByName = new Map();
baseRoot.listNodes().forEach((n) => baseBoneByName.set(n.getName(), n));
console.log(`[base] nodes=${baseRoot.listNodes().length}, animations cleared`);

// 列出动作 glb（排除角色本体）
const animFiles = fs.readdirSync(animDir)
    .filter((f) => f.endsWith('.glb') && f !== 'Peasant_Girl.glb')
    .sort();

// 也要加一段角色本体自带的 idle 作为 "idle_default"
animFiles.unshift('Peasant_Girl.glb');

const cleanClipName = (filename) => filename
    .replace(/\.glb$/, '')
    .replace(/^sword_and_shield_/, '')
    .replace(/__(\d+)$/, '_$1')   // 文件名里的 (2) 转回数字后缀
    .replace(/_+/g, '_');

let totalChannels = 0;
let totalAdded = 0;
let totalSkipped = 0;

for (const filename of animFiles) {
    const animDoc = await io.read(path.join(animDir, filename));
    const animDocRoot = animDoc.getRoot();
    const sourceAnims = animDocRoot.listAnimations();
    if (sourceAnims.length === 0) {
        console.log(`[skip] ${filename}: no animations`);
        continue;
    }
    // Mixamo pack 一文件一段，但稳妥起见全部合并
    const baseClipName = filename === 'Peasant_Girl.glb' ? 'idle_default' : cleanClipName(filename);

    sourceAnims.forEach((sourceAnim, idx) => {
        const clipName = sourceAnims.length === 1 ? baseClipName : `${baseClipName}_${idx}`;
        const newAnim = baseDoc.createAnimation(clipName);

        let channelCount = 0;
        let skipped = 0;
        for (const ch of sourceAnim.listChannels()) {
            const sourceTargetNode = ch.getTargetNode();
            const targetName = sourceTargetNode?.getName();
            if (!targetName) { skipped++; continue; }
            const baseTarget = baseBoneByName.get(targetName);
            if (!baseTarget) { skipped++; continue; }

            const sourceSampler = ch.getSampler();
            const sourceInput = sourceSampler.getInput();
            const sourceOutput = sourceSampler.getOutput();

            const newInput = baseDoc.createAccessor()
                .setArray(new Float32Array(sourceInput.getArray()))
                .setType(sourceInput.getType());
            const newOutput = baseDoc.createAccessor()
                .setArray(new Float32Array(sourceOutput.getArray()))
                .setType(sourceOutput.getType());

            const newSampler = baseDoc.createAnimationSampler()
                .setInput(newInput)
                .setOutput(newOutput)
                .setInterpolation(sourceSampler.getInterpolation());

            const newChannel = baseDoc.createAnimationChannel()
                .setTargetNode(baseTarget)
                .setTargetPath(ch.getTargetPath())
                .setSampler(newSampler);

            newAnim.addChannel(newChannel);
            newAnim.addSampler(newSampler);
            channelCount++;
        }
        totalChannels += channelCount;
        totalAdded += channelCount > 0 ? 1 : 0;
        totalSkipped += skipped;
        console.log(`[+] ${clipName}: channels=${channelCount} (skipped=${skipped})`);
        if (channelCount === 0) newAnim.dispose();
    });
}

await io.write(outputPath, baseDoc);
const stat = fs.statSync(outputPath);
console.log('---');
console.log(`output     : ${outputPath}`);
console.log(`size       : ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`clips added: ${totalAdded}`);
console.log(`channels   : ${totalChannels}`);
console.log(`skipped ch : ${totalSkipped}`);
