const gameView = document.getElementById('game-view');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const editorView = document.getElementById('editor-view');
const editorCanvas = document.getElementById('editor-canvas');
const editorCtx = editorCanvas.getContext('2d');

const editorUI = document.getElementById('editor-ui');
const addSegmentBtn = document.getElementById('add-segment-btn');
const doneBtn = document.getElementById('done-btn');
const segmentProperties = document.getElementById('segment-properties');
const radiusInput = document.getElementById('radius-input');
const removeSegmentBtn = document.getElementById('remove-segment-btn');
const outlineCheckbox = document.getElementById('outline-checkbox');
const outlineColorInput = document.getElementById('outline-color-input');
const bodyColorInput = document.getElementById('body-color-input');
const bgColorInput = document.getElementById('bg-color-input');
const legLengthInput = document.getElementById('leg-length-input');
const legWidthInput = document.getElementById('leg-width-input');
const eyeSideOffsetInput = document.getElementById('eye-side-offset-input');
const eyeForwardOffsetInput = document.getElementById('eye-forward-offset-input');
const eyeRadiusInput = document.getElementById('eye-radius-input');

const addLegPairBtn = document.getElementById('add-leg-pair-btn');
const removeLegPairBtn = document.getElementById('remove-leg-pair-btn');

// New UI Elements
const walkSpeedInput = document.getElementById('walk-speed-input');
const dashEnabledCheckbox = document.getElementById('dash-enabled-checkbox');
const segmentDensityInput = document.getElementById('segment-density-input');
const skinPatternSelect = document.getElementById('skin-pattern-select');
const patternOptions = document.getElementById('pattern-options');
const patternColor2Input = document.getElementById('pattern-color-2-input');
const headProperties = document.getElementById('head-properties');
const headWidthInput = document.getElementById('head-width-input');
const headHeightInput = document.getElementById('head-height-input');

let width, height;
let editorWidth, editorHeight;

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    editorWidth = editorCanvas.width = window.innerWidth;
    editorHeight = editorCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let isCircleView = true;
let gameState = 'playing'; // 'playing' or 'editing'

let legAnimationPhase = 0;

const editorCamera = {
    x: 0,
    y: 0,
    zoom: 1,
    isPanning: false,
    lastMouseX: 0,
    lastMouseY: 0
};

let bodyProperties = {
    hasOutline: false,
    outlineWidth: 2,
    outlineColor: '#000000',
    bodyColor: '#FFFFFF',
    backgroundColor: '#272D35',
    eyeSideOffset: 0.3,
    eyeForwardOffset: 0.4,
    eyeRadius: 4,
    legs: [],
    segmentLength: 50,
    walkSpeed: 1.0,
    dashEnabled: false,
    pattern: 'solid',
    patternColor2: '#888888',
};

// Dash state
let isDashing = false;
let dashCooldown = 0;
let dashTimer = 0;
const DASH_DURATION = 8; // frames
const DASH_SPEED = 45;
const DASH_COOLDOWN_TIME = 60; // frames
let dashParticles = [];

const player = {
    x: width / 2,
    y: height / 2,
    radius: 8,
    radiusX: 40, // for ellipse shape
    radiusY: 40, // for ellipse shape
    color: 'white', // This is now controlled by bodyProperties.bodyColor
    vx: 0,
    vy: 0,
    auraRadius: 40
};

const chain = [player];
const numSegments = 6;
// const segmentLength = 50; // Now in bodyProperties
const auraRadiusDecrement = 5;

for (let i = 1; i < numSegments; i++) {
    chain.push({
        x: player.x,
        y: player.y + i * bodyProperties.segmentLength,
        radius: 8,
        color: 'white',
        auraRadius: Math.max(10, player.auraRadius - i * auraRadiusDecrement)
    });
}

const mouse = {
    x: width / 2,
    y: height / 2
};

const keys = {
    w: false
};

// --- Editor State ---
let selectedSegment = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W') {
        keys.w = true;
    }
    if (e.key === 'y' || e.key === 'Y') {
        isCircleView = !isCircleView;
    }
    if (e.key === 'h' || e.key === 'H') {
        toggleEditor();
    }
    if (e.key === ' ' && gameState === 'playing' && bodyProperties.dashEnabled && !isDashing && dashCooldown <= 0) {
        // Trigger Dash
        isDashing = true;
        dashTimer = DASH_DURATION;
        dashCooldown = DASH_COOLDOWN_TIME;
        
        const dx = mouse.x - player.x;
        const dy = mouse.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        player.vx = (dx / dist) * DASH_SPEED;
        player.vy = (dy / dist) * DASH_SPEED;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W') {
        keys.w = false;
    }
});

