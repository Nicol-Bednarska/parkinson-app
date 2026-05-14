// === GET DOM ELEMENTS ===
const screens = {
    home: document.getElementById('screen-home'),
    instructions: document.getElementById('screen-instructions'),
    recording: document.getElementById('screen-recording'),
    result: document.getElementById('screen-result'),
    stats: document.getElementById('screen-stats')
};

const beginTestBtn = document.getElementById('beginTestBtn');
const countdownNumber = document.getElementById('countdownNumber');
const resultDisplay = document.getElementById('resultDisplay');
const moodChips = document.querySelectorAll('.mood-chip');
const moodFeedback = document.getElementById('moodFeedback');
const saveResultBtn = document.getElementById('saveResultBtn');

// === CONFIGURATION ===
const TEST_DURATION_SECONDS = 10;
const STORAGE_KEY = 'tremor_history';

// === STATE ===
let motionData = [];
let isTestRunning = false;
let lastResult = null;
let selectedMood = null;

// === MOOD FEEDBACK MESSAGES ===
const moodMessages = {
    calm: "Wonderful — staying calm helps your body and mind.",
    good: "Great to hear! Keep up your routine.",
    stressed: "Don't worry — take a deep breath. You've got this.",
    tired: "Rest is important. Be kind to yourself today.",
    down: "Tough days happen. Tomorrow brings new energy."
};

// === SCREEN NAVIGATION ===
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    if (name === 'stats') showStats();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        showScreen(target);
    });
});

// === HELPERS ===
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showResult(level, label) {
    resultDisplay.className = 'result-display ' + level;

    let icon = '';
    let description = '';
    if (level === 'mild') {
        icon = '🟢';
        description = 'Your hands are steady today.<br>Keep up your routine!';
    } else if (level === 'moderate') {
        icon = '🟡';
        description = 'Some shaking detected today.<br>Be gentle with yourself.';
    } else if (level === 'strong') {
        icon = '🔴';
        description = 'More noticeable shaking today.<br>Take it slow and rest.';
    }

    resultDisplay.innerHTML = `
        <div class="icon">${icon}</div>
        <div class="label">${label}</div>
        <div class="description">${description}</div>
    `;
}

function resetMoodSelection() {
    selectedMood = null;
    moodChips.forEach(c => c.classList.remove('selected'));
    moodFeedback.classList.remove('visible');
    moodFeedback.textContent = '';
}

// === MOOD SELECTION ===
moodChips.forEach(chip => {
    chip.addEventListener('click', () => {
        moodChips.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedMood = chip.getAttribute('data-mood');

        // Show short feedback message
        moodFeedback.textContent = moodMessages[selectedMood];
        moodFeedback.classList.add('visible');
    });
});

// === SAVE RESULT ===
function saveResult() {
    if (!lastResult) {
        showScreen('home');
        return;
    }

    const entry = {
        timestamp: new Date().toISOString(),
        level: lastResult.level,
        label: lastResult.label,
        mood: selectedMood
    };

    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    history.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

    resetMoodSelection();
    lastResult = null;
    showScreen('home');
}

saveResultBtn.addEventListener('click', saveResult);

// === MOTION HANDLING ===
function handleMotion(event) {
    if (!isTestRunning) return;
    const acc = event.accelerationIncludingGravity;
    if (acc && acc.x !== null) {
        motionData.push({
            x: acc.x, y: acc.y, z: acc.z,
            timestamp: Date.now()
        });
    }
}

async function requestMotionPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const response = await DeviceMotionEvent.requestPermission();
            return response === 'granted';
        } catch (err) {
            console.error('Permission request failed:', err);
            return false;
        }
    }
    return true;
}

// === MAIN TEST FLOW ===
async function runTest() {
    if (isTestRunning) return;

    const permitted = await requestMotionPermission();
    if (!permitted) {
        showScreen('result');
        showResult('mild', 'Permission denied');
        return;
    }

    showScreen('recording');

    motionData = [];
    isTestRunning = true;
    window.addEventListener('devicemotion', handleMotion);

    for (let i = TEST_DURATION_SECONDS; i > 0; i--) {
        countdownNumber.textContent = i;
        await sleep(1000);
    }

    window.removeEventListener('devicemotion', handleMotion);
    isTestRunning = false;

    const result = analyzeMotion(motionData);
    lastResult = result;

    resetMoodSelection();
    showScreen('result');
    showResult(result.level, result.label);
}

beginTestBtn.addEventListener('click', runTest);

// ============================================================
// === STATISTICS =============================================
// ============================================================
function showStats() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

    // Calculate current week (Monday to Sunday)
    const now = new Date();
    const weekStart = new Date(now);
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    // Filter to this week
    const thisWeek = history.filter(entry => {
        const date = new Date(entry.timestamp);
        return date >= weekStart && date < weekEnd;
    });

    // Date range
    const fmt = { month: 'short', day: 'numeric' };
    const start = weekStart.toLocaleDateString('en-US', fmt);
    const end = new Date(weekEnd - 1).toLocaleDateString('en-US', fmt);
    document.getElementById('dateRange').textContent = `${start} – ${end}`;

    // Total tests
    document.getElementById('totalTests').textContent = thisWeek.length;

    // Bar chart by day
    renderBarChart(weekStart, thisWeek);

    // Mood stats
    renderMoodStats(thisWeek);
}

