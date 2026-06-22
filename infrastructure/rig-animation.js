// 程序化骨骼动画辅助：给 agent 提供易用的工具，为"只有骨架、没现成动作"的绑骨模型现场造动作。
// 核心是 swing：让某根骨骼绕轴相对其静止姿态做正弦往复摆动（走/跑/挥手/摇摆等都由若干 swing 叠加而成）。

export const createRigHelpers = (THREE, bonesByName) => {
    const axisVec = (axis) => (
        axis === 'y' ? new THREE.Vector3(0, 1, 0)
            : axis === 'z' ? new THREE.Vector3(0, 0, 1)
                : new THREE.Vector3(1, 0, 0)
    );

    // swing(boneName, {axis, amplitudeDeg, period, phaseDeg, frames})
    //   绕 axis 轴、以 period 秒为周期、振幅 amplitudeDeg 度，相对骨骼静止姿态往复摆动。
    //   首尾关键帧相同 → 循环无缝。返回一条 QuaternionKeyframeTrack。
    const swing = (boneName, { axis = 'x', amplitudeDeg = 20, period = 1, phaseDeg = 0, frames = 24 } = {}) => {
        const bone = bonesByName[boneName];
        if (!bone) throw new Error(`找不到骨骼: ${boneName}`);
        const rest = bone.quaternion.clone();
        const ax = axisVec(axis);
        const amp = (amplitudeDeg * Math.PI) / 180;
        const phase = (phaseDeg * Math.PI) / 180;
        const times = [];
        const values = [];
        for (let i = 0; i <= frames; i += 1) {
            times.push((i / frames) * period);
            const angle = amp * Math.sin((2 * Math.PI * i) / frames + phase);
            const delta = new THREE.Quaternion().setFromAxisAngle(ax, angle);
            const q = rest.clone().multiply(delta);
            values.push(q.x, q.y, q.z, q.w);
        }
        return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
    };

    // 让整个对象上下轻微起伏（蹦跳/呼吸感）：作用在某根根骨骼的 position.y 上。
    const bob = (boneName, { amplitude = 0.05, period = 1, frames = 24 } = {}) => {
        const bone = bonesByName[boneName];
        if (!bone) throw new Error(`找不到骨骼: ${boneName}`);
        const restY = bone.position.y;
        const restX = bone.position.x;
        const restZ = bone.position.z;
        const times = [];
        const values = [];
        for (let i = 0; i <= frames; i += 1) {
            times.push((i / frames) * period);
            const y = restY + amplitude * Math.abs(Math.sin((Math.PI * i) / frames));
            values.push(restX, y, restZ);
        }
        return new THREE.VectorKeyframeTrack(`${boneName}.position`, times, values);
    };

    return { swing, bob, axisVec };
};