const acceleration = 0.15;
const friction = 0.97;
const maxSpeed = 10;

function straightenAndCenterChain() {
    // Straighten the chain vertically
    chain[0].x = editorWidth / 2;
    chain[0].y = editorHeight / 2 - (chain.length / 2) * bodyProperties.segmentLength;
    for (let i = 1; i < chain.length; i++) {
        chain[i].x = chain[i - 1].x;
        chain[i].y = chain[i - 1].y + bodyProperties.segmentLength;
    }
}

function toggleEditor() {
    if (gameState === 'playing') {
        gameState = 'editing';
        gameView.classList.add('hidden');
        editorView.classList.remove('hidden');
        editorCamera.x = 0;
        editorCamera.y = 0;
        editorCamera.zoom = 1;
        straightenAndCenterChain();
        deselectSegment();
    } else {
        gameState = 'playing';
        editorView.classList.add('hidden');
        gameView.classList.remove('hidden');
        // Center player in game view when exiting editor
        player.x = width / 2;
        player.y = height / 2;
        player.vx = 0;
        player.vy = 0;
    }
}

doneBtn.addEventListener('click', toggleEditor);

addSegmentBtn.addEventListener('click', () => {
    if (chain.length > 0) {
        const lastSegment = chain[chain.length - 1];
        chain.push({
            x: lastSegment.x,
            y: lastSegment.y + bodyProperties.segmentLength,
            radius: 8,
            color: 'white',
            auraRadius: Math.max(10, lastSegment.auraRadius - auraRadiusDecrement)
        });
    }
});

removeSegmentBtn.addEventListener('click', () => {
    if (selectedSegment && chain.length > 1) {
        const index = chain.indexOf(selectedSegment);
        // Prevent removing the head (index 0)
        if (index > 0) {
            // also remove any legs attached to this segment
            bodyProperties.legs = bodyProperties.legs.filter(leg => leg.segmentIndex !== index);
            // and shift indices of legs on segments after this one
            bodyProperties.legs.forEach(leg => {
                if (leg.segmentIndex > index) {
                    leg.segmentIndex--;
                }
            });

            chain.splice(index, 1);
            deselectSegment();
        } else {
            alert("Cannot remove the head segment.");
        }
    }
});

outlineCheckbox.addEventListener('input', (e) => {
    bodyProperties.hasOutline = e.target.checked;
});

outlineColorInput.addEventListener('input', (e) => {
    bodyProperties.outlineColor = e.target.value;
});

bodyColorInput.addEventListener('input', (e) => {
    bodyProperties.bodyColor = e.target.value;
});

bgColorInput.addEventListener('input', (e) => {
    bodyProperties.backgroundColor = e.target.value;
    document.body.style.backgroundColor = bodyProperties.backgroundColor;
});

// New property listeners
walkSpeedInput.addEventListener('input', e => bodyProperties.walkSpeed = parseFloat(e.target.value));
dashEnabledCheckbox.addEventListener('input', e => bodyProperties.dashEnabled = e.target.checked);
segmentDensityInput.addEventListener('input', e => bodyProperties.segmentLength = parseInt(e.target.value, 10));
patternColor2Input.addEventListener('input', e => bodyProperties.patternColor2 = e.target.value);

skinPatternSelect.addEventListener('input', (e) => {
    bodyProperties.pattern = e.target.value;
    if (bodyProperties.pattern === 'solid') {
        patternOptions.classList.add('hidden');
    } else {
        patternOptions.classList.remove('hidden');
    }
});

headWidthInput.addEventListener('input', e => {
    if (selectedSegment === chain[0]) {
        chain[0].radiusX = parseInt(e.target.value, 10);
    }
});

headHeightInput.addEventListener('input', e => {
    if (selectedSegment === chain[0]) {
        chain[0].radiusY = parseInt(e.target.value, 10);
    }
});

eyeSideOffsetInput.addEventListener('input', (e) => {
    bodyProperties.eyeSideOffset = parseFloat(e.target.value);
});

eyeForwardOffsetInput.addEventListener('input', (e) => {
    bodyProperties.eyeForwardOffset = parseFloat(e.target.value);
});

eyeRadiusInput.addEventListener('input', (e) => {
    bodyProperties.eyeRadius = parseInt(e.target.value, 10);
});