function renderBarChart(weekStart, weekTests) {
    const barChart = document.getElementById('barChart');
    barChart.innerHTML = '';

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Group tests by day index (0=Monday)
    const byDay = [[], [], [], [], [], [], []];
    weekTests.forEach(entry => {
        const date = new Date(entry.timestamp);
        const dayIdx = Math.floor((date - weekStart) / (1000 * 60 * 60 * 24));
        if (dayIdx >= 0 && dayIdx < 7) {
            byDay[dayIdx].push(entry);
        }
    });

    const maxCount = Math.max(1, ...byDay.map(d => d.length));

    byDay.forEach((dayTests, idx) => {
        const col = document.createElement('div');
        col.className = 'bar-column';

        if (dayTests.length > 0) {
            // Predominant level for the day
            const counts = { mild: 0, moderate: 0, strong: 0 };
            dayTests.forEach(t => { counts[t.level]++; });
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

            const bar = document.createElement('div');
            bar.className = 'bar ' + top;
            bar.style.height = `${(dayTests.length / maxCount) * 100}%`;
            col.appendChild(bar);
        } else {
            const dot = document.createElement('div');
            dot.className = 'bar-empty';
            col.appendChild(dot);
        }

        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = dayLabels[idx];
        col.appendChild(label);

        barChart.appendChild(col);
    });
}

function renderMoodStats(weekTests) {
    const moodLabels = {
        calm:     { emoji: '😌', name: 'Calm' },
        good:     { emoji: '🙂', name: 'Good' },
        stressed: { emoji: '😟', name: 'Stressed' },
        tired:    { emoji: '😴', name: 'Tired' },
        down:     { emoji: '😔', name: 'Down' }
    };

    const moodCounts = { calm: 0, good: 0, stressed: 0, tired: 0, down: 0 };
    weekTests.forEach(t => {
        if (t.mood && moodCounts.hasOwnProperty(t.mood)) {
            moodCounts[t.mood]++;
        }
    });

    const max = Math.max(1, ...Object.values(moodCounts));

    const container = document.getElementById('moodStats');
    container.innerHTML = '';

    Object.entries(moodCounts).forEach(([key, count]) => {
        const row = document.createElement('div');
        row.className = 'mood-row';
        row.innerHTML = `
            <span class="mood-row-emoji">${moodLabels[key].emoji}</span>
            <span class="mood-row-name">${moodLabels[key].name}</span>
            <div class="mood-row-bar">
                <div class="mood-row-fill" style="width: ${(count/max)*100}%"></div>
            </div>
            <span class="mood-row-count">${count}</span>
        `;
        container.appendChild(row);
    });
}

// ============================================================
// === EDGE IMPULSE MODEL =====================================
// ============================================================

// Model configuration (matches your Edge Impulse training)
const MODEL_WINDOW_SECONDS = 2;
const MODEL_FREQUENCY_HZ = 62.5;
const EXPECTED_FEATURES = Math.round(MODEL_WINDOW_SECONDS * MODEL_FREQUENCY_HZ * 3); // 375

let classifier = null;
let classifierReady = false;

async function initClassifier() {
    try {
        classifier = new EdgeImpulseClassifier();
        await classifier.init();
        classifierReady = true;
        console.log('Edge Impulse model loaded:', classifier.getProjectInfo());
    } catch (err) {
        console.error('Failed to load Edge Impulse model:', err);
    }
}

initClassifier();

function analyzeMotion(data) {
    if (!classifierReady) {
        return { level: 'mild', label: 'Model loading...' };
    }
    if (data.length === 0) {
        return { level: 'mild', label: 'No motion data' };
    }

    // Take the LAST 2 seconds of recorded data (most stable)
    const samplesNeeded = Math.round(MODEL_WINDOW_SECONDS * MODEL_FREQUENCY_HZ);
    const sliceStart = Math.max(0, data.length - samplesNeeded);
    const slice = data.slice(sliceStart);

    // Flatten to [x1, y1, z1, x2, y2, z2, ...]
    let features = [];
    for (const sample of slice) {
        features.push(sample.x, sample.y, sample.z);
    }

    // Trim or pad to exact expected size
    if (features.length > EXPECTED_FEATURES) {
        features = features.slice(0, EXPECTED_FEATURES);
    }
    while (features.length < EXPECTED_FEATURES) {
        features.push(0);
    }

    console.log(`Classifying ${features.length} features (expected ${EXPECTED_FEATURES})`);

    try {
        const result = classifier.classify(features);
        console.log('Classification result:', result);

        // Find label with highest probability
        const top = result.results.reduce((a, b) =>
            a.value > b.value ? a : b
        );

        // Map Edge Impulse labels to UI levels
        const labelMap = {
            'normal rest state': { level: 'mild',     label: 'No tremor detected' },
            '1 stage':           { level: 'mild',     label: 'Stage 1 tremor' },
            '2 stage':           { level: 'moderate', label: 'Stage 2 tremor' },
            '3 stage':           { level: 'strong',   label: 'Stage 3 tremor' }
        };

        return labelMap[top.label] || {
            level: 'mild',
            label: top.label
        };
    } catch (err) {
        console.error('Classification error:', err);
        return { level: 'mild', label: 'Analysis error' };
    }
}