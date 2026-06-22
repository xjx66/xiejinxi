import { ACTION_TYPES } from '../ai/action-protocol.js';

// 变换动作的纯数学：作用在一个 { position, rotation, scale } 三元组上，返回新的三元组。
// 同一套逻辑既给“就地改 root 的执行器”用，也给“改数据草稿的重建管线”用，避免两处实现漂移。

export const DEG2RAD = Math.PI / 180;
const SCALE_MIN = 0.02;
const SCALE_MAX = 200;

const clampScale = (v) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));

const cloneTriplet = (t) => ({
    position: { x: t.position.x, y: t.position.y, z: t.position.z },
    rotation: { x: t.rotation.x, y: t.rotation.y, z: t.rotation.z },
    scale: { x: t.scale.x, y: t.scale.y, z: t.scale.z }
});

export const applyTransformAction = (triplet, action) => {
    const next = cloneTriplet(triplet);
    const p = action.payload || {};
    if (action.type === ACTION_TYPES.MOVE_OBJECT) {
        if (p.mode === 'absolute') {
            next.position = { x: p.x, y: p.y, z: p.z };
        } else {
            next.position.x += p.dx;
            next.position.y += p.dy;
            next.position.z += p.dz;
        }
    } else if (action.type === ACTION_TYPES.ROTATE_OBJECT) {
        const delta = p.degrees * DEG2RAD;
        if (p.mode === 'absolute') {
            next.rotation[p.axis] = delta;
        } else {
            next.rotation[p.axis] += delta;
        }
    } else if (action.type === ACTION_TYPES.SCALE_OBJECT) {
        if (p.factor != null) {
            next.scale.x *= p.factor;
            next.scale.y *= p.factor;
            next.scale.z *= p.factor;
        } else {
            next.scale = { x: p.sx, y: p.sy, z: p.sz };
        }
        next.scale.x = clampScale(next.scale.x);
        next.scale.y = clampScale(next.scale.y);
        next.scale.z = clampScale(next.scale.z);
    }
    return next;
};

// 读 three.js root 的位姿成三元组
export const tripletFromRoot = (root) => ({
    position: { x: root.position.x, y: root.position.y, z: root.position.z },
    rotation: { x: root.rotation.x, y: root.rotation.y, z: root.rotation.z },
    scale: { x: root.scale.x, y: root.scale.y, z: root.scale.z }
});

// 把三元组写回 root
export const applyTripletToRoot = (root, t) => {
    root.position.set(t.position.x, t.position.y, t.position.z);
    root.rotation.set(t.rotation.x, t.rotation.y, t.rotation.z);
    root.scale.set(t.scale.x, t.scale.y, t.scale.z);
};