function updateLegButtons() {
    if (!selectedSegment) {
        addLegPairBtn.style.display = 'none';
        removeLegPairBtn.style.display = 'none';
        // legDelayLabel.style.display = 'none';
        legLengthInput.style.display = 'none';
        legLengthInput.previousElementSibling.style.display = 'none'; // Hide label
        legWidthInput.style.display = 'none';
        legWidthInput.previousElementSibling.style.display = 'none'; // Hide label
        return;
    }
    const index = chain.indexOf(selectedSegment);
    const leg = bodyProperties.legs.find(leg => leg.segmentIndex === index);

    if (leg) {
        addLegPairBtn.style.display = 'none';
        removeLegPairBtn.style.display = 'inline-block';
        // legDelayLabel.style.display = 'inline-block';
        // legDelayCheckbox.checked = !!leg.delayEnabled;
        legLengthInput.style.display = 'block';
        legLengthInput.previousElementSibling.style.display = 'block'; // Show label
        legLengthInput.value = leg.length1 + leg.length2;
        legWidthInput.style.display = 'block';
        legWidthInput.previousElementSibling.style.display = 'block'; // Show label
        legWidthInput.value = leg.width1;
    } else {
        addLegPairBtn.style.display = 'inline-block';
        removeLegPairBtn.style.display = 'none';
        // legDelayLabel.style.display = 'none';
        legLengthInput.style.display = 'none';
        legLengthInput.previousElementSibling.style.display = 'none'; // Hide label
        legWidthInput.style.display = 'none';
        legWidthInput.previousElementSibling.style.display = 'none'; // Hide label
    }
}

addLegPairBtn.addEventListener('click', () => {
    if (selectedSegment) {
        const index = chain.indexOf(selectedSegment);
        // Avoid adding legs to the same segment twice
        if (!bodyProperties.legs.some(leg => leg.segmentIndex === index)) {
            const totalLength = parseFloat(legLengthInput.value);
            const width = parseFloat(legWidthInput.value);
            bodyProperties.legs.push({
                segmentIndex: index,
                length1: totalLength * 0.5,
                length2: totalLength * 0.5,
                width1: width,
                width2: width * 1.5, // Last segment is bigger
                baseAngle: Math.PI / 2.5, // Angle away from the body's forward direction
                phaseOffset: Math.random() * Math.PI * 2, // Random offset for staggered animation
                // delayEnabled: legDelayCheckbox ? legDelayCheckbox.checked : false, // toggle for delayed stepping
            });
            updateLegButtons();
        }
    }
});

removeLegPairBtn.addEventListener('click', () => {
    if (selectedSegment) {
        const index = chain.indexOf(selectedSegment);
        bodyProperties.legs = bodyProperties.legs.filter(leg => leg.segmentIndex !== index);
        updateLegButtons();
    }
});

/*
// Toggle delay for currently selected segment's leg pair
if (legDelayCheckbox) {
    legDelayCheckbox.addEventListener('input', (e) => {
        if (!selectedSegment) return;
        const index = chain.indexOf(selectedSegment);
        const leg = bodyProperties.legs.find(l => l.segmentIndex === index);
        if (leg) leg.delayEnabled = e.target.checked;
    });
}
*/

function deselectSegment() {
    selectedSegment = null;
    segmentProperties.classList.add('hidden');
}

function selectSegment(segment) {
    selectedSegment = segment;
    segmentProperties.classList.remove('hidden');
    radiusInput.value = segment.auraRadius;

    if (segment === chain[0]) {
        headProperties.classList.remove('hidden');
        headWidthInput.value = segment.radiusX;
        headHeightInput.value = segment.radiusY;
    } else {
        headProperties.classList.add('hidden');
    }

    updateLegButtons();
}

radiusInput.addEventListener('input', (e) => {
    if (selectedSegment) {
        selectedSegment.auraRadius = parseInt(e.target.value, 10);
    }
});

legLengthInput.addEventListener('input', (e) => {
    if (selectedSegment) {
        const index = chain.indexOf(selectedSegment);
        const leg = bodyProperties.legs.find(l => l.segmentIndex === index);
        if (leg) {
            const totalLength = parseFloat(e.target.value);
            leg.length1 = totalLength * 0.5;
            leg.length2 = totalLength * 0.5;
        }
    }
});

legWidthInput.addEventListener('input', (e) => {
    if (selectedSegment) {
        const index = chain.indexOf(selectedSegment);
        const leg = bodyProperties.legs.find(l => l.segmentIndex === index);
        if (leg) {
            const width = parseFloat(e.target.value);
            leg.width1 = width;
            leg.width2 = width * 1.5;
        }
    }
});

