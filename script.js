
// 12. Help Modal Logic
const helpToggle = document.getElementById('helpToggle');
const helpModal = document.getElementById('helpModal');
const closeModal = document.querySelector('.close-modal');

if (helpToggle && helpModal && closeModal) {
    helpToggle.addEventListener('click', () => {
        helpModal.style.display = 'block';
    });

    closeModal.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == helpModal) {
            helpModal.style.display = 'none';
        }
    });
}

// Theme Toggle Logic
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

function setTheme(theme) {
    body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update toggle button icon if needed
    if (themeToggle) {
        themeToggle.textContent = theme === 'light' ? '🌞' : '🌓';
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

// Initialize theme
const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
}

// Handle custom menu clicks globally
document.addEventListener('click', (e) => {
    if (e.target.closest('.menu-item[data-action="toggle-dark"]')) {
        toggleTheme();
    }
});

// Eye Tracking Toggle Logic
const eyeTrackingToggle = document.getElementById('eyeTrackingToggle');
if (eyeTrackingToggle) {
    eyeTrackingToggle.addEventListener('click', () => {
        if (typeof toggleEyeTracking === 'function') {
            toggleEyeTracking();
            // Update button icon based on state (toggleEyeTracking updates isEyeTrackingEnabled)
            setTimeout(() => {
                if (typeof isEyeTrackingEnabled !== 'undefined') {
                    eyeTrackingToggle.textContent = isEyeTrackingEnabled ? '🛑' : '👁️';
                    eyeTrackingToggle.style.background = isEyeTrackingEnabled ? 'rgba(255, 0, 0, 0.2)' : '';
                }
            }, 100);
        } else {
            console.error('toggleEyeTracking function not found');
        }
    });
}

// -------------------------------------------------------------------
// 涂鸦墙与 TalkingHead 交互控制
// -------------------------------------------------------------------
// 监听滚轮事件来缩放模型 (当鼠标在 TalkingHead 区域时)
const talkingHeadContainer = document.getElementById('talkinghead-container');
if (talkingHeadContainer) {
    talkingHeadContainer.addEventListener('wheel', (e) => {
        // 阻止页面滚动
        e.preventDefault();
        
        // 获取 TalkingHead 实例 (假设它是全局变量 head)
        // 如果 head 是在 talkinghead.js 中定义的局部变量，我们需要一种方式访问它
        // 这里假设 talkinghead.js 把 head 暴露到了 window 对象或者可以通过其他方式访问
        // 但目前 talkinghead.js 似乎没有暴露。
        // 实际上 TalkingHead 内部自带了 cameraZoomEnable: true，所以它应该已经支持滚轮缩放了。
        // 我们只需要确保事件能传进去。
    }, { passive: false });
}

// 涂鸦墙的交互逻辑...
const canvas = document.getElementById('robot-container'); // 假设这是涂鸦墙容器
// ... (现有逻辑)
