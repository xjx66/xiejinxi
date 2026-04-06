// eye-tracking.js

let isEyeTrackingEnabled = false;
let gazeDot = null;

function setupGazeDot() {
    if (!gazeDot) {
        gazeDot = document.createElement('div');
        gazeDot.id = 'gaze-dot';
        gazeDot.style.position = 'fixed';
        gazeDot.style.width = '20px';
        gazeDot.style.height = '20px';
        gazeDot.style.borderRadius = '50%';
        gazeDot.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
        gazeDot.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
        gazeDot.style.pointerEvents = 'none'; // So it doesn't interfere with clicks
        gazeDot.style.zIndex = '9999';
        gazeDot.style.transform = 'translate(-50%, -50%)'; // Center the dot
        gazeDot.style.display = 'none';
        gazeDot.style.transition = 'all 0.1s ease'; // Smooth movement
        document.body.appendChild(gazeDot);
    }
}

function toggleEyeTracking() {
    // Check if running on file protocol
    if (window.location.protocol === 'file:') {
        alert("WebGazer works only over https. If you are doing local development, you need to run a local server.");
        return;
    }

    isEyeTrackingEnabled = !isEyeTrackingEnabled;
    const menuText = document.querySelector('.menu-item[data-action="toggle-eye-tracking"]');
    
    if (isEyeTrackingEnabled) {
        if (menuText) menuText.textContent = "🛑 关闭眼动追踪";
        startEyeTracking();
    } else {
        if (menuText) menuText.textContent = "👁️ 开启眼动追踪";
        stopEyeTracking();
    }
}

// Debug helper
function logDebug(msg) {
    console.log(`[EyeTracking] ${msg}`);
}

function startEyeTracking() {
    logDebug('Starting eye tracking...');
    
    setupGazeDot();
    gazeDot.style.display = 'block';
    
    // Check if webgazer is loaded
    if (typeof webgazer === 'undefined') {
        logDebug('ERROR: webgazer is not defined!');
        alert('WebGazer.js failed to load. Please check network/console.');
        return;
    }

    try {
        logDebug('Initializing WebGazer...');

        // Clear data from previous session to avoid corruption
        webgazer.clearData();

        // Configure WebGazer BEFORE starting
        webgazer.setRegression('ridge')
            .setTracker('TFFacemesh')
            .showVideoPreview(true)
            .showPredictionPoints(true)
            .applyKalmanFilter(true);

        // Set up listener
        webgazer.setGazeListener(function(data, elapsedTime) {
            if (data == null) {
                return;
            }
            
            const x = data.x;
            const y = data.y;
            
            // Custom dot update
            if (gazeDot) {
                gazeDot.style.left = x + 'px';
                gazeDot.style.top = y + 'px';
                gazeDot.style.display = 'block'; // Ensure visible
            }
        });

        logDebug('Starting WebGazer loop...');
        
        // Start WebGazer
        webgazer.begin()
        .then(() => {
            logDebug('WebGazer started successfully');
            
            // Force show video and points
            const videoElement = document.getElementById('webgazerVideoFeed');
            if (videoElement) {
                videoElement.style.display = 'block';
                videoElement.style.position = 'fixed';
                videoElement.style.top = '0px';
                videoElement.style.left = '0px';
                videoElement.style.zIndex = '99999';
                logDebug('Video element found and styled');
            } else {
                logDebug('WARNING: Video element not found yet');
            }
            
            // Add a simple notification for calibration
            showCalibrationNotification();
            
            // Add click listener for visual feedback
            document.addEventListener('click', handleCalibrationClick);
        })
        .catch(err => {
            logDebug(`ERROR in begin(): ${err}`);
            console.error(err);
            alert('WebGazer failed to start. Check console for details.');
        });
        
    } catch (e) {
        logDebug(`EXCEPTION: ${e.message}`);
        console.error(e);
    }
}

function showCalibrationNotification() {
    const existing = document.getElementById('calibration-note');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'calibration-note';
    notification.innerHTML = `
        <div style="margin-bottom: 8px;"><strong>👁️ 眼动追踪已开启</strong></div>
        <div style="font-size: 12px; opacity: 0.9;">
            1. 请允许摄像头权限<br>
            2. 保持头部稳定，不要大幅移动<br>
            3. <strong>重要：</strong>移动鼠标并在屏幕各处点击（尤其是四个角落）来校准<br>
            4. 点击次数越多，红点越准确
        </div>
    `;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.background = 'rgba(0, 0, 0, 0.85)';
    notification.style.color = 'white';
    notification.style.padding = '20px 30px';
    notification.style.borderRadius = '12px';
    notification.style.zIndex = '100000';
    notification.style.textAlign = 'center';
    notification.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
    notification.style.backdropFilter = 'blur(10px)';
    notification.style.border = '1px solid rgba(255,255,255,0.15)';
    notification.style.pointerEvents = 'none';
    
    document.body.appendChild(notification);
    
    // Auto hide after 15 seconds (give user more time to read)
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 1s';
            setTimeout(() => notification.remove(), 1000);
        }
    }, 15000);
}

function stopEyeTracking() {
    logDebug('Stopping eye tracking...');
    
    // Remove click listener
    document.removeEventListener('click', handleCalibrationClick);
    
    try {
        if (typeof webgazer !== 'undefined') {
            webgazer.end();
            logDebug('WebGazer stopped');
        }
    } catch (e) {
        logDebug(`Error stopping WebGazer: ${e.message}`);
    }

    if (gazeDot) {
        gazeDot.style.display = 'none';
    }
    const note = document.getElementById('calibration-note');
    if (note) note.remove();
    
    // Also remove the video element created by webgazer if it persists
    const videoContainer = document.getElementById('webgazerVideoContainer');
    if (videoContainer) {
        videoContainer.remove();
    }
    const videoFeed = document.getElementById('webgazerVideoFeed');
    if (videoFeed) {
        videoFeed.remove();
    }
    const faceOverlay = document.getElementById('webgazerFaceOverlay');
    if (faceOverlay) {
        faceOverlay.remove();
    }
    const feedbackBox = document.getElementById('webgazerFaceFeedbackBox');
    if (feedbackBox) {
        feedbackBox.remove();
    }
    
    // Remove calibration overlay if exists
    const overlay = document.getElementById('calibration-overlay');
    if (overlay) overlay.remove();
}

function handleCalibrationClick(e) {
    if (!isEyeTrackingEnabled) return;
    
    // Don't duplicate feedback if clicking on calibration points (they have their own)
    if (e.target.classList.contains('calibration-point')) return;
    
    // Create feedback element
    const feedback = document.createElement('div');
    feedback.style.position = 'fixed';
    feedback.style.left = e.clientX + 'px';
    feedback.style.top = e.clientY + 'px';
    feedback.style.transform = 'translate(-50%, -50%)';
    feedback.style.pointerEvents = 'none';
    feedback.style.zIndex = '999999';
    
    // Inner ripple
    const ripple = document.createElement('div');
    ripple.style.width = '10px';
    ripple.style.height = '10px';
    ripple.style.borderRadius = '50%';
    ripple.style.border = '2px solid #00ff00';
    ripple.style.animation = 'calibrationRipple 0.6s ease-out forwards';
    feedback.appendChild(ripple);
    
    // Text
    const text = document.createElement('div');
    text.textContent = '校准点 +1';
    text.style.position = 'absolute';
    text.style.top = '-20px';
    text.style.left = '50%';
    text.style.transform = 'translateX(-50%)';
    text.style.color = '#00ff00';
    text.style.fontSize = '12px';
    text.style.fontWeight = 'bold';
    text.style.whiteSpace = 'nowrap';
    text.style.textShadow = '0 0 2px black';
    text.style.opacity = '0';
    text.style.animation = 'calibrationText 0.8s ease-out forwards';
    feedback.appendChild(text);
    
    document.body.appendChild(feedback);
    
    // Cleanup
    setTimeout(() => {
        feedback.remove();
    }, 1000);
}

// Add styles for animations
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes calibrationRipple {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(5); opacity: 0; }
}
@keyframes calibrationText {
  0% { transform: translate(-50%, 0); opacity: 0; }
  20% { transform: translate(-50%, -10px); opacity: 1; }
  100% { transform: translate(-50%, -30px); opacity: 0; }
}
`;
document.head.appendChild(styleSheet);

function startCalibration() {
    // If not enabled, enable it first
    if (!isEyeTrackingEnabled) {
        toggleEyeTracking();
    }
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'calibration-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
    overlay.style.zIndex = '200000';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    
    // Instructions
    const instructions = document.createElement('div');
    instructions.innerHTML = `
        <h2 style="color:white; margin-bottom:20px;">眼动追踪校准</h2>
        <p style="color:#ddd; margin-bottom:30px; text-align:center;">
            请依次点击屏幕上的 9 个红点。<br>
            点击每个点 5 次，直到它变绿。<br>
            眼睛请始终注视着你点击的点。
        </p>
    `;
    overlay.appendChild(instructions);
    
    // Create 9 points
    const points = [
        {x: 10, y: 10}, {x: 50, y: 10}, {x: 90, y: 10},
        {x: 10, y: 50}, {x: 50, y: 50}, {x: 90, y: 50},
        {x: 10, y: 90}, {x: 50, y: 90}, {x: 90, y: 90}
    ];
    
    points.forEach((pos, index) => {
        const btn = document.createElement('button');
        btn.className = 'calibration-point';
        btn.style.position = 'absolute';
        btn.style.left = pos.x + '%';
        btn.style.top = pos.y + '%';
        btn.style.transform = 'translate(-50%, -50%)';
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.style.borderRadius = '50%';
        btn.style.border = '2px solid white';
        btn.style.backgroundColor = 'red';
        btn.style.cursor = 'pointer';
        btn.dataset.clicks = 0;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent closing
            let clicks = parseInt(btn.dataset.clicks) + 1;
            btn.dataset.clicks = clicks;
            
            // Visual feedback
            const opacity = Math.min(1, clicks * 0.2);
            btn.style.backgroundColor = `rgba(0, 255, 0, ${opacity})`;
            
            if (clicks >= 5) {
                btn.style.backgroundColor = '#00ff00';
                btn.disabled = true;
                btn.style.boxShadow = '0 0 15px #00ff00';
                checkCalibrationComplete();
            }
        });
        
        overlay.appendChild(btn);
    });
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '退出校准';
    closeBtn.style.position = 'absolute';
    closeBtn.style.bottom = '30px';
    closeBtn.style.padding = '10px 20px';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => {
        overlay.remove();
    };
    overlay.appendChild(closeBtn);
    
    document.body.appendChild(overlay);
}

function checkCalibrationComplete() {
    const totalPoints = 9;
    const completedPoints = document.querySelectorAll('.calibration-point[disabled]').length;
    
    if (completedPoints >= totalPoints) {
        alert("校准完成！现在眼动追踪应该更准确了。");
        setTimeout(() => {
            const overlay = document.getElementById('calibration-overlay');
            if (overlay) overlay.remove();
        }, 1000);
    }
}