editorCanvas.addEventListener('mousedown', (e) => {
    if (gameState !== 'editing') return;

    if (e.button === 2) { // Right mouse button for panning
        e.preventDefault();
        editorCamera.isPanning = true;
        editorCamera.lastMouseX = e.clientX;
        editorCamera.lastMouseY = e.clientY;
        editorCanvas.style.cursor = 'move';
        return;
    }

    const mouseX = (e.clientX - editorWidth / 2 - editorCamera.x) / editorCamera.zoom + editorWidth / 2;
    const mouseY = (e.clientY - editorHeight / 2 - editorCamera.y) / editorCamera.zoom + editorHeight / 2;

    let clickedSegment = null;

    // Find segment to drag (in reverse to pick top ones first)
    for (let i = chain.length - 1; i >= 0; i--) {
        const segment = chain[i];
        const dx = mouseX - segment.x;
        const dy = mouseY - segment.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Always use auraRadius for grabbing in the editor for a larger click target
        const grabRadius = segment.auraRadius; 

        if (dist < grabRadius) {
            clickedSegment = segment;
            dragOffsetX = dx;
            dragOffsetY = dy;
            break;
        }
    }

    if (clickedSegment) {
        selectSegment(clickedSegment);
    } else {
        deselectSegment();
    }
});

editorCanvas.addEventListener('mousemove', (e) => {
    if (gameState !== 'editing') return;

    if (editorCamera.isPanning) {
        const dx = e.clientX - editorCamera.lastMouseX;
        const dy = e.clientY - editorCamera.lastMouseY;
        editorCamera.x += dx;
        editorCamera.y += dy;
        editorCamera.lastMouseX = e.clientX;
        editorCamera.lastMouseY = e.clientY;
        return;
    }

    if (!selectedSegment) return;

    // Only move if the mouse button is held down (implicitly handled by mouseup clearing selectedSegment)
    const isDragging = e.buttons === 1;
    if (isDragging) {
        const mouseX = (e.clientX - editorWidth / 2 - editorCamera.x) / editorCamera.zoom + editorWidth / 2;
        const mouseY = (e.clientY - editorHeight / 2 - editorCamera.y) / editorCamera.zoom + editorHeight / 2;
        selectedSegment.x = mouseX - dragOffsetX;
        selectedSegment.y = mouseY - dragOffsetY;
    }
});

editorCanvas.addEventListener('mouseup', (e) => {
    if (gameState !== 'editing') return;
    
    if (e.button === 2) {
        editorCamera.isPanning = false;
        editorCanvas.style.cursor = 'grab';
    }
    // Don't deselect on mouse up, only when clicking away.
    // This allows users to drag a point and then immediately edit its properties without re-selecting.
    // selectedSegment = null; is now handled by clicking on empty space.
});

editorCanvas.addEventListener('contextmenu', e => e.preventDefault()); // Prevent context menu in editor

editorCanvas.addEventListener('wheel', (e) => {
    if (gameState !== 'editing') return;
    e.preventDefault();
    const zoomAmount = 0.1;
    const mouseX = e.clientX - editorWidth / 2;
    const mouseY = e.clientY - editorHeight / 2;

    const zoomFactor = Math.pow(1 - zoomAmount, Math.sign(e.deltaY));

    // Adjust camera position to zoom towards the mouse cursor
    editorCamera.x = (editorCamera.x - mouseX) * zoomFactor + mouseX;
    editorCamera.y = (editorCamera.y - mouseY) * zoomFactor + mouseY;

    editorCamera.zoom *= zoomFactor;
    // Clamp zoom
    editorCamera.zoom = Math.max(0.1, Math.min(editorCamera.zoom, 5));
});


function updatePlayer() {
    if (isDashing) {
        dashTimer--;
        if (dashTimer <= 0) {
            isDashing = false;
        }
        // Add dash particles
        chain.forEach(seg => {
            if (Math.random() > 0.5) { // don't add too many
                 dashParticles.push({
                    x: seg.x,
                    y: seg.y,
                    life: 20,
                    radius: seg.auraRadius * 0.5,
                });
            }
        });

    } else {
         if (dashCooldown > 0) {
            dashCooldown--;
        }
        // Player movement with inertia
        if (keys.w) {
            const dx = mouse.x - player.x;
            const dy = mouse.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Accelerate towards the cursor
            if (dist > 1) { // Avoid jittering when close
                const ax = (dx / dist) * acceleration * bodyProperties.walkSpeed;
                const ay = (dy / dist) * acceleration * bodyProperties.walkSpeed;

                player.vx += ax;
                player.vy += ay;
            }
        }
    }


    // Apply friction to slow down
    player.vx *= friction;
    player.vy *= friction;

    // Cap speed
    const speedCap = maxSpeed * bodyProperties.walkSpeed;
    const currentSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (currentSpeed > speedCap) {
        player.vx = (player.vx / currentSpeed) * speedCap;
        player.vy = (player.vy / currentSpeed) * speedCap;
    }
    
    // Update player position based on velocity
    player.x += player.vx;
    player.y += player.vy;

    // Update leg animation
    if (currentSpeed > 0.5) { // Only animate when moving
        legAnimationPhase += currentSpeed * 0.05;
    }
}

