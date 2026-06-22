// 注册 agent 的工具集到 registry。预置工具是“快捷方式”，run_script 是“没有现成工具时自己造工具”的万能出口。

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label || '执行'}超时(${ms}ms)`)), ms))
]);

// 内置形状裁剪绘制函数（crop_image 用；run_script 里模型也可自写）
const shapeDraw = (shape) => (canvas, c, img) => {
    const w = canvas.width;
    const h = canvas.height;
    c.clearRect(0, 0, w, h);
    c.save();
    c.beginPath();
    if (shape === 'circle') {
        c.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    } else if (shape === 'rounded') {
        const r = Math.min(w, h) * 0.12;
        c.moveTo(r, 0);
        c.arcTo(w, 0, w, h, r);
        c.arcTo(w, h, 0, h, r);
        c.arcTo(0, h, 0, 0, r);
        c.arcTo(0, 0, w, 0, r);
    } else {
        c.rect(0, 0, w, h);
    }
    c.closePath();
    c.clip();
    c.drawImage(img, 0, 0, w, h);
    c.restore();
};

export const registerAgentTools = ({ registry, ctx }) => {
    registry.register({
        name: 'get_selected_object',
        description: '读取当前选中对象的信息（id、类型、资产、位姿、是否有相框）。动手前通常先调它确认目标。',
        parameters: { type: 'object', properties: {} },
        handler: () => ({ selected: ctx.getSelectedObject() })
    });

    registry.register({
        name: 'list_objects',
        description: '列出世界中所有对象的摘要。',
        parameters: { type: 'object', properties: {} },
        handler: () => ({ objects: ctx.listObjects() })
    });

    registry.register({
        name: 'move_object',
        description: '相对移动选中对象（世界单位，+x右 +y上 +z朝向镜头）。',
        parameters: {
            type: 'object',
            properties: { dx: { type: 'number' }, dy: { type: 'number' }, dz: { type: 'number' } }
        },
        handler: ({ dx = 0, dy = 0, dz = 0 }) =>
            ctx.transform(null, { type: 'moveObject', payload: { mode: 'relative', dx, dy, dz } })
    });

    registry.register({
        name: 'rotate_object',
        description: '绕某轴相对旋转选中对象（度）。转身一般绕 y 轴。',
        parameters: {
            type: 'object',
            properties: { axis: { type: 'string', enum: ['x', 'y', 'z'] }, degrees: { type: 'number' } },
            required: ['degrees']
        },
        handler: ({ axis = 'y', degrees = 0 }) =>
            ctx.transform(null, { type: 'rotateObject', payload: { mode: 'relative', axis, degrees } })
    });

    registry.register({
        name: 'scale_object',
        description: '统一缩放选中对象。1.2=放大20%，0.8=缩小20%。',
        parameters: {
            type: 'object',
            properties: { factor: { type: 'number' } },
            required: ['factor']
        },
        handler: ({ factor = 1 }) =>
            ctx.transform(null, { type: 'scaleObject', payload: { factor } })
    });

    registry.register({
        name: 'set_frame',
        description: '给选中图片加/去相框（frame=加，plain=去）。仅对 image 有效。',
        parameters: {
            type: 'object',
            properties: { style: { type: 'string', enum: ['frame', 'plain'] } },
            required: ['style']
        },
        handler: ({ style = 'frame' }) => ctx.setFrame(null, style)
    });

    registry.register({
        name: 'crop_image',
        description: '把选中图片裁剪成指定形状（circle 圆形 / rounded 圆角 / square 方形），生成新图并替换。',
        parameters: {
            type: 'object',
            properties: { shape: { type: 'string', enum: ['circle', 'rounded', 'square'] } },
            required: ['shape']
        },
        handler: async ({ shape = 'circle' }) => {
            const sel = ctx.getSelectedObject();
            if (!sel) throw new Error('没有选中对象');
            if (sel.assetKind !== 'image') throw new Error('只能裁剪图片对象');
            const newAssetId = await ctx.processImage(sel.assetId, shapeDraw(shape), { name: `${sel.name}-${shape}` });
            await ctx.replaceAsset(sel.id, newAssetId);
            return { ok: true, shape, objectId: sel.id };
        }
    });

    registry.register({
        name: 'list_animations',
        description: '列出选中对象(绑骨 GLB 模型)自带的骨骼动作名。播放前先用它查看有哪些动作。',
        parameters: { type: 'object', properties: {} },
        handler: () => ({ animations: ctx.listAnimations(null) })
    });

    registry.register({
        name: 'play_animation',
        description: '播放选中对象自带的骨骼动作（如奔跑、行走、挥手）。奔跑/行走/待机等连续动作设 loop:true 循环；挥手/跳跃等一次性动作 loop:false。播放前最好先 list_animations 确认动作名。',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: '动作名（来自 list_animations）' },
                loop: { type: 'boolean', description: '是否循环播放，连续动作设 true' }
            },
            required: ['name']
        },
        handler: ({ name, loop }) => ctx.playAnimation(null, name, { loop: Boolean(loop) })
    });

    registry.register({
        name: 'set_motion',
        description: '给选中对象设定运动轨迹（航点折线）。设定后用户点面板的"播放"即可让对象沿轨迹移动。复杂路径（圆形/曲线）请改用 run_script 计算大量航点后调 ctx.setMotion。',
        parameters: {
            type: 'object',
            properties: {
                waypoints: {
                    type: 'array',
                    description: '世界坐标航点数组，至少 2 个。',
                    items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'] }
                },
                duration: { type: 'number', description: '走完整条路径的秒数，默认 5' },
                loop: { type: 'boolean', description: '是否循环往复，默认 true' },
                orient: { type: 'boolean', description: '是否朝向运动方向，默认 true' }
            },
            required: ['waypoints']
        },
        handler: ({ waypoints, duration, loop, orient }) => ctx.setMotion(null, { waypoints, duration, loop, orient })
    });

    registry.register({
        name: 'delete_object',
        description: '删除选中对象。',
        parameters: { type: 'object', properties: {} },
        handler: () => ctx.deleteObject(null)
    });

    // —— 万能出口：模型现写 JS，跑在受控 ctx 里 ——
    registry.register({
        name: 'run_script',
        description: [
            '当没有现成工具能完成任务时，用本工具：你直接编写一段 async JavaScript 代码来完成操作。',
            '代码运行环境只暴露一个全局对象 ctx，可用的方法：',
            'ctx.getSelectedObject(), ctx.getSelectedObjects() //Shift多选时返回多个对象，批量操作(排列/对齐)用它, ctx.listObjects(), ctx.getAsset(id),',
            'await ctx.processImage(assetId, (canvas, c, img)=>{...}) //画布处理已有图，返回新assetId,',
            'await ctx.drawImage({width,height,name}, (canvas,c)=>{...}) //程序化生成新图，返回新assetId,',
            'await ctx.generate3DModel((THREE, group)=>{ /*用 THREE 几何体搭模型，加到 group*/ }, {name}) //程序化生成3D模型(GLB)，返回新assetId；之后 ctx.createObject({assetId, type:"model"}) 放入场景,',
            'await ctx.replaceAsset(objectId|null, newAssetId) //替换对象的图,',
            'ctx.setMotion(objectId|null, {waypoints:[{x,y,z},...], duration, loop, orient}) //设运动轨迹；复杂路径(如圆形)在此计算航点数组,',
            'ctx.listAnimations(objectId|null) / ctx.playAnimation(objectId|null, name, {loop}) //绑骨模型自带骨骼动作,',
            'ctx.getRigInfo(objectId|null) //读骨架，返回 {isRigged, bones:[骨骼名...]},',
            'ctx.animateRig(objectId|null, (THREE, boneNames, helpers)=>{ return [ helpers.swing("左大腿骨名",{axis:"x",amplitudeDeg:35,period:1}), helpers.swing("右大腿骨名",{axis:"x",amplitudeDeg:35,period:1,phaseDeg:180}) ]; }, {loop:true}) //为只有骨架、没现成动作的模型现场创作骨骼动作；helpers.swing 让骨骼绕轴往复摆动,',
            'await ctx.transform(objectId|null,{type,payload}), await ctx.setFrame(objectId|null, "frame"|"plain"),',
            'ctx.createObject({assetId,type:"image"}) //放入场景，不传 position 会自动放到当前视野前方且静止,',
            'ctx.deleteObject(objectId|null), ctx.log(...).',
            'objectId 传 null 表示当前选中对象。用 return 返回结果字符串。',
            '严禁：不要使用 window / document / bgScene / bgCamera / THREE 等 ctx 之外的全局对象；',
            '不要把对象挂到相机(如 camera.add)或按相机坐标摆放——新对象必须是世界里静止的，放置一律用 ctx.createObject。'
        ].join('\n'),
        parameters: {
            type: 'object',
            properties: {
                explanation: { type: 'string', description: '一句话说明这段代码要做什么' },
                code: { type: 'string', description: 'async JS 代码体，通过 ctx 操作世界，用 return 返回结果' }
            },
            required: ['code']
        },
        handler: async ({ code }) => {
            if (!code || typeof code !== 'string') throw new Error('缺少 code');
            // 把危险的全局对象在函数作用域里遮蔽成 undefined：模型代码无法触碰相机/场景/THREE，
            // 只能通过 ctx 操作世界——从根上杜绝“把对象绑到相机/按相机坐标摆放”导致的随镜头漂移。
            const SHADOWED = ['window', 'document', 'globalThis', 'self', 'top', 'parent',
                'THREE', 'bgScene', 'bgCamera', 'bgRenderer', 'scene', 'camera', 'renderer'];
            const fn = new AsyncFunction('ctx', ...SHADOWED, code);
            const result = await withTimeout(
                Promise.resolve(fn(ctx, ...SHADOWED.map(() => undefined))),
                10000,
                'run_script'
            );
            return { ok: true, result: result === undefined ? '' : String(result), logs: ctx._drainLogs() };
        }
    });
};
