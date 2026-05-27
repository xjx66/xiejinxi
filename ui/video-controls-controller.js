const formatVideoTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '00:00';
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60).toString().padStart(2, '0');
    const rest = (total % 60).toString().padStart(2, '0');
    return `${minutes}:${rest}`;
};

export const createVideoControlsController = ({
    document,
    window,
    nodes,
    getSelectedVideo,
    getState
}) => {
    const disposers = [];
    const {
        controls,
        toggle,
        progress,
        time
    } = nodes;

    const render = () => {
        if (!controls || !toggle || !progress || !time) return;
        const video = getSelectedVideo(getState());
        if (!video) {
            controls.style.display = 'none';
            return;
        }
        controls.style.display = 'flex';
        toggle.textContent = video.paused ? '播放' : '暂停';
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const progressValue = duration > 0 ? Math.round((video.currentTime / duration) * 1000) : 0;
        if (document.activeElement !== progress) {
            progress.value = String(progressValue);
        }
        time.textContent = `${formatVideoTime(video.currentTime)} / ${formatVideoTime(duration)}`;
    };

    const addListener = (node, type, listener) => {
        node?.addEventListener(type, listener);
        if (node) {
            disposers.push(() => node.removeEventListener(type, listener));
        }
    };

    addListener(toggle, 'click', () => {
        const video = getSelectedVideo(getState());
        if (!video) return;
        if (video.paused) {
            const playPromise = video.play();
            playPromise?.catch?.(() => {
                video.muted = true;
                video.play().catch(() => {});
            });
        } else {
            video.pause();
        }
        render();
    });
    addListener(progress, 'input', () => {
        const video = getSelectedVideo(getState());
        const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        if (!video || duration <= 0) return;
        video.currentTime = (Number(progress.value) / 1000) * duration;
        render();
    });

    const timer = window.setInterval(render, 500);
    disposers.push(() => window.clearInterval(timer));

    return {
        render,
        dispose() {
            disposers.splice(0).forEach((dispose) => dispose());
        }
    };
};