function updateConstraints() {
    // Update chain constraints
    for (let i = 1; i < chain.length; i++) {
        const segment = chain[i];
        const prevSegment = chain[i - 1];

        const dx = segment.x - prevSegment.x;
        const dy = segment.y - prevSegment.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // This should be based on the distance between the two segments, not a fixed length
        const currentSegmentLength = bodyProperties.segmentLength;

        if (dist > currentSegmentLength) {
            const angle = Math.atan2(dy, dx);
            segment.x = prevSegment.x + Math.cos(angle) * currentSegmentLength;
            segment.y = prevSegment.y + Math.sin(angle) * currentSegmentLength;
        }
    }
}

function getSegmentOrientation(index) {
    const segment = chain[index];
    let dx, dy;

    if (index === 0) { // Head
        const next = chain[1] || { x: segment.x, y: segment.y - 1}; // Point up if only one segment
        dx = segment.x - next.x;
        dy = segment.y - next.y;
    } else { // Body/Tail
        const prev = chain[index - 1];
        dx = segment.x - prev.x;
        dy = segment.y - prev.y;
    }

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { angle: -Math.PI / 2, perpX: 1, perpY: 0 }; // Default to facing up

    // The angle of the segment's "forward" direction
    const angle = Math.atan2(dy, dx);
    // Perpendicular vector for side attachments
    const perpX = -dy / dist;
    const perpY = dx / dist;

    return { angle, perpX, perpY };
}


