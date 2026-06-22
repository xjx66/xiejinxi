// 运动轨迹播放器：按 worldObject.metadata.motion 定义的航点，每帧插值更新对象 root 的位置（可选朝向运动方向）。
// 轨迹定义(motion)持久化在 worldState；播放状态(elapsed/playing)是运行时的，不持久化。
//
// motion = {
//   waypoints: [{x,y,z}, ...],  // 世界坐标航点（>=2 个）
//   duration: 秒,                // 走完整条路径的时间
//   loop: bool,                  // 循环 / 只走一次
//   orient: bool                 // 是否让对象朝向运动方向（默认 true）
// }

const lerp = (a, b, f) => a + (b - a) * f;

// 按归一化进度 t(0..1) 在航点折线上采样位置（等时分段）
const samplePath = (waypoints, t, loop) => {
    const pts = loop ? [...waypoints, waypoints[0]] : waypoints;
    const segCount = pts.length - 1;
    if (segCount <= 0) return { ...pts[0] };
    const tt = Math.min(Math.max(t, 0), 1) * segCount;
    const i = Math.min(Math.floor(tt), segCount - 1);
    const f = tt - i;
    const a = pts[i];
    const b = pts[i + 1];
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) };
};

export const createMotionPlayer = ({ worldState, sceneObjectRegistry, onChange }) => {
    const playing = new Map(); // worldObjectId -> { elapsed }

    const getSpec = (id) => {
        const m = worldState.getWorldObjectById?.(id)?.metadata?.motion;
        return (m && Array.isArray(m.waypoints) && m.waypoints.length >= 2) ? m : null;
    };
    const getRoot = (id) => sceneObjectRegistry.getByWorldObjectId(id)?.root || null;

    const hasMotion = (id) => Boolean(getSpec(id));
    const isPlaying = (id) => playing.has(id);

    const applyAt = (id, t) => {
        const spec = getSpec(id);
        const root = getRoot(id);
        if (!spec || !root) return;
        // 轨迹锚定到对象的 home(worldObject.position)：整条路径平移，使第一个航点对齐到 home。
        // 这样移动对象后再播放，轨迹跟随到新位置、保持形状，而不是跳回航点的绝对坐标。
        const home = worldState.getWorldObjectById?.(id)?.position;
        const w0 = spec.waypoints[0];
        const ox = home ? home.x - w0.x : 0;
        const oy = home ? home.y - w0.y : 0;
        const oz = home ? home.z - w0.z : 0;
        const pos = samplePath(spec.waypoints, t, spec.loop);
        root.position.set(pos.x + ox, pos.y + oy, pos.z + oz);
        if (spec.orient !== false) {
            const ahead = samplePath(spec.waypoints, Math.min(t + 0.01, 1), spec.loop);
            const dx = ahead.x - pos.x;
            const dz = ahead.z - pos.z;
            if (dx * dx + dz * dz > 1e-6) root.rotation.y = Math.atan2(dx, dz);
        }
    };

    const play = (id) => {
        if (!hasMotion(id)) return false;
        if (!playing.has(id)) playing.set(id, { elapsed: 0 });
        onChange?.(id);
        return true;
    };
    const pause = (id) => { if (playing.delete(id)) onChange?.(id); }; // 停在当前位置
    const stop = (id) => { playing.delete(id); applyAt(id, 0); onChange?.(id); }; // 回到起点
    const toggle = (id) => (isPlaying(id) ? (pause(id), false) : play(id));

    // 每帧推进（在动画循环里调用）
    const update = (deltaSeconds) => {
        if (playing.size === 0) return;
        for (const [id, st] of [...playing]) {
            const spec = getSpec(id);
            const root = getRoot(id);
            if (!spec || !root) { playing.delete(id); continue; }
            const dur = spec.duration > 0 ? spec.duration : 5;
            st.elapsed += deltaSeconds;
            let t = st.elapsed / dur;
            if (t >= 1) {
                if (spec.loop) { st.elapsed %= dur; t = st.elapsed / dur; }
                else { t = 1; playing.delete(id); applyAt(id, 1); onChange?.(id); continue; }
            }
            applyAt(id, t);
        }
    };

    return { hasMotion, isPlaying, play, pause, stop, toggle, update };
};