function drawParametricShape(targetCtx, points, radii, style, closeStart = true, closeEnd = true, isLeg = false) {
    if (points.length < 2 && !isLeg) { // Allow single point for head ellipse drawing
         if (points.length === 1 && closeStart) {
            const head = points[0];
            const orientation = getSegmentOrientation(0);
            targetCtx.beginPath();
            targetCtx.ellipse(head.x, head.y, head.radiusX, head.radiusY, orientation.angle - Math.PI/2, 0, Math.PI * 2);
            targetCtx.closePath();
         } else {
             return;
         }
    } else if (points.length < 2) {
        return;
    }


    const leftPoints = [];
    const rightPoints = [];

    // Calculate tangent points for each circle
    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const radius = radii[i];

        let dx, dy;
        if (i === 0) {
            const next = points[i + 1];
            dx = next.x - current.x;
            dy = next.y - current.y;
        } else if (i === points.length - 1) {
            const prev = points[i - 1];
            dx = current.x - prev.x;
            dy = current.y - prev.y;
        } else {
            const prev = points[i - 1];
            const next = points[i + 1];
            const v1x = current.x - prev.x;
            const v1y = current.y - prev.y;
            const v2x = next.x - current.x;
            const v2y = next.y - current.y;
            dx = v1x + v2x;
            dy = v1y + v2y;
        }
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) continue;

        const nx = -dy / dist;
        const ny = dx / dist;

        leftPoints.push({ x: current.x + nx * radius, y: current.y + ny * radius });
        rightPoints.push({ x: current.x - nx * radius, y: current.y - ny * radius });
    }

    if (leftPoints.length < 2 || rightPoints.length < 2) return;

    targetCtx.beginPath();
    
    targetCtx.moveTo(rightPoints[0].x, rightPoints[0].y);

    if (isLeg) {
        for (let i = 1; i < rightPoints.length; i++) {
            targetCtx.lineTo(rightPoints[i].x, rightPoints[i].y);
        }
    } else {
        for (let i = 1; i < rightPoints.length; i++) {
            const prev = rightPoints[i-1];
            const current = rightPoints[i];
            const midX = (prev.x + current.x) / 2;
            const midY = (prev.y + current.y) / 2;
            targetCtx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
        targetCtx.lineTo(rightPoints[rightPoints.length - 1].x, rightPoints[rightPoints.length - 1].y);
    }

    if (closeEnd) {
        const last = points[points.length - 1];
        const lastR = rightPoints[rightPoints.length - 1];
        const lastL = leftPoints[leftPoints.length - 1];
        const angleR = Math.atan2(lastR.y - last.y, lastR.x - last.x);
        const angleL = Math.atan2(lastL.y - last.y, lastL.x - last.x);
        targetCtx.arc(last.x, last.y, radii[radii.length-1], angleR, angleL, false);
    }

    if(isLeg) {
        for (let i = leftPoints.length - 2; i >= 0; i--) {
            targetCtx.lineTo(leftPoints[i].x, leftPoints[i].y);
        }
    } else {
        for (let i = leftPoints.length - 2; i >= 0; i--) {
            const prev = leftPoints[i+1];
            const current = leftPoints[i];
            const midX = (prev.x + current.x) / 2;
            const midY = (prev.y + current.y) / 2;
            targetCtx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
    }
    targetCtx.lineTo(leftPoints[0].x, leftPoints[0].y);

    if (closeStart) {
        const first = points[0];
        const firstL = leftPoints[0];
        const firstR = rightPoints[0];

        // Head is an ellipse
        if (first === player && 'radiusX' in first) {
            const orientation = getSegmentOrientation(0);
            // This is complex to get the arc right, so we draw a full ellipse and rely on layering
            // to hide the back. A better approach is needed for perfect seam.
            // For now, let's just draw the cap as an arc based on average radius
             const avgRadius = (first.radiusX + first.radiusY) / 2;
             const angleL0 = Math.atan2(firstL.y - first.y, firstL.x - first.x);
             const angleR0 = Math.atan2(firstR.y - first.y, firstR.x - first.x);
             targetCtx.arc(first.x, first.y, radii[0], angleL0, angleR0, false);
        } else {
            const angleL0 = Math.atan2(firstL.y - first.y, firstL.x - first.x);
            const angleR0 = Math.atan2(firstR.y - first.y, firstR.x - first.x);
            targetCtx.arc(first.x, first.y, radii[0], angleL0, angleR0, false);
        }
    }
    
    targetCtx.closePath();

    // Handle patterns
    let fillStyle = style.bodyColor;
    if (style.pattern === 'gradient' && points.length > 1) {
        const start = points[0];
        const end = points[points.length - 1];
        const gradient = targetCtx.createLinearGradient(start.x, start.y, end.x, end.y);
        gradient.addColorStop(0, style.bodyColor);
        gradient.addColorStop(1, style.patternColor2);
        fillStyle = gradient;
    }
    
    targetCtx.fillStyle = fillStyle;
    targetCtx.fill();

    if (style.pattern === 'stripes') {
        targetCtx.save();
        targetCtx.clip(); // Use the body shape as a mask
        targetCtx.lineWidth = 10;
        targetCtx.strokeStyle = style.patternColor2;
        targetCtx.beginPath();
        
        // Find bounding box to draw lines across
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });

        const orientation = getSegmentOrientation(Math.floor(points.length / 2));
        const angle = orientation.angle + Math.PI / 2;
        
        const length = Math.sqrt(Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2)) * 1.5;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        for (let i = -length / 2; i < length / 2; i += 20) {
            const x1 = centerX + Math.cos(angle) * length/2 + Math.cos(angle - Math.PI/2) * i;
            const y1 = centerY + Math.sin(angle) * length/2 + Math.sin(angle - Math.PI/2) * i;
            const x2 = centerX - Math.cos(angle) * length/2 + Math.cos(angle - Math.PI/2) * i;
            const y2 = centerY - Math.sin(angle) * length/2 + Math.sin(angle - Math.PI/2) * i;
            targetCtx.moveTo(x1, y1);
            targetCtx.lineTo(x2, y2);
        }
        targetCtx.stroke();
        targetCtx.restore();
    }


    if (style.hasOutline && (gameState === 'playing' || isCircleView)) {
        targetCtx.lineWidth = style.outlineWidth;
        targetCtx.strokeStyle = style.outlineColor;
        targetCtx.stroke();
    }
}


function drawLegs(targetCtx) {
    if (bodyProperties.legs.length === 0) return;

    const animationAmplitude = Math.PI / 6; // How much the legs swing
    const kneeBendAmplitude = Math.PI / 5;

    const legStyle = {
        bodyColor: bodyProperties.bodyColor,
        hasOutline: bodyProperties.hasOutline,
        outlineColor: bodyProperties.outlineColor,
        outlineWidth: bodyProperties.outlineWidth
    };

    bodyProperties.legs.forEach((leg, legPairIndex) => {
        const segment = chain[leg.segmentIndex];
        if (!segment) return;

        const orientation = getSegmentOrientation(leg.segmentIndex);
        
        const phaseIncrementPerPair = Math.PI / 4;
        const basePhase = legAnimationPhase + (leg.phaseOffset || 0) + legPairIndex * phaseIncrementPerPair;

        // --- Right Leg (alternates first based on pair index) ---
        const rightPhase = basePhase + (legPairIndex % 2 === 0 ? 0 : Math.PI);
        const rightSwingAngle = Math.sin(rightPhase) * animationAmplitude;
        const rightKneeBend = (Math.cos(rightPhase) + 1) / 2 * kneeBendAmplitude;

        // --- Left Leg (always opposite of its pair's right leg) ---
        const leftPhase = rightPhase + Math.PI;
        const leftSwingAngle = Math.sin(leftPhase) * animationAmplitude;
        const leftKneeBend = (Math.cos(leftPhase) + 1) / 2 * kneeBendAmplitude;

        // Attachment points on the side of the circle
        const attachRadius = segment.auraRadius * 0.75; // Attach inside the aura
        const rightAttachX = segment.x + orientation.perpX * attachRadius;
        const rightAttachY = segment.y + orientation.perpY * attachRadius;
        const leftAttachX = segment.x - orientation.perpX * attachRadius;
        const leftAttachY = segment.y - orientation.perpY * attachRadius;

        // --- Right Leg Geometry ---
        const rightThighAngle = orientation.angle + leg.baseAngle + rightSwingAngle;
        const rightKneeX = rightAttachX + Math.cos(rightThighAngle) * leg.length1;
        const rightKneeY = rightAttachY + Math.sin(rightThighAngle) * leg.length1;
        
        const rightCalfAngle = rightThighAngle - rightKneeBend;
        const rightFootX = rightKneeX + Math.cos(rightCalfAngle) * leg.length2;
        const rightFootY = rightKneeY + Math.sin(rightCalfAngle) * leg.length2;
        
        const rightLegPoints = [ {x: rightAttachX, y: rightAttachY}, {x: rightKneeX, y: rightKneeY}, {x: rightFootX, y: rightFootY} ];
        const rightLegRadii = [ leg.width1 / 2, leg.width2 / 2, leg.width2 / 2 ];
        drawParametricShape(targetCtx, rightLegPoints, rightLegRadii, legStyle, false, true, true);


        // --- Left Leg Geometry ---
        const leftThighAngle = orientation.angle - leg.baseAngle - leftSwingAngle;
        const leftKneeX = leftAttachX + Math.cos(leftThighAngle) * leg.length1;
        const leftKneeY = leftAttachY + Math.sin(leftThighAngle) * leg.length1;

        const leftCalfAngle = leftThighAngle + leftKneeBend;
        const leftFootX = leftKneeX + Math.cos(leftCalfAngle) * leg.length2;
        const leftFootY = leftKneeY + Math.sin(leftCalfAngle) * leg.length2;

        const leftLegPoints = [ {x: leftAttachX, y: leftAttachY}, {x: leftKneeX, y: leftKneeY}, {x: leftFootX, y: leftFootY} ];
        const leftLegRadii = [ leg.width1 / 2, leg.width2 / 2, leg.width2 / 2 ];
        drawParametricShape(targetCtx, leftLegPoints, leftLegRadii, legStyle, false, true, true);
    });
}


function drawParametricBody(targetCtx) {
    const radii = chain.map(s => {
        if (s === player && 'radiusX' in s) {
            return (s.radiusX + s.radiusY) / 2; // Use average for tangent calculation
        }
        return isCircleView ? s.auraRadius : s.radius + 2;
    });

    const bodyStyle = {
        bodyColor: bodyProperties.bodyColor,
        hasOutline: bodyProperties.hasOutline,
        outlineColor: bodyProperties.outlineColor,
        outlineWidth: bodyProperties.outlineWidth,
        pattern: bodyProperties.pattern,
        patternColor2: bodyProperties.patternColor2
    };

    if (chain.length > 1) {
        drawParametricShape(targetCtx, chain, radii, bodyStyle, true, true, false);
    } else { // Handle single segment case
        const head = chain[0];
        const orientation = getSegmentOrientation(0);
        
        targetCtx.fillStyle = bodyStyle.bodyColor;
        targetCtx.beginPath();
        targetCtx.ellipse(head.x, head.y, head.radiusX, head.radiusY, orientation.angle - Math.PI/2, 0, Math.PI * 2);
        
        targetCtx.fill();
        if(bodyStyle.hasOutline){
            targetCtx.strokeStyle = bodyStyle.outlineColor;
            targetCtx.lineWidth = bodyStyle.outlineWidth;
            targetCtx.stroke();
        }
    }
}

function drawDashVFX(targetCtx) {
    dashParticles.forEach((p, index) => {
        p.life--;
        if (p.life <= 0) {
            dashParticles.splice(index, 1);
            return;
        }
        targetCtx.beginPath();
        const alpha = p.life / 20;
        targetCtx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        targetCtx.arc(p.x, p.y, p.radius * (1 - alpha), 0, Math.PI * 2);
        targetCtx.fill();
    });
}


function draw(targetCtx, targetWidth, targetHeight) {
    targetCtx.save();
    targetCtx.clearRect(0, 0, targetWidth, targetHeight);

    if (gameState === 'editing') {
        targetCtx.translate(targetWidth / 2, targetHeight / 2);
        targetCtx.translate(editorCamera.x, editorCamera.y);
        targetCtx.scale(editorCamera.zoom, editorCamera.zoom);
        targetCtx.translate(-targetWidth / 2, -targetHeight / 2);
    }

    // Draw dash VFX behind everything
    if (gameState === 'playing') {
        drawDashVFX(targetCtx);
    }


    // Draw legs behind the body
    drawLegs(targetCtx);

    // Draw the parametric body first
    drawParametricBody(targetCtx);

    // In circle view, the "body" is the parametric shape.
    if (isCircleView) {
        // Only the parametric body and eyes are drawn in this mode.
        // The core points and connecting lines are hidden.

        // Draw eyes
        const head = chain[0];
        const neck = chain[1] || null; // Fix: handle case with only one segment

        // Vector from head to neck (points "backwards")
        let dx, dy;
        if(neck) {
            dx = neck.x - head.x;
            dy = neck.y - head.y;
        } else { // fallback if no neck
            dx = player.vx;
            dy = player.vy;
        }
        
        // Fallback to mouse direction if segments are stacked
        if (dx === 0 && dy === 0) {
            dx = mouse.x - head.x;
            dy = mouse.y - head.y;
        }

        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        // Normalized "forward" vector (opposite of head-to-neck)
        const fwdX = -dx / dist;
        const fwdY = -dy / dist;

        // Perpendicular vector for eye separation
        const perpX = -fwdY;
        const perpY = fwdX;

        const eyeRadius = bodyProperties.eyeRadius;
        const eyeForwardOffset = head.auraRadius * bodyProperties.eyeForwardOffset;
        const eyeSideOffset = head.auraRadius * bodyProperties.eyeSideOffset;

        const eye1X = head.x + fwdX * eyeForwardOffset + perpX * eyeSideOffset;
        const eye1Y = head.y + fwdY * eyeForwardOffset + perpY * eyeSideOffset;

        const eye2X = head.x + fwdX * eyeForwardOffset - perpX * eyeSideOffset;
        const eye2Y = head.y + fwdY * eyeForwardOffset - perpY * eyeSideOffset;

        targetCtx.fillStyle = 'black';
        targetCtx.beginPath();
        targetCtx.arc(eye1X, eye1Y, eyeRadius, 0, Math.PI * 2);
        targetCtx.fill();

        targetCtx.beginPath();
        targetCtx.arc(eye2X, eye2Y, eyeRadius, 0, Math.PI * 2);
        targetCtx.fill();
        
    } else { // In point view, the original elements are drawn on top of the white body
        // Draw chain connections
        targetCtx.beginPath();
        targetCtx.moveTo(chain[0].x, chain[0].y);
        for (let i = 1; i < chain.length; i++) {
            targetCtx.lineTo(chain[i].x, chain[i].y);
        }
        targetCtx.strokeStyle = 'black';
        targetCtx.lineWidth = 2;
        targetCtx.stroke();

        // Draw the chain circles
        for (const segment of chain) {
            targetCtx.beginPath();
            targetCtx.arc(segment.x, segment.y, segment.radius, 0, Math.PI * 2);
            targetCtx.fillStyle = 'black';
            targetCtx.fill();
        }
    }

    if (gameState === 'playing') {
        // Draw the aiming line on top of everything
        targetCtx.beginPath();
        targetCtx.moveTo(player.x, player.y);
        targetCtx.lineTo(mouse.x, mouse.y);
        targetCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        targetCtx.lineWidth = 1;
        targetCtx.stroke();
    }


    if (gameState === 'editing') {
        // Draw aura circles for editing
        targetCtx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
        targetCtx.lineWidth = 2;
        for (const segment of chain) {
            targetCtx.beginPath();
            targetCtx.arc(segment.x, segment.y, segment.auraRadius, 0, Math.PI * 2);
            targetCtx.stroke();
        }
        // Highlight selected segment
        if (selectedSegment) {
            targetCtx.strokeStyle = 'rgba(255, 255, 0, 0.9)';
            targetCtx.lineWidth = 3;
            targetCtx.beginPath();
            targetCtx.arc(selectedSegment.x, selectedSegment.y, selectedSegment.auraRadius, 0, Math.PI * 2);
            targetCtx.stroke();
        }
    }

    targetCtx.restore();
}

function gameLoop() {
    if (window.__RUN_PROCEDURAL__) return; // disable old loop if procedural mode active
    if (gameState === 'playing') {
        updatePlayer();
        updateConstraints();
        draw(ctx, width, height);
    } else { // 'editing'
        // In editor mode, physics is paused, but constraints are active
        // unless a segment is being dragged.
        const isDragging = selectedSegment && editorCanvas.matches(':active');
        if(!isDragging) {
            updateConstraints();
        }
        draw(editorCtx, editorWidth, editorHeight);
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();