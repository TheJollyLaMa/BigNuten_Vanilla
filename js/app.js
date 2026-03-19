import { initDnftPayPalPurchase, listDecentEscrowPlans, createDecentEscrowPlan, deactivateDecentEscrowPlan } from './subscription.js';
import { displayProposals, createProposal, isProposer, isAdmin, getBnutBalance, addProposer, removeProposer, mintBnutToAddress } from './governance.js';
import { loadPayrollQueue, getTreasuryBalance, isTreasuryOwner, settlePayroll } from './treasury.js';

// --- Raw Food Modal Logic ---
document.addEventListener('DOMContentLoaded', () => {
  // Initialise DNFT PayPal one-time purchase form (wallet validation + PayPal submit)
  initDnftPayPalPurchase();

  const dietButton = document.getElementById('dietButton');
  const rawFoodModal = document.getElementById('rawFoodModal');
  const closeRawFoodModal = document.getElementById('closeRawFoodModal');
  if (dietButton && rawFoodModal) {
    dietButton.addEventListener('click', () => {
      rawFoodModal.style.display = 'block';
    });
  }
  if (closeRawFoodModal && rawFoodModal) {
    closeRawFoodModal.addEventListener('click', () => {
      rawFoodModal.style.display = 'none';
    });
  }
  // Hide modal if clicking outside modal-content
  window.addEventListener('click', function (event) {
    if (rawFoodModal && event.target === rawFoodModal) {
      rawFoodModal.style.display = 'none';
    }
  });
});
// --- Moon & Sun Modal Logic ---
const TITHI_NAMES = [
  'Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadasi', 'Dvadashi', 'Trayodashi', 'Chaturdashi', 'Purnima',
  'Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadasi', 'Dvadashi', 'Trayodashi', 'Chaturdashi', 'Amavasya'
];

// 24 named Ekadasis in a yearly cycle, starting from Kamada (Chaitra Shukla),
// the first Ekadasi after the base new moon of April 8 2024.
const EKADASI_BASE = 'http://www.iskcondesiretree.net/page/';
const EKADASI_CYCLE = [
  { name: 'Kamada',            url: EKADASI_BASE + 'kamada-ekadasi' },
  { name: 'Varuthini',         url: EKADASI_BASE + 'varuthini-ekadasi' },
  { name: 'Mohini',            url: EKADASI_BASE + 'mohini-ekadasi' },
  { name: 'Apara',             url: EKADASI_BASE + 'apara-ekadasi' },
  { name: 'Pandava Nirjala',   url: EKADASI_BASE + 'pandava-nirjala-ekadasi' },
  { name: 'Yogini',            url: EKADASI_BASE + 'yogini-ekadasi' },
  { name: 'Sayana',            url: EKADASI_BASE + 'sayana-ekadasi' },
  { name: 'Kamika',            url: EKADASI_BASE + 'kamika-ekadasi' },
  { name: 'Pavitropana',       url: EKADASI_BASE + 'pavitropana-ekadasi' },
  { name: 'Aja - Annada',      url: EKADASI_BASE + 'aja-annada-ekadasi' },
  { name: 'Parsva',            url: EKADASI_BASE + 'parsva-ekadasi' },
  { name: 'Indira',            url: EKADASI_BASE + 'indira-ekadasi' },
  { name: 'Papankusha',        url: EKADASI_BASE + 'papankusha-ekadasi' },
  { name: 'Rama',              url: EKADASI_BASE + 'rama-ekadasi' },
  { name: 'Utthana',           url: EKADASI_BASE + 'utthana-ekadasi' },
  { name: 'Utpanna',           url: EKADASI_BASE + 'utpanna-ekadasi' },
  { name: 'Mokshada',          url: EKADASI_BASE + 'mokshada-ekadasi' },
  { name: 'Saphala',           url: EKADASI_BASE + 'saphala-ekadasi' },
  { name: 'Putrada',           url: EKADASI_BASE + 'putrada-ekadasi' },
  { name: 'Sat-Tila',          url: EKADASI_BASE + 'sattila-ekadasi' },
  { name: 'Bhaimi',            url: EKADASI_BASE + 'bhaimi-ekadasi' },
  { name: 'Vaikuntha',         url: EKADASI_BASE + 'vaikuntha-ekadasi' },
  { name: 'Amalaki',           url: EKADASI_BASE + 'amalaki-ekadasi' },
  { name: 'Papamochani',       url: EKADASI_BASE + 'papamochani-ekadasi' },
];

// Calculate Tithi (1–30) and raw moon age (days since new moon) using the
// proper synodic month duration.
// Base: April 8 2024 18:21 UTC — total solar eclipse (verified new moon).
// Follows the panchang convention: the tithi at local sunrise defines the whole
// day, so we anchor on 6 AM local time rather than the current instant.
// This prevents the tithi from flipping mid-day when a boundary falls during
// waking hours (e.g. Ekadasi → Dvadashi at 9:30 AM).
function calculateTithi() {
  const newMoonBase = new Date('2024-04-08T18:21:00Z');
  const synodicMonth = 29.530588853; // days
  const now = new Date();
  // Construct 6 AM local time. This is called at most a handful of times per
  // page load plus once/hour in setInterval, so the allocation cost is trivial.
  const sunrise = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0);
  const diffDays = (sunrise.getTime() - newMoonBase.getTime()) / 86400000;
  const lunation = Math.floor(diffDays / synodicMonth); // full lunations since base
  const cyclePos = ((diffDays % synodicMonth) + synodicMonth) % synodicMonth;
  const tithi = Math.min(Math.floor(cyclePos / (synodicMonth / 30)) + 1, 30);
  const moonAge = Math.floor(cyclePos); // simple 0-indexed days from new moon
  return { tithi, moonAge, lunation };
}

// Return a status message and highlight colour for Ekadasi-adjacent tithis.
function getEkadasiStatus(tithi) {
  if (tithi === 11 || tithi === 26) {
    const paksha = tithi === 11 ? 'Shukla' : 'Krishna';
    return {
      message: `🙏 Today is ${paksha} Ekadasi — Observe your fast. Break fast tomorrow after sunrise.`,
      color: '#00ccff'
    };
  }
  if (tithi === 10 || tithi === 25) {
    const nextPaksha = tithi === 10 ? 'Shukla' : 'Krishna';
    return {
      message: `⚠️ Tomorrow is ${nextPaksha} Ekadasi — Prepare for your fast!`,
      color: '#ffd700'
    };
  }
  if (tithi === 12 || tithi === 27) {
    const paksha = tithi === 12 ? 'Shukla' : 'Krishna';
    return {
      message: `🌅 Today is ${paksha} Dvadashi — Break your Ekadasi fast after sunrise.`,
      color: '#90ee90'
    };
  }
  return { message: '', color: '' };
}

// Send a one-time browser notification for Ekadasi / Dashami days.
// Uses localStorage to avoid sending duplicate notifications on the same day.
function sendEkadasiNotification(tithi) {
  if (!('Notification' in window)) return;
  let title, body;
  if (tithi === 10 || tithi === 25) {
    title = '🌙 Ekadasi Tomorrow';
    body = `Tomorrow is ${tithi === 10 ? 'Shukla' : 'Krishna'} Ekadasi. Prepare for your fast!`;
  } else if (tithi === 11 || tithi === 26) {
    title = '🙏 Ekadasi Today';
    body = `Today is ${tithi === 11 ? 'Shukla' : 'Krishna'} Ekadasi. Observe your fast and break it tomorrow after sunrise.`;
  } else {
    return;
  }
  const today = new Date().toDateString();
  const lastKey = 'ekadasi_last_notif';
  try {
    const last = JSON.parse(localStorage.getItem(lastKey) || '{}');
    if (last.tithi === tithi && last.date === today) return; // already notified today
  } catch (_) { /* ignore parse errors */ }
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      new Notification(title, { body, icon: 'img/BigNuten.png' });
      try { localStorage.setItem(lastKey, JSON.stringify({ tithi, date: today })); } catch (_) {}
    }
  });
}

// Return info about the previous, current, and next Ekadasi in the named cycle.
// The 24-name cycle starts with Kamada Ekadasi (Chaitra Shukla), the first
// Ekadasi after the base new moon of April 8 2024.
function getEkadasiCycleInfo() {
  const { tithi, lunation } = calculateTithi();
  // Map a sequential Ekadasi index to a cycle entry (wraps every 24).
  const lookup = (idx) => {
    const i = ((idx % 24) + 24) % 24;
    return EKADASI_CYCLE[i];
  };
  // Each lunation contains two Ekadasis:
  //   Shukla Ekadasi (tithi 11) → sequential index 2*lunation
  //   Krishna Ekadasi (tithi 26) → sequential index 2*lunation + 1
  let prevIdx, currIdx, nextIdx;
  if (tithi === 11) {
    currIdx = 2 * lunation;
    prevIdx = currIdx - 1;
    nextIdx = currIdx + 1;
  } else if (tithi === 26) {
    currIdx = 2 * lunation + 1;
    prevIdx = currIdx - 1;
    nextIdx = currIdx + 1;
  } else if (tithi < 11) {
    prevIdx = 2 * lunation - 1;
    currIdx = null;
    nextIdx = 2 * lunation;
  } else if (tithi < 26) {
    prevIdx = 2 * lunation;
    currIdx = null;
    nextIdx = 2 * lunation + 1;
  } else {
    prevIdx = 2 * lunation + 1;
    currIdx = null;
    nextIdx = 2 * (lunation + 1);
  }
  return {
    prev: lookup(prevIdx),
    current: currIdx !== null ? lookup(currIdx) : null,
    next: lookup(nextIdx),
  };
}

function updateMoonSunModal(tithiDay, moonAge, sunDay, lat, lng) {
  const moonInfo = document.getElementById('moon-info');
  const locationInfo = document.getElementById('location-info');
  const ekadasiInfo = document.getElementById('ekadasi-info');
  const ekadasiLinks = document.getElementById('ekadasi-links');
  const tithiName = TITHI_NAMES[tithiDay - 1] || '';
  const paksha = tithiDay <= 15 ? 'Shukla' : 'Krishna';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const sunDayName = dayNames[sunDay] || sunDay;
  if (moonInfo) {
    moonInfo.textContent = `🌓 Moon Day: ${moonAge} — ${paksha} ${tithiName} | ☀️ Sun Day: ${sunDayName}`;
  }
  if (locationInfo) {
    locationInfo.textContent = lat && lng ? `📍 Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}` : '📍 Location not linked';
  }
  if (ekadasiInfo) {
    const status = getEkadasiStatus(tithiDay);
    ekadasiInfo.textContent = status.message;
    ekadasiInfo.style.color = status.color;
    // Hide the ekadasi-info card when there's no message
    const card = document.getElementById('ekadasi-info-card');
    if (card) card.style.display = status.message ? '' : 'none';
  }
  if (ekadasiLinks) {
    const cycle = getEkadasiCycleInfo();
    ekadasiLinks.innerHTML = '';

    // Helper: create a styled external link element.
    const makeLink = (text, url) => {
      const a = document.createElement('a');
      a.textContent = text;
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return a;
    };

    // Highlight the current Ekadasi (if today is Ekadasi) or the upcoming one.
    const isFastingDay = cycle.current !== null;
    const featured = isFastingDay ? cycle.current : cycle.next;
    if (featured) {
      const featuredCard = document.createElement('div');
      featuredCard.className = 'ekadasi-featured';

      const nameEl = document.createElement('p');
      nameEl.className = 'ekadasi-featured-name';
      const label = isFastingDay ? '🙏 Today: ' : '⏭️ Upcoming: ';
      nameEl.textContent = `${label}${featured.name} Ekadasi`;
      featuredCard.appendChild(nameEl);

      const storyEl = document.createElement('p');
      storyEl.className = 'ekadasi-story-link';
      storyEl.appendChild(makeLink('📖 Read the Story', featured.url));
      featuredCard.appendChild(storyEl);

      ekadasiLinks.appendChild(featuredCard);
    }

    // Previous / Next story links.
    // The next link is omitted when cycle.next is already shown as featured
    // (i.e. when today is not an Ekadasi day and the next Ekadasi is featured above).
    const navEl = document.createElement('div');
    navEl.className = 'ekadasi-nav';
    if (cycle.prev) {
      const prevSpan = document.createElement('span');
      prevSpan.appendChild(document.createTextNode('◀ '));
      prevSpan.appendChild(makeLink(`${cycle.prev.name} Ekadasi`, cycle.prev.url));
      navEl.appendChild(prevSpan);
    }
    // Only show the next link when it hasn't already been featured above.
    if (cycle.next && isFastingDay) {
      const nextSpan = document.createElement('span');
      nextSpan.appendChild(makeLink(`${cycle.next.name} Ekadasi`, cycle.next.url));
      nextSpan.appendChild(document.createTextNode(' ▶'));
      navEl.appendChild(nextSpan);
    }
    if (navEl.hasChildNodes()) ekadasiLinks.appendChild(navEl);

    // About Ekadasi link.
    const aboutEl = document.createElement('p');
    aboutEl.className = 'ekadasi-about';
    aboutEl.appendChild(makeLink('ℹ️ About Ekadasi', 'http://www.iskcondesiretree.net/page/who-is-ekadasi'));
    ekadasiLinks.appendChild(aboutEl);
  }
}

// --- Moon & Sun Location Request Logic ---
function requestLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const { tithi, moonAge } = calculateTithi();
      const sunDay = new Date().getDay(); // 0 = Sunday … 6 = Saturday
      updateMoonSunModal(tithi, moonAge, sunDay, lat, lng);
      sendEkadasiNotification(tithi);
    }, () => {
      alert("Location access denied.");
    });
  }
}

// Initialize moon modal with dummy values
window.addEventListener('DOMContentLoaded', () => {
  // --- Emotion Wheel Overlay SVG Slices ---
  const overlaySVG = document.getElementById('emotionWheelOverlaySVG');
  const center = 300;
  const radius = 290;
  const emotions = ['Surprised', 'Bad', 'Fearful', 'Angry', 'Disgusted', 'Sad', 'Happy'];
  const sliceCount = emotions.length;

  for (let i = 0; i < sliceCount; i++) {
    const angleStart = (2 * Math.PI * i) / sliceCount;
    const angleEnd = (2 * Math.PI * (i + 1)) / sliceCount;
    const x1 = center + radius * Math.cos(angleStart - Math.PI / 2);
    const y1 = center + radius * Math.sin(angleStart - Math.PI / 2);
    const x2 = center + radius * Math.cos(angleEnd - Math.PI / 2);
    const y2 = center + radius * Math.sin(angleEnd - Math.PI / 2);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = [
      `M ${center} ${center}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 0 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');

    path.setAttribute('d', d);
    path.setAttribute('fill', 'transparent');
    path.setAttribute('stroke', 'transparent');
    path.style.cursor = 'pointer';
    path.style.pointerEvents = 'auto';
    path.setAttribute('data-emotion', emotions[i]);

    path.addEventListener('click', () => {
      const selected = document.getElementById('selectedEmotion');
      const input = document.getElementById('emotion-input');
      selected.textContent = `Selected Emotion: ${emotions[i]}`;
      input.value = emotions[i];
    });

    overlaySVG.appendChild(path);
  }
  const { tithi, moonAge } = calculateTithi();
  const sunDay = new Date().getDay(); // 0 = Sunday … 6 = Saturday
  updateMoonSunModal(tithi, moonAge, sunDay, null, null);
  sendEkadasiNotification(tithi);
});
// --- Moon Icon Logic ---
function updateMoonStatus(tithiDay) {
  const icon = document.getElementById('moon-icon');
  if (!icon) return;
  if (tithiDay === 11 || tithiDay === 26) {
    icon.style.textShadow = '0 0 10px #00ccff'; // Blue for Ekadasi
  } else if (tithiDay === 10 || tithiDay === 25) {
    icon.style.textShadow = '0 0 10px #ffd700'; // Gold for day before Ekadasi
  } else {
    icon.style.textShadow = '0 0 10px #00ff66'; // Green for other days
  }
}

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos => {
    updateMoonStatus(calculateTithi().tithi);
  }, err => {
    console.warn("Location access denied. Using default values.");
    updateMoonStatus(calculateTithi().tithi);
  });
} else {
  updateMoonStatus(calculateTithi().tithi);
}
// Refresh the moon icon status every hour to stay current throughout the day
setInterval(() => updateMoonStatus(calculateTithi().tithi), 3600000);
// --- Emotion Modal Logic ---
// --- Modal Show/Hide Helper Functions ---
function showModal(id) {
  document.getElementById(id)?.classList.remove('modal-hidden');
  document.body.classList.add('modal-active');
  document.body.classList.add('hide-icons'); // NEW: hide graph/emotion/footer icons
}

function hideModal(id) {
  document.getElementById(id)?.classList.add('modal-hidden');
  if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
    document.body.classList.remove('modal-active');
    document.body.classList.remove('hide-icons'); // NEW: restore graph/emotion/footer icons
  }
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('emotion-icon')?.addEventListener('click', () => {
    showModal('emotion-modal');
  });
  document.querySelector('#emotion-modal .modal-close')?.addEventListener('click', () => {
    hideModal('emotion-modal');
  });
  document.getElementById('emotion-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const emotion = document.getElementById('emotion-input').value;
    const now = new Date().toISOString();
    const data = getFitnessData();
    if (!Array.isArray(data.emotions)) data.emotions = [];
    data.emotions.push({ emotion, timestamp: now });
    saveFitnessData(data);
    hideModal('emotion-modal');
    alert('Emotion logged.');
  });

  // Expose showModal globally for inline HTML onclick handlers
  window.showModal = showModal;

  // Add event listener for moon icon to show modal
  const moonIcon = document.getElementById('moon-icon');
  if (moonIcon) {
    moonIcon.addEventListener('click', () => showModal('moon-modal'));
  }

  // Add event listener for moon modal close button (ensures hideModal logic is attached)
  document.querySelector('#moon-modal .modal-close')?.addEventListener('click', () => {
    hideModal('moon-modal');
  });

  // --- Emotion Wheel SVG Three-Ring Rendering (Full Hierarchy) ---
  // Only run if the SVG and group exist
  const svg = document.getElementById('emotionWheelSVG');
  const slicesGroup = document.getElementById('emotionSlices');
  const selectedDiv = document.getElementById('selectedEmotion');
  const emotionInput = document.getElementById('emotion-input');
  if (svg && slicesGroup) {
    svg.style.display = 'block';
    slicesGroup.innerHTML = '';
    // Full 3-level emotion hierarchy (Plutchik-inspired, with complete third-levels)
    // Each third-level has a parent (second-level), and each second-level has a parent (base)
    // We'll use a data structure with label, level, and parent as needed
    const emotions = [
      // Level 1: Base emotions (center ring)
      { label: 'Surprised', level: 1 },
      { label: 'Bad', level: 1 },
      { label: 'Fearful', level: 1 },
      { label: 'Angry', level: 1 },
      { label: 'Disgusted', level: 1 },
      { label: 'Sad', level: 1 },
      { label: 'Happy', level: 1 },
      // Level 2: Second ring (parent: base)
      { label: 'Startled', parent: 'Surprised', level: 2 },
      { label: 'Confused', parent: 'Surprised', level: 2 },
      { label: 'Helpless', parent: 'Bad', level: 2 },
      { label: 'Frightened', parent: 'Fearful', level: 2 },
      { label: 'Frustrated', parent: 'Angry', level: 2 },
      { label: 'Jealous', parent: 'Angry', level: 2 },
      { label: 'Disapproving', parent: 'Disgusted', level: 2 },
      { label: 'Disappointed', parent: 'Sad', level: 2 },
      { label: 'Awful', parent: 'Bad', level: 2 },
      { label: 'Hurt', parent: 'Sad', level: 2 },
      { label: 'Depressed', parent: 'Sad', level: 2 },
      { label: 'Empty', parent: 'Sad', level: 2 },
      { label: 'Guilty', parent: 'Bad', level: 2 },
      { label: 'Lonely', parent: 'Sad', level: 2 },
      { label: 'Bored', parent: 'Bad', level: 2 },
      { label: 'Tired', parent: 'Bad', level: 2 },
      { label: 'Sleepy', parent: 'Bad', level: 2 },
      { label: 'Unhappy', parent: 'Bad', level: 2 },
      { label: 'Proud', parent: 'Happy', level: 2 },
      { label: 'Optimistic', parent: 'Happy', level: 2 },
      { label: 'Joyful', parent: 'Happy', level: 2 },
      { label: 'Interested', parent: 'Happy', level: 2 },
      // Level 3: Third ring (parent: second-level)
      // Surprised
      { label: 'Amazed', parent: 'Startled', level: 3 },
      { label: 'Shocked', parent: 'Startled', level: 3 },
      { label: 'Disillusioned', parent: 'Confused', level: 3 },
      { label: 'Perplexed', parent: 'Confused', level: 3 },
      // Bad
      { label: 'Powerless', parent: 'Helpless', level: 3 },
      { label: 'Vulnerable', parent: 'Helpless', level: 3 },
      { label: 'Inferior', parent: 'Awful', level: 3 },
      { label: 'Worthless', parent: 'Awful', level: 3 },
      { label: 'Ashamed', parent: 'Guilty', level: 3 },
      { label: 'Remorseful', parent: 'Guilty', level: 3 },
      { label: 'Indifferent', parent: 'Bored', level: 3 },
      { label: 'Apathetic', parent: 'Bored', level: 3 },
      { label: 'Fatigued', parent: 'Tired', level: 3 },
      { label: 'Unfocussed', parent: 'Tired', level: 3 },
      { label: 'Unmotivated', parent: 'Sleepy', level: 3 },
      { label: 'Lethargic', parent: 'Sleepy', level: 3 },
      { label: 'Unfulfilled', parent: 'Unhappy', level: 3 },
      { label: 'Dissatisfied', parent: 'Unhappy', level: 3 },
      // Fearful
      { label: 'Scared', parent: 'Frightened', level: 3 },
      { label: 'Terrified', parent: 'Frightened', level: 3 },
      // Fearful > Frightened (missing third-ring from image)
      { label: 'Threatened', parent: 'Frightened', level: 3 },
      // Angry
      { label: 'Bitter', parent: 'Frustrated', level: 3 },
      { label: 'Mad', parent: 'Frustrated', level: 3 },
      { label: 'Envious', parent: 'Jealous', level: 3 },
      { label: 'Resentful', parent: 'Jealous', level: 3 },
      // Disgusted
      { label: 'Disdainful', parent: 'Disapproving', level: 3 },
      { label: 'Judgmental', parent: 'Disapproving', level: 3 },
      // Sad
      { label: 'Regretful', parent: 'Disappointed', level: 3 },
      { label: 'Appalled', parent: 'Disappointed', level: 3 },
      { label: 'Abandoned', parent: 'Lonely', level: 3 },
      { label: 'Isolated', parent: 'Lonely', level: 3 },
      { label: 'Despair', parent: 'Depressed', level: 3 },
      { label: 'Hopeless', parent: 'Depressed', level: 3 },
      { label: 'Empty inside', parent: 'Empty', level: 3 },
      { label: 'Numb', parent: 'Empty', level: 3 },
      // Sad > Empty (missing third-ring from image)
      { label: 'Hollow', parent: 'Empty', level: 3 },
      { label: 'Sensitive', parent: 'Hurt', level: 3 },
      // Sad > Hurt (missing third-ring from image)
      { label: 'Rejected', parent: 'Hurt', level: 3 },
      // Bad > Guilty (missing third-ring from image)
      { label: 'Remorseful', parent: 'Guilty', level: 3 },
      // Bad > Tired (missing third-ring from image)
      { label: 'Unfocussed', parent: 'Tired', level: 3 },
      // Bad > Sleepy (missing third-ring from image)
      { label: 'Lethargic', parent: 'Sleepy', level: 3 },
      // Bad > Unhappy (missing third-ring from image)
      { label: 'Dissatisfied', parent: 'Unhappy', level: 3 },
      // Happy > Joyful (missing third-ring from image)
      { label: 'Free', parent: 'Joyful', level: 3 },
      { label: 'Cheeky', parent: 'Joyful', level: 3 },
      // Happy
      { label: 'Confident', parent: 'Proud', level: 3 },
      { label: 'Successful', parent: 'Proud', level: 3 },
      { label: 'Hopeful', parent: 'Optimistic', level: 3 },
      { label: 'Inspired', parent: 'Optimistic', level: 3 },
      { label: 'Excited', parent: 'Joyful', level: 3 },
      { label: 'Delighted', parent: 'Joyful', level: 3 },
      { label: 'Curious', parent: 'Interested', level: 3 },
      { label: 'Inquisitive', parent: 'Interested', level: 3 },
    ];
    const baseEmotions = ['Surprised', 'Bad', 'Fearful', 'Angry', 'Disgusted', 'Sad', 'Happy'];
    const N = baseEmotions.length;
    // Ring radii (adjusted as requested)
    const svgNS = "http://www.w3.org/2000/svg";
    const size = 600;
    const cx = size / 2;
    const cy = size / 2;
    const r1 = 90;
    const r2 = 170;
    const r3 = 260;
    const r4 = 360;
    // Helper: get children by parent
    function getChildren(parent, level) {
      return emotions.filter(e => e.parent === parent && e.level === level);
    }
    // Helper: describe arc
    function describeArc(cx, cy, r1, r2, startAngle, endAngle) {
      const startRad = (Math.PI / 180) * startAngle;
      const endRad = (Math.PI / 180) * endAngle;
      const x1 = cx + r2 * Math.cos(startRad);
      const y1 = cy + r2 * Math.sin(startRad);
      const x2 = cx + r2 * Math.cos(endRad);
      const y2 = cy + r2 * Math.sin(endRad);
      const x3 = cx + r1 * Math.cos(endRad);
      const y3 = cy + r1 * Math.sin(endRad);
      const x4 = cx + r1 * Math.cos(startRad);
      const y4 = cy + r1 * Math.sin(startRad);
      const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
      return [
        `M ${x1} ${y1}`,
        `A ${r2} ${r2} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${r1} ${r1} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z'
      ].join(' ');
    }
    // Helper: click handler
    function selectEmotion(emotion) {
      if (selectedDiv) selectedDiv.textContent = `Selected Emotion: ${emotion}`;
      if (emotionInput) emotionInput.value = emotion;
    }
    // Colors for base sectors
    const baseColors = [
      '#f4d03f', // Surprised (yellow)
      '#b9770e', // Bad (brown)
      '#16a085', // Fearful (teal)
      '#e74c3c', // Angry (red)
      '#229954', // Disgusted (dark green)
      '#34495e', // Sad (navy)
      '#5dade2', // Happy (blue)
    ];
    // --- Draw Level 1: Center ring ---
    for (let i = 0; i < N; ++i) {
      const base = baseEmotions[i];
      const start = -135 + i * (360 / N);
      const end = start + (360 / N);
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', describeArc(cx, cy, 0, r1, start, end));
      path.setAttribute('fill', baseColors[i % baseColors.length]);
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', '1');
      path.classList.add('emotion-slice');
      path.setAttribute('data-emotion', base);
      path.addEventListener('click', () => selectEmotion(base));
      slicesGroup.appendChild(path);
      // Label (centered in sector, align with arc)
      const midAngle = (start + end) / 2;
      const labelRadius = r1 * 0.65;
      const labelX = cx + labelRadius * Math.cos(midAngle * Math.PI / 180);
      const labelY = cy + labelRadius * Math.sin(midAngle * Math.PI / 180);
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', labelX);
      text.setAttribute('y', labelY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('transform', `rotate(${midAngle}, ${labelX}, ${labelY})`);
      text.textContent = base;
      text.classList.add('emotion-label');
      slicesGroup.appendChild(text);
    }
    // --- Draw Level 2: Second ring ---
    for (let i = 0; i < N; ++i) {
      const base = baseEmotions[i];
      const sectorStart = -135 + i * (360 / N);
      const sectorEnd = sectorStart + (360 / N);
      // Get all level 2 children for this base
      const children = getChildren(base, 2);
      const count = children.length;
      for (let j = 0; j < count; ++j) {
        const child = children[j];
        const start = sectorStart + ((sectorEnd - sectorStart) * j) / count;
        const end = sectorStart + ((sectorEnd - sectorStart) * (j+1)) / count;
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', describeArc(cx, cy, r1, r2, start, end));
        path.setAttribute('fill', baseColors[i % baseColors.length] + "CC");
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '1');
        path.classList.add('emotion-slice');
        path.setAttribute('data-emotion', child.label);
        path.addEventListener('click', () => selectEmotion(child.label));
        slicesGroup.appendChild(path);
        // Label (curved alignment)
        const midAngle = (start + end) / 2;
        const labelRadius = (r1 + r2) / 2;
        const labelX = cx + labelRadius * Math.cos(midAngle * Math.PI / 180);
        const labelY = cy + labelRadius * Math.sin(midAngle * Math.PI / 180);
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', labelX);
        text.setAttribute('y', labelY);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('transform', `rotate(${midAngle}, ${labelX}, ${labelY})`);
        text.textContent = child.label;
        text.classList.add('emotion-label');
        slicesGroup.appendChild(text);
      }
    }
    // --- Draw Level 3: Outermost ring (r2 to r3) ---
    for (let i = 0; i < N; ++i) {
      const base = baseEmotions[i];
      const sectorStart = -135 + i * (360 / N);
      const sectorEnd = sectorStart + (360 / N);
      // Get all level 2 children for this base
      const secondLevel = getChildren(base, 2);
      let totalThirds = 0;
      // Count total third-level emotions in this sector
      for (const sec of secondLevel) {
        totalThirds += getChildren(sec.label, 3).length;
      }
      // If no thirds, skip
      if (totalThirds === 0) continue;
      let thirdIdx = 0;
      for (const sec of secondLevel) {
        const thirds = getChildren(sec.label, 3);
        for (let k = 0; k < thirds.length; ++k) {
          const third = thirds[k];
          // Each third-level occupies proportional angle within base sector
          const start = sectorStart + ((sectorEnd - sectorStart) * thirdIdx) / totalThirds;
          const end = sectorStart + ((sectorEnd - sectorStart) * (thirdIdx + 1)) / totalThirds;
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', describeArc(cx, cy, r2, r3, start, end));
          path.setAttribute('fill', baseColors[i % baseColors.length] + "88");
          path.setAttribute('stroke', '#fff');
          path.setAttribute('stroke-width', '1');
          path.classList.add('emotion-slice');
          path.setAttribute('data-emotion', third.label);
          path.addEventListener('click', () => selectEmotion(third.label));
          slicesGroup.appendChild(path);
          // Label (curved, outermost, align with arc)
          const midAngle = (start + end) / 2;
          const labelRadius = (r2 + r3) / 2;
          const labelX = cx + labelRadius * Math.cos(midAngle * Math.PI / 180);
          const labelY = cy + labelRadius * Math.sin(midAngle * Math.PI / 180);
          const text = document.createElementNS(svgNS, 'text');
          text.setAttribute('x', labelX);
          text.setAttribute('y', labelY);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle');
          // Rotate so text is tangent to the arc at the midpoint
          text.setAttribute('transform', `rotate(${midAngle}, ${labelX}, ${labelY})`);
          text.textContent = third.label;
          text.classList.add('emotion-label');
          slicesGroup.appendChild(text);
          thirdIdx++;
        }
      }
    }
  }
});
// Unified fitness data structure & helpers

// --- Workout Session Global Variables ---
let sessionStartTime = null;
let sessionId = null;
const STORAGE_KEY = 'fitnessTrackerData';

const defaultData = {
  dataVersion: 1,
  weightLogs: [],
  supplements: [],
  foods: [],
  measurements: [],
  exercises: {
    types: ['Sit-ups', 'Push-ups', 'Pull-ups'],
    entries: []
  },
  sessionLog: []
};

function getFitnessData() {
  let data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    const normalized = normalizeFitnessData(JSON.parse(data));
    saveFitnessData(normalized);
    return normalized;
  } else {
    // write default structure if no existing data
    saveFitnessData(defaultData);
    return JSON.parse(JSON.stringify(defaultData));
  }
}

function saveFitnessData(data) {
  const normalized = normalizeFitnessData(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

function logWeight(weight, timestamp) {
  const data = getFitnessData();
  data.weightLogs.push({ weight, timestamp });
  saveFitnessData(data);
}
// --- Bluetooth Scale Integration ---
// Updated Bluetooth characteristic value change handler for accurate weight parsing
// This function is an example and should be used in the context where you handle Bluetooth scale integration.
// You may need to adapt which button triggers the connection, etc.

async function connectToBluetoothScale() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'Health' }],
      optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb']
    });

    // Example status update, adapt as needed
    if (document.getElementById('bt-status')) {
      document.getElementById('bt-status').textContent = `Status: Connected to ${device.name}`;
    }

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
    // Characteristic UUID may need to be adjusted to match your scale
    const characteristic = await service.getCharacteristic('0000fff4-0000-1000-8000-00805f9b34fb');

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const value = event.target.value;
      const rawData = new Uint8Array(value.buffer);
      // console.log('📦 Raw data:', rawData); // Removed logging raw data

      // Extract weight from bytes 3 and 4 (little-endian)
      const weightKg = (rawData[3] + (rawData[4] << 8)) / 10;
      const weightLbs = (weightKg * 2.20462);

      console.log(`⚖️ Weight Estimate: ${weightKg.toFixed(2)} kg (${weightLbs.toFixed(2)} lbs)`);

      // Update the frontend display
      if (document.getElementById('bluetoothWeightOutput')) {
        document.getElementById('bluetoothWeightOutput').textContent = `${weightKg.toFixed(2)} kg (${weightLbs.toFixed(2)} lbs)`;
      }
      // Optionally update other displays, e.g. weightReading
      if (document.getElementById('weightReading')) {
        document.getElementById('weightReading').textContent = `${weightKg.toFixed(2)} kg`;
      }

      // Autofill the weight input field in pounds
      const weightInput = document.querySelector("#logWeight");
      if (weightInput) {
        weightInput.value = weightLbs.toFixed(2);
      }

      // Set the value of the input field with id 'weight-input' if it exists
      const weightInputField = document.getElementById('weight-input');
      if (weightInputField) {
        weightInputField.value = weightLbs.toFixed(2);
      }

      // Optionally store the reading
      localStorage.setItem('latestWeightKg', weightKg.toFixed(2));
    });
  } catch (err) {
    console.error('Bluetooth connection failed:', err);
    if (document.getElementById('bt-status')) {
      document.getElementById('bt-status').textContent = `❌ Error: ${err.message}`;
    }
  }
}

// Attach Bluetooth connect event listener on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.getElementById('connect-scale-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', connectToBluetoothScale);
  }
});
import { connectW3upClient, tryAutoRestoreW3upClient } from './w3upClient.js';
import { uploadDataToIPFS } from './uploadToIPFS.js';
import { normalizeFitnessData, importAndMergeFromCID } from './fitnessData.js';

// Supplements form logic (now unified in fitnessTrackerData)
// --- Raw Intake Modal (New Modal) Logic ---
// Food Intake Modal logic
// Raw Intake Modal logic
// Remove any previous food logging button event listeners and restore Diet button logic
// Diet Modal Logic
document.addEventListener('DOMContentLoaded', () => {
  // Diet button opens the diet modal
  const dietBtn = document.getElementById('dietBtn');
  const dietModal = document.getElementById('dietModal');
  const closeDietModal = document.getElementById('closeDietModal');
  // Hide rawFoodModal on load to ensure it's not visible
  const rawFoodModal = document.getElementById('rawFoodModal');
  if (rawFoodModal) {
    rawFoodModal.classList.add('hidden');
  }
  if (dietBtn && dietModal) {
    dietBtn.addEventListener('click', function () {
      // Use modal style: show as flex (CSS will override to modal look)
      dietModal.style.display = 'block';
      dietModal.setAttribute('aria-modal', 'true');
    });
  }
  if (closeDietModal && dietModal) {
    closeDietModal.addEventListener('click', function () {
      dietModal.style.display = 'none';
      dietModal.removeAttribute('aria-modal');
    });
  }
  // Close modal when clicking outside modal-content area
  window.addEventListener('click', function (event) {
    if (dietModal && event.target === dietModal) {
      dietModal.style.display = 'none';
      dietModal.removeAttribute('aria-modal');
    }
  });
  // Diet form submission
  const dietForm = document.getElementById('dietForm');
  if (dietForm) {
    dietForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = document.getElementById('dietFoodName').value.trim();
      const amount = parseFloat(document.getElementById('dietFoodAmount').value);
      const unit = document.getElementById('dietFoodUnit').value.trim();
      const protein = parseFloat(document.getElementById('dietFoodProtein').value);
      if (name && amount && unit && protein >= 0) {
        const intake = {
          type: 'diet',
          name,
          amount,
          unit,
          protein,
          date: new Date().toISOString()
        };
        // Add to foods list in fitness data
        const data = getFitnessData();
        data.foods.push(intake);
        saveFitnessData(data);
        // Optionally re-render recent food list if you have a function
        if (typeof displayRecentFoods === 'function') displayRecentFoods();
        dietForm.reset();
        dietModal.style.display = 'none';
        dietModal.removeAttribute('aria-modal');
      }
    });
  }
});
const supplementForm = document.getElementById('supplement-form');
const supplementEntries = document.getElementById('supplement-entries');
const supplementDateInput = document.getElementById('supplement-date');

function setTodayForSupplementDate() {
  if (supplementDateInput) {
    const today = new Date().toISOString().split('T')[0];
    supplementDateInput.value = today;
  }
}

function loadSupplements() {
  const data = getFitnessData();
  const stored = data.supplements || [];
  if (supplementEntries) {
    supplementEntries.innerHTML = '';
    stored.forEach((item, index) => {
      const li = document.createElement('li');
      li.innerHTML = `${item.name} - ${item.weight}mg on ${item.date} at ${item.time || ''}${item.description ? ' (' + item.description + ')' : ''} <button data-index="${index}" class="delete-supplement">Remove</button>`;
      supplementEntries.appendChild(li);
    });
  }
}

// Set supplement date field to today on load
setTodayForSupplementDate();

supplementForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('supplement-name').value;
  const weight = parseFloat(document.getElementById('supplement-weight').value);
  const date = document.getElementById('supplement-date').value;
  const time = document.getElementById('supplement-time').value;
  const description = document.getElementById('supplement-description').value;

  const data = getFitnessData();
  data.supplements.push({ name, weight, date, time, description });
  saveFitnessData(data);
  supplementForm.reset();
  setTodayForSupplementDate();
  loadSupplements();
  displayRecentSupplements();
});

supplementEntries?.addEventListener('click', (e) => {
  if (e.target.classList.contains('delete-supplement')) {
    const index = e.target.dataset.index;
    const data = getFitnessData();
    data.supplements.splice(index, 1);
    saveFitnessData(data);
    loadSupplements();
  }
});

loadSupplements();

// Display current weight
function displayCurrentWeight() {
  const data = getFitnessData();
  const display = document.getElementById('current-weight-display');
  if (!display) return;

  const lastEntry = data.weightLogs.length > 0 ? data.weightLogs[data.weightLogs.length - 1] : null;
  if (lastEntry) {
    display.textContent = `${lastEntry.weight} lbs`;
  } else {
    display.textContent = `— lbs`;
  }
  displayRecentSupplements();
  displayRecentExercises();
  displayRecentFoods();
}
// Display recent foods (7 days)
function displayRecentFoods() {
  const list = document.getElementById('foods-last7days');
  if (!list) return;
  list.innerHTML = '';

  const data = getFitnessData();
  const today = new Date().toISOString().split('T')[0];
  const past7 = new Date();
  past7.setDate(past7.getDate() - 6); // includes today

  // Show all entries in last 7 days
  const foods = (data.foods || []).filter(food => {
    let foodDate = food.date || food.timestamp || '';
    if (!foodDate) return false;
    let dateObj;
    if (foodDate.length === 10) { // YYYY-MM-DD
      dateObj = new Date(foodDate);
    } else {
      dateObj = new Date(foodDate);
    }
    return dateObj >= past7;
  });

  foods.forEach(food => {
    const li = document.createElement('li');
    let desc = food.description ? ` (${food.description})` : '';
    li.innerHTML = `<span class="supplement-name-hover">${food.name}</span>${desc} - ${food.amount} on ${food.date}`;
    
    li.addEventListener('mouseenter', () => showFoodGraphPopup(food.name, li));
    li.addEventListener('mouseleave', hideSupplementGraphPopup);

    li.addEventListener('click', () => {
      const entries = getFitnessData().foods.filter(f => f.name === food.name);
      const last = entries.at(-1);
      const confirmSame = confirm(`Log same intake: "${last.amount}" for ${last.name}? Click cancel to change.`);
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 5);
      if (confirmSame) {
        getFitnessData().foods.push({ ...last, date, time });
      } else {
        const newAmount = prompt(`Enter new amount for ${last.name}:`, last.amount);
        if (newAmount) {
          getFitnessData().foods.push({ name: last.name, amount: newAmount, date, time });
        }
      }
      saveFitnessData(getFitnessData());
      displayRecentFoods();
    });

    list.appendChild(li);
  });
}
// --- Food hover graph popup ---
function showFoodGraphPopup(foodName, anchorElement) {
  let popup = document.getElementById('supplement-hover-popup');
  if (!popup) return;
  popup.innerHTML = `<canvas id="supplementChart" width="300" height="200"></canvas>`;
  const rect = anchorElement.getBoundingClientRect();
  popup.style.top = `${rect.bottom + window.scrollY}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.display = 'block';

  const entries = getFitnessData().foods.filter(f => f.name === foodName);
  const ctx = document.getElementById('supplementChart')?.getContext('2d');
  if (ctx) {
    if (window._supplementChart) window._supplementChart.destroy();
    window._supplementChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: entries.map(e => `${e.date} ${e.time || ''}`),
        datasets: [{
          label: foodName,
          data: entries.map(e => parseFloat(e.amount)),
          borderColor: '#ffcc00',
          backgroundColor: 'rgba(255,204,0,0.3)',
          tension: 0.3
        }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'Time' } },
          y: { beginAtZero: true, title: { display: true, text: 'Amount' } }
        }
      }
    });
  }
}
  // --- Raw Intake logging button logic ---
  const logFoodsBtn = document.getElementById('log-foods');
  logFoodsBtn?.addEventListener('click', () => {
    const name = prompt("Enter food name:");
    if (!name) return;
    const amount = prompt("Enter amount (e.g., 1 cup, 28g):");
    if (!amount) return;
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().slice(0, 5);
    const entry = { name, amount, date, time };

    const data = getFitnessData();
    data.foods.push(entry);
    saveFitnessData(data);
    displayRecentFoods();
  });

function displayRecentSupplements() {
  const list = document.getElementById('supplements-last7days');
  if (!list) return;
  list.innerHTML = '';

  const data = getFitnessData();
  const today = new Date().toISOString().split('T')[0];
  const past7 = new Date();
  past7.setDate(past7.getDate() - 6); // includes today

  const takenMap = {};

  (data.supplements || []).forEach(supp => {
    const date = supp.date;
    if (!takenMap[supp.name]) takenMap[supp.name] = [];
    takenMap[supp.name].push(date);
  });

  Object.entries(takenMap).forEach(([name, dates]) => {
    const hasToday = dates.some(dateStr => {
      const [d] = dateStr.split('T');
      return d === today;
    });
    const recent = dates.some(d => new Date(d) >= past7);
    if (recent) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="supplement-name-hover">${name}</span>`;
      li.classList.add(hasToday ? 'supplement-today' : 'supplement-missed');
      li.addEventListener('mouseenter', () => showSupplementGraphPopup(name, li));
      li.addEventListener('mouseleave', () => hideSupplementGraphPopup());
      // Add click event for logging same or new dose
      li.addEventListener('click', () => {
        const data = getFitnessData();
        const entries = data.supplements.filter(s => s.name === name);
        const last = entries.at(-1);
        if (!last) return;

        const descriptionPart = last.description ? ` (${last.description})` : '';
        const confirmSame = confirm(`Log same dose of ${last.weight}mg${descriptionPart} for ${name}? Click "Cancel" to change.`);
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(':').slice(0, 2).join(':');
        let dosage = last.weight;
        if (confirmSame) {
          data.supplements.push({ ...last, date, time });
        } else {
          const newDose = parseFloat(prompt(`Enter new dose for ${name} (mg):`, last.weight));
          if (!isNaN(newDose)) {
            data.supplements.push({ ...last, weight: newDose, date, time });
            dosage = newDose;
          } else {
            // If user cancels or enters invalid, do not log
            return;
          }
        }
        saveFitnessData(data);
        // --- Supplement log persistence (for coloring etc) ---
        const supplementLogs = JSON.parse(localStorage.getItem('supplementLogs')) || {};
        if (!supplementLogs[name]) {
          supplementLogs[name] = [];
        }
        supplementLogs[name].push({
          date: date,
          dosage: dosage
        });
        localStorage.setItem('supplementLogs', JSON.stringify(supplementLogs));
        displayRecentSupplements();
      });
      list.appendChild(li);
    }
  });
// --- Supplement log coloring on page load (for supplement items) ---
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const supplementLogs = JSON.parse(localStorage.getItem('supplementLogs')) || {};
  document.querySelectorAll('.supplement-item').forEach(item => {
    const name = item.getAttribute('data-supplement-name');
    const logs = supplementLogs[name] || [];
    const loggedToday = logs.some(entry => entry.date === today);
    if (loggedToday) {
      item.classList.add('taken-today');
      item.classList.remove('not-taken');
    } else {
      item.classList.remove('taken-today');
      item.classList.add('not-taken');
    }
  });
});
}

// Supplement hover graph popup
function showSupplementGraphPopup(supplementName, anchorElement) {
  let popup = document.getElementById('supplement-hover-popup');
  let newlyCreated = false;
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'supplement-hover-popup';
    popup.className = 'hover-popup';
    popup.style.position = 'absolute';
    popup.style.zIndex = 1000;
    popup.style.background = 'rgba(0,0,40,0.95)';
    popup.style.border = '1px solid #00e5ff';
    popup.style.borderRadius = '8px';
    popup.style.padding = '8px';
    popup.style.color = 'white';
    popup.innerHTML = `<canvas id="supplementChart" width="300" height="200"></canvas>`;
    document.body.appendChild(popup);
    newlyCreated = true;
  } else {
    // Remove button if present from previous render
    popup.innerHTML = `<canvas id="supplementChart" width="300" height="200"></canvas>`;
  }

  // Add mouseenter/mouseleave to keep popup visible when hovered
  if (!popup._hoverEventsAdded) {
    popup.addEventListener('mouseenter', () => {
      popup.style.display = 'block';
    });
    popup.addEventListener('mouseleave', () => {
      popup.style.display = 'none';
    });
    popup._hoverEventsAdded = true;
  }

  const rect = anchorElement.getBoundingClientRect();
  popup.style.top = `${rect.bottom + window.scrollY}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.display = 'block';

  const data = getFitnessData();
  const entries = data.supplements.filter(s => s.name === supplementName);
  const ctx = document.getElementById('supplementChart')?.getContext('2d');
  if (ctx) {
    if (window._supplementChart) window._supplementChart.destroy();
    window._supplementChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: entries.map(e => `${e.date}${e.time ? ' ' + e.time : ''}`),
        datasets: [{
          label: supplementName,
          data: entries.map(e => e.weight),
          borderColor: '#00e5ff',
          backgroundColor: 'rgba(0,229,255,0.2)',
          tension: 0.4
        }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'Time' } },
          y: { beginAtZero: true, title: { display: true, text: 'Amount (mg)' } }
        }
      }
    });
  }
}

function hideSupplementGraphPopup() {
  const popup = document.getElementById('supplement-hover-popup');
  if (popup) popup.style.display = 'none';
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function getExerciseLogDates(exerciseName) {
  const data = getFitnessData();
  const entries = (data.exercises?.entries || []);
  return entries
    .filter(e => e.type === exerciseName)
    .map(e => new Date(e.timestamp));
}

// --- Lifetime Workout Stats Helper ---
function getLifetimeWorkoutStats() {
  const data = getFitnessData();
  const log = data.sessionLog || [];

  const lifetimeStats = log.reduce(
    (acc, session) => {
      acc.totalWorkSeconds += session.totalWorkSeconds || 0;
      acc.totalRestSeconds += session.totalRestSeconds || 0;
      acc.totalSets += session.totalSetsCompleted || 0;
      if (session.completed) acc.completedSessions++;
      else acc.canceledSessions++;
      return acc;
    },
    {
      totalWorkSeconds: 0,
      totalRestSeconds: 0,
      totalSets: 0,
      completedSessions: 0,
      canceledSessions: 0
    }
  );

  return lifetimeStats;
}

function displayRecentExercises() {
  const list = document.getElementById('exercises-last7days');
  if (!list) return;

  // Helper: get total reps from an entry regardless of storage format
  const getEntryTotalReps = e => Array.isArray(e.sets)
    ? e.sets.reduce((sum, s) => sum + (parseInt(s.reps) || 0), 0)
    : (parseInt(e.reps) || 0);

  // --- Insert or update the lifetime tally above the #exercise-list in the modal ---
  const fitnessData = getFitnessData();
  const log = fitnessData.exercises?.entries || [];

  // Find the exercise modal and #exercise-list
  const exerciseList = document.getElementById('exercise-list');
  if (exerciseList && exerciseList.parentElement) {
    let statsContainer = document.getElementById('lifetime-stats-summary');
    if (!statsContainer) {
      statsContainer = document.createElement('div');
      statsContainer.id = 'lifetime-stats-summary';
      statsContainer.style.fontSize = '0.75rem';
      statsContainer.style.marginBottom = '0.5rem';
      exerciseList.parentElement.insertBefore(statsContainer, exerciseList);
    }
    // Compute tallies with normalized name matching (case/whitespace/hyphen insensitive, using includes)
    const normalize = str => (str || '').toLowerCase().replace(/[\s\-]/g, '');

    const pullups = log.filter(e => normalize(e.type).includes('pullup')).reduce((sum, e) => sum + getEntryTotalReps(e), 0);
    const pushups = log.filter(e => normalize(e.type).includes('pushup')).reduce((sum, e) => sum + getEntryTotalReps(e), 0);
    const situps = log.filter(e => normalize(e.type).includes('situp')).reduce((sum, e) => sum + getEntryTotalReps(e), 0);
    // For total time, fallback to sessionLog if present, else use fitnessData.totalWorkSeconds/totalRestSeconds
    let totalTimeSec = 0;
    if (Array.isArray(fitnessData.sessionLog)) {
      totalTimeSec = fitnessData.sessionLog.reduce((sum, s) =>
        sum + (s.totalWorkSeconds || 0) + (s.totalRestSeconds || 0), 0);
    } else {
      totalTimeSec = (fitnessData.totalWorkSeconds || 0) + (fitnessData.totalRestSeconds || 0);
    }
    statsContainer.innerHTML = `
      🏋️‍♂️ Pull-ups: ${pullups} | Push-ups: ${pushups} | Sit-ups: ${situps}<br>
      ⏱️ Total Time: ${(totalTimeSec / 60).toFixed(1)} min
    `;
  }

  // --- Continue with recent exercise display ---
  list.innerHTML = '';

  const entries = (fitnessData.exercises?.entries || []);
  const recent = {};
  const now = new Date();

  entries.forEach(entry => {
    const entryDate = new Date(entry.timestamp);
    // Use calendar day diff logic
    const nowDateStr = now.toISOString().split('T')[0];
    const entryDateStr = entryDate.toISOString().split('T')[0];
    const diffDays = Math.floor((new Date(nowDateStr) - new Date(entryDateStr)) / (1000 * 60 * 60 * 24));
    if (diffDays <= 6) {
      if (!recent[entry.type] || new Date(recent[entry.type]) < entryDate) {
        recent[entry.type] = entry.timestamp;
      }
    }
  });

  Object.entries(recent).forEach(([type, timestamp]) => {
    const daysAgo = Math.floor((now - new Date(timestamp)) / (1000 * 60 * 60 * 24));
    const li = document.createElement('li');

    // Insert fire video only if exercise was performed both today and yesterday
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const exerciseDates = getExerciseLogDates(type);
    const didToday = exerciseDates.some(date => isSameDay(date, today));
    const didYesterday = exerciseDates.some(date => isSameDay(date, yesterday));
    if (didToday && didYesterday) {
      const fire = document.createElement('video');
      fire.src = 'img/fire.mp4';
      fire.loop = true;
      fire.autoplay = true;
      fire.muted = true;
      fire.style.width = '24px';
      fire.style.height = '24px';
      fire.style.marginRight = '4px';
      fire.style.verticalAlign = 'middle';
      li.appendChild(fire);
    }

    // Wrap exercise name in span for hover
    const nameSpan = document.createElement('span');
    nameSpan.className = 'exercise-name-hover';
    nameSpan.textContent = type;
    li.appendChild(nameSpan);

    // Add "+" button for workout set
    const btn = document.createElement('button');
    btn.textContent = '+';
    btn.className = 'exercise-add-btn';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToWorkoutSet(type);
    });
    li.insertBefore(btn, li.firstChild === nameSpan ? nameSpan : li.children[1]);

    // Color classes
    if (daysAgo === 0) li.classList.add('exercise-today');
    else if (daysAgo === 1) li.classList.add('exercise-1day-rest');
    else if (daysAgo === 2) li.classList.add('exercise-2day-rest');
    else if (daysAgo === 3) li.classList.add('exercise-3day-rest');
    else li.classList.add('exercise-cooled-off');

    // Hover popup for exercise graph
    li.addEventListener('mouseenter', () => showExerciseGraphPopup(type, li));
    li.addEventListener('mouseleave', hideExerciseGraphPopup);

    // Click to log same/new set
    li.addEventListener('click', () => {
      const allEntries = fitnessData.exercises?.entries || [];
      // Find last logged set for this exercise
      const last = [...allEntries].reverse().find(e => e.type === type);
      if (!last) return;
      const confirmSame = confirm(`Log same set: ${last.reps} reps @ ${last.weight || 0} lbs for ${type}? Click Cancel to enter new values.`);
      const now = new Date();
      const timestamp = now.toISOString();
      if (confirmSame) {
        fitnessData.exercises.entries.push({
          ...last,
          timestamp
        });
      } else {
        const reps = parseInt(prompt(`Enter reps for ${type}:`, last.reps), 10);
        const weight = parseFloat(prompt(`Enter weight for ${type}:`, last.weight || 0));
        if (!isNaN(reps) && !isNaN(weight)) {
          fitnessData.exercises.entries.push({
            type,
            reps,
            sets: 1,
            weight,
            timestamp
          });
        }
      }
      saveFitnessData(fitnessData);
      displayRecentExercises();
    });

    list.appendChild(li);

    // Automatically add to workout set if not done in 3+ days
    if (daysAgo >= 3) {
      addToWorkoutSet(type);
    }
  });

  // --- Update the exercise log list in the modal (exercise-list), sorted by date descending ---
  if (exerciseList) {
    exerciseList.innerHTML = '';
    const sortedLog = [...log].sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));
    sortedLog.forEach(entry => {
      const item = document.createElement('li');
      // Format: YYYY-MM-DD: Type - reps x sets
      let entryDate = '';
      if (entry.date) {
        entryDate = entry.date;
      } else if (entry.timestamp) {
        entryDate = entry.timestamp.split('T')[0];
      }
      const totalReps = getEntryTotalReps(entry);
      const totalSets = Array.isArray(entry.sets) ? entry.sets.length : (entry.sets || 0);
      item.textContent = `${entryDate}: ${entry.type} - ${totalReps} reps x ${totalSets} sets`;
      exerciseList.appendChild(item);
    });
  }
}

// --- Exercise Hover Graph Popup ---
function showExerciseGraphPopup(exerciseType, anchorElement) {
  let popup = document.getElementById('supplement-hover-popup');
  if (!popup) return;
  popup.innerHTML = `<canvas id="supplementChart" width="300" height="200"></canvas>`;
  const rect = anchorElement.getBoundingClientRect();
  popup.style.top = `${rect.bottom + window.scrollY}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.display = 'block';

  const data = getFitnessData();
  const entries = data.exercises?.entries.filter(e => e.type === exerciseType) || [];
  const ctx = document.getElementById('supplementChart')?.getContext('2d');
  if (ctx) {
    if (window._supplementChart) window._supplementChart.destroy();
    // Use new config and data structure
    const typeNorm = exerciseType;
    const { labels, reps, weights, tooltips } = prepareGraphData(entries, typeNorm);
    window._supplementChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Reps',
            data: reps,
            borderColor: '#00e5ff',
            backgroundColor: 'rgba(0,229,255,0.2)',
            tension: 0.4,
            yAxisID: 'y',
          },
          {
            label: 'Max Weight',
            data: weights,
            borderColor: '#ff00cc',
            backgroundColor: 'rgba(255,0,204,0.2)',
            tension: 0.4,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          tooltip: {
            callbacks: {
              afterBody: function(context) {
                return tooltips[context[0].dataIndex];
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Reps' } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Weight' } }
        }
      }
    });
  }
}

function hideExerciseGraphPopup() {
  const popup = document.getElementById('supplement-hover-popup');
  if (popup) popup.style.display = 'none';
}

function addToWorkoutSet(type) {
  const list = document.getElementById('workout-set-items');
  if (!list) return;

  const li = document.createElement('li');
  li.classList.add('workout-set-item');

  const nameSpan = document.createElement('span');
  nameSpan.className = 'workout-exercise-name';
  nameSpan.textContent = type;

  const setsInput = document.createElement('input');
  setsInput.className = 'workout-sets';
  setsInput.type = 'number';
  setsInput.placeholder = 'Sets';
  setsInput.min = '1';
  setsInput.value = 3; // Prefill with 3 sets

  const setList = document.createElement('div');
  setList.className = 'set-details';

  // --- Add delete icon for each workout set item ---
  const deleteIcon = document.createElement('img');
  deleteIcon.src = 'img/Trash.png';
  deleteIcon.alt = 'Remove';
  deleteIcon.className = 'delete-set-icon';
  deleteIcon.style.width = '16px';
  deleteIcon.style.height = '16px';
  deleteIcon.style.marginLeft = '8px';
  deleteIcon.style.cursor = 'pointer';
  deleteIcon.addEventListener('click', () => {
    list.removeChild(li);
    renderWorkoutList();
  });
  // --------------------------------------------------

  li.appendChild(nameSpan);
  li.appendChild(setsInput);
  li.appendChild(setList);
  // Append delete icon at the end
  li.appendChild(deleteIcon);
  list.appendChild(li);

  // Helper to update data attributes for estimated time calculation
  function updateLiDataAttributes() {
    const sets = parseInt(setsInput.value) || 0;
    // Use current work/rest durations from inputs
    const workTime = parseInt(document.getElementById('work-duration')?.value || '60') || 0;
    const restTime = parseInt(document.getElementById('rest-duration')?.value || '120') || 0;
    li.setAttribute('data-sets', sets);
    li.setAttribute('data-worktime', workTime);
    li.setAttribute('data-resttime', restTime);
  }

  // Replace setsInput event listener with autofill logic
  setsInput.addEventListener('input', () => {
    const sets = parseInt(setsInput.value);
    setList.innerHTML = '';

    // Get last known weight and reps for this exercise
    const data = getFitnessData();
    const entries = data.exercises?.entries || [];
    const lastEntry = [...entries].reverse().find(e => e.type === type && e.weight != null);

    for (let i = 0; i < sets; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'set-entry';

      const repInput = document.createElement('input');
      repInput.type = 'number';
      repInput.placeholder = 'Reps';
      repInput.className = 'set-reps';

      if (lastEntry && typeof lastEntry.reps === 'number') {
        repInput.value = lastEntry.reps;
      } else {
        if (i === 0) repInput.value = 6;
        else if (i === 1) repInput.value = 8;
        else repInput.value = 12;
      }

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.placeholder = 'Weight';
      weightInput.className = 'set-weight';
      if (lastEntry) {
        weightInput.value = lastEntry.weight;
      }

      wrapper.appendChild(repInput);
      wrapper.appendChild(weightInput);
      setList.appendChild(wrapper);
    }
    updateLiDataAttributes();
    renderWorkoutList();
  });

  // When work/rest durations change, update data attributes and estimated time
  document.getElementById('work-duration')?.addEventListener('input', () => {
    updateLiDataAttributes();
    renderWorkoutList();
  });
  document.getElementById('rest-duration')?.addEventListener('input', () => {
    updateLiDataAttributes();
    renderWorkoutList();
  });

  // Set initial data attributes
  setsInput.dispatchEvent(new Event('input')); // Trigger prefill after listener
  updateLiDataAttributes();
  renderWorkoutList();
}

// --- Workout Timer Modal Logic ---

// --- Render Workout Set List / Estimated Time ---
function renderWorkoutList() {
  // Calculate estimated total workout time based on DOM list items, not fitness data
  const listItems = document.querySelectorAll('#workout-set-items li');
  let estimatedTotalSeconds = 0;

  listItems.forEach(item => {
    const sets = parseInt(item.getAttribute('data-sets')) || 0;
    const workTime = parseInt(item.getAttribute('data-worktime')) || 0;
    const restTime = parseInt(item.getAttribute('data-resttime')) || 0;
    estimatedTotalSeconds += sets * (workTime + restTime);
  });

  const estimatedTotalMinutes = (estimatedTotalSeconds / 60).toFixed(1);
  const estElem = document.getElementById('estimated-total-time');
  if (estElem) {
    estElem.textContent = `⏳ Estimated Workout Time: ${estimatedTotalMinutes} min`;
  }
}

// Call renderWorkoutList on DOMContentLoaded and whenever workout set list changes
window.addEventListener('DOMContentLoaded', () => {
  renderWorkoutList();
});
const workoutModal = document.getElementById('workout-timer-modal');
const workoutTitle = document.getElementById('workout-current-title');
const workoutCurrent = document.getElementById('workout-current-info');
const workoutNext = document.getElementById('workout-next-info');
const workoutTimerDisplay = document.getElementById('workout-timer-display');
const startWorkoutButton = document.getElementById('start-workout-button');

let workoutSequence = [];
let currentStepIndex = 0;
let workoutTimerInterval = null;
let paused = false;

startWorkoutButton?.addEventListener('click', () => {
  const sets = document.querySelectorAll('.workout-set-item');
  const sequence = [];

  sets.forEach(item => {
    const name = item.querySelector('.workout-exercise-name')?.textContent;
    const reps = item.querySelectorAll('.set-reps');
    const weights = item.querySelectorAll('.set-weight');

    reps.forEach((r, i) => {
      sequence.push({
        type: 'exercise',
        name,
        reps: r.value,
        weight: weights[i]?.value,
        setIndex: i
      });
      const restDuration = parseInt(document.getElementById('rest-duration')?.value || '120');
      sequence.push({
        type: 'rest',
        duration: restDuration
      });
    });
  });

  if (sequence.length) {
    prepareWorkoutSequence(sequence);
  }
});

function prepareWorkoutSequence(sequence) {
  // Remove final rest period if last item is a rest
  if (sequence.length && sequence[sequence.length - 1].type === 'rest') {
    sequence.pop();
  }
  sessionStartTime = new Date().toISOString();
  sessionId = `WKS-${Date.now()}`;
  workoutSequence = sequence;
  currentStepIndex = 0;
  workoutModal.classList.remove('modal-hidden');
  workoutTitle.textContent = 'Starting Soon';
  workoutTimerDisplay.textContent = '00:10';
  workoutCurrent.textContent = `Get Ready!`;
  workoutNext.textContent = `First: ${sequence[0]?.name || ''}`;

  // Remove any previous estimated time display
  const oldEst = document.getElementById('workout-est-time');
  if (oldEst) oldEst.remove();
  // Compute total estimated time and show under Start Workout button
  const totalTime = sequence.reduce((sum, s) => sum + (s.type === 'exercise'
    ? parseInt(document.getElementById('work-duration')?.value || '60')
    : parseInt(document.getElementById('rest-duration')?.value || '120')
  ), 0);
  const estDisplay = document.createElement('div');
  estDisplay.id = 'workout-est-time';
  estDisplay.style.fontSize = '0.7rem';
  estDisplay.style.marginTop = '4px';
  estDisplay.textContent = `⏳ Estimated Total Time: ${(totalTime / 60).toFixed(1)} min`;
  document.querySelector('.workout-header')?.appendChild(estDisplay);

  // 10-second audible countdown before workout starts
  let countdown = 10;
  const prepInterval = setInterval(() => {
    workoutTimerDisplay.textContent = `00:${String(countdown).padStart(2, '0')}`;
    playBeep();
    countdown--;
    if (countdown < 0) {
      clearInterval(prepInterval);
      runWorkoutStep();
    }
  }, 1000);
}

function runWorkoutStep() {
  // --- Modal UI additions: time left, completed/upcoming lists ---
  const modalDiv = workoutModal.querySelector('.modal');
  // Add time left display if not present
  let timeLeftDiv = document.getElementById('workout-time-left');
  if (!timeLeftDiv && modalDiv) {
    timeLeftDiv = document.createElement('div');
    timeLeftDiv.id = 'workout-time-left';
    timeLeftDiv.style.position = 'absolute';
    timeLeftDiv.style.top = '10px';
    timeLeftDiv.style.left = '10px';
    timeLeftDiv.style.fontSize = '0.85rem';
    timeLeftDiv.style.color = '#00e5ff';
    timeLeftDiv.style.textShadow = '0 0 8px #00e5ff';
    modalDiv.insertBefore(timeLeftDiv, modalDiv.firstChild);
  }
  // Add completed and upcoming lists if not present
  let doneList = document.getElementById('completed-steps-list');
  let upcomingList = document.getElementById('upcoming-steps-list');
  if (!doneList && modalDiv) {
    doneList = document.createElement('ul');
    doneList.id = 'completed-steps-list';
    doneList.style.fontSize = '0.6rem';
    doneList.style.overflowY = 'auto';
    doneList.style.maxHeight = '100px';
    doneList.style.marginBottom = '8px';
    modalDiv.insertBefore(doneList, timeLeftDiv?.nextSibling || modalDiv.firstChild);
  }
  if (!upcomingList && modalDiv) {
    upcomingList = document.createElement('ul');
    upcomingList.id = 'upcoming-steps-list';
    upcomingList.style.fontSize = '0.6rem';
    upcomingList.style.overflowY = 'auto';
    upcomingList.style.maxHeight = '100px';
    upcomingList.style.marginTop = '8px';
    modalDiv.appendChild(upcomingList);
  }
  // Always update both lists
  if (doneList && upcomingList) {
    doneList.innerHTML = '';
    upcomingList.innerHTML = '';
    workoutSequence.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = s.type === 'exercise'
        ? `${s.name} Set ${s.setIndex + 1}`
        : `Rest ${s.duration || parseInt(document.getElementById('rest-duration')?.value || '120')}s`;
      if (i < currentStepIndex) doneList.appendChild(li);
      else if (i >= currentStepIndex) upcomingList.appendChild(li);
    });
  }
  // Compute time left and show in timeLeftDiv
  if (timeLeftDiv) {
    const timeLeft = workoutSequence.slice(currentStepIndex).reduce((sum, s) => sum + (
      s.type === 'exercise'
        ? parseInt(document.getElementById('work-duration')?.value || '60')
        : s.duration || parseInt(document.getElementById('rest-duration')?.value || '120')
    ), 0);
    timeLeftDiv.textContent = `Time Left: ${(timeLeft / 60).toFixed(1)} min`;
  }

  if (currentStepIndex >= workoutSequence.length) {
    const workoutEndTime = new Date().toISOString();
    const sessionLogEntry = {
      sessionId,
      start: sessionStartTime,
      end: workoutEndTime,
      totalWorkSeconds: workoutSequence.filter(s => s.type === 'exercise').length * parseInt(document.getElementById('work-duration')?.value || '60'),
      totalRestSeconds: workoutSequence.filter(s => s.type === 'rest').length * parseInt(document.getElementById('rest-duration')?.value || '120'),
      totalSetsCompleted: workoutSequence.filter(s => s.type === 'exercise').length,
      completed: true
    };
    const data = getFitnessData();
    if (!Array.isArray(data.sessionLog)) data.sessionLog = [];
    data.sessionLog.push(sessionLogEntry);
    saveFitnessData(data);
    workoutModal.classList.add('modal-hidden');
    alert('Workout complete!');
    return;
  }

  const step = workoutSequence[currentStepIndex];
  const next = workoutSequence[currentStepIndex + 1];

  if (step.type === 'exercise') {
    const valid = step.reps && step.weight;
    if (!valid) {
      alert(`Please enter reps and weight for ${step.name}`);
      return;
    }
    workoutModal.classList.remove('resting');
    workoutTitle.textContent = 'Exercise';
    workoutCurrent.textContent = `${step.name} - Set ${step.setIndex + 1} @ ${step.weight}lbs for ${step.reps} reps`;
    // Show next actual exercise, skipping over rest intervals
    const nextExercise = workoutSequence.slice(currentStepIndex + 1).find(s => s.type === 'exercise');
    workoutNext.textContent = nextExercise
      ? `Next: ${nextExercise.name} - Set ${nextExercise.setIndex + 1}`
      : 'Next: —';
    const workDuration = parseInt(document.getElementById('work-duration')?.value || '60');
    startCountdown(workDuration, () => {
      // Automatically verify/log the set after work timer countdown finishes
      const confirmed = confirm(`Log set ${step.setIndex + 1} of ${step.name}:\n${step.reps} reps @ ${step.weight} lbs?\nClick Cancel to update values.`);
      let actualReps = step.reps;
      let actualWeight = step.weight;

      if (!confirmed) {
        actualReps = prompt(`Enter actual reps for ${step.name}:`, step.reps) || step.reps;
        actualWeight = prompt(`Enter actual weight for ${step.name}:`, step.weight) || step.weight;
      }

      const data = getFitnessData();
      data.exercises.entries.push({
        type: step.name,
        reps: parseInt(actualReps),
        sets: 1,
        weight: parseFloat(actualWeight),
        timestamp: new Date().toISOString(),
        description: 'Workout Timer',
        workDuration: parseInt(document.getElementById('work-duration')?.value || '60'),
        restDuration: parseInt(document.getElementById('rest-duration')?.value || '120'),
        setIndex: step.setIndex,
        workoutSessionStart: sessionStartTime,
        workoutSessionId: sessionId
      });
      saveFitnessData(data);

      currentStepIndex++;
      runWorkoutStep();
    });
  } else if (step.type === 'rest') {
    workoutModal.classList.add('resting');
    workoutTitle.textContent = 'Rest';
    workoutCurrent.textContent = '';
    workoutNext.textContent = `Next: ${next?.name || 'Exercise'}`;
    startCountdown(step.duration, () => {
      // 10 second count-in before next set
      let prep = 10;
      workoutTitle.textContent = 'Prepare';
      workoutCurrent.textContent = `Get Ready for: ${next?.name || 'Exercise'}`;
      const prepInterval = setInterval(() => {
        workoutTimerDisplay.textContent = `00:${String(prep).padStart(2, '0')}`;
        playBeep();
        prep--;
        if (prep < 0) {
          clearInterval(prepInterval);
          currentStepIndex++;
          runWorkoutStep();
        }
      }, 1000);
    });
  }
}

function startCountdown(seconds, onComplete) {
  let time = seconds;
  workoutTimerDisplay.textContent = `00:${String(time).padStart(2, '0')}`;
  if (workoutTimerInterval) clearInterval(workoutTimerInterval);
  workoutTimerInterval = setInterval(() => {
    if (!paused) {
      time--;
      workoutTimerDisplay.textContent = `00:${String(time).padStart(2, '0')}`;
      if (time <= 10) playBeep();
      if (time <= 0) {
        clearInterval(workoutTimerInterval);
        workoutTimerInterval = null;
        onComplete();
        // --- Update exercise and set lists after workout completion ---
        // Only call after the final runWorkoutStep() (i.e., after workout completion)
        if (typeof displayRecentExercises === 'function') displayRecentExercises();
        const workoutSetList = document.getElementById('workout-set-items');
        if (workoutSetList) workoutSetList.innerHTML = '';
      }
    }
  }, 1000);
}
// --- Workout Beep Function ---
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // high pitch
    gain.gain.setValueAtTime(0.2, ctx.currentTime);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
  } catch (err) {
    console.warn('AudioContext error:', err);
  }
}

document.getElementById('start-timer-button')?.addEventListener('click', () => {
  paused = false;
  if (!workoutTimerInterval) {
    runWorkoutStep();
  }
});

document.getElementById('pause-timer-button')?.addEventListener('click', () => {
  paused = !paused;
});

// --- Add Cancel Workout Button ---
// This code runs once DOM is loaded, but we must ensure the modal exists.
window.addEventListener('DOMContentLoaded', () => {
  const workoutModal = document.getElementById('workout-timer-modal');
  if (workoutModal) {
    // Only add if not already present (prevent duplicates)
    if (!document.getElementById('cancel-workout-button')) {
      const cancelWorkoutButton = document.createElement('button');
      cancelWorkoutButton.textContent = 'Cancel Workout';
      cancelWorkoutButton.id = 'cancel-workout-button';
      cancelWorkoutButton.className = 'modal-close';
      // Place after verify-set-button
      const modalDiv = workoutModal.querySelector('.modal');
      if (modalDiv) {
        modalDiv.appendChild(cancelWorkoutButton);
      }
      cancelWorkoutButton?.addEventListener('click', () => {
        // Save progress up to the currentStepIndex
        const completed = workoutSequence.slice(0, currentStepIndex).filter(s => s.type === 'exercise');
        const data = getFitnessData();
        completed.forEach(step => {
          data.exercises.entries.push({
            type: step.name,
            reps: parseInt(step.reps),
            sets: 1,
            weight: parseFloat(step.weight),
            timestamp: new Date().toISOString(),
            description: 'Canceled Workout'
          });
        });
        // Session log for canceled workout
        const workoutEndTime = new Date().toISOString();
        const sessionLogEntry = {
          sessionId,
          start: sessionStartTime,
          end: workoutEndTime,
          totalWorkSeconds: completed.length * parseInt(document.getElementById('work-duration')?.value || '60'),
          totalRestSeconds: (currentStepIndex - completed.length) * parseInt(document.getElementById('rest-duration')?.value || '120'),
          totalSetsCompleted: completed.length,
          completed: false
        };
        if (!Array.isArray(data.sessionLog)) data.sessionLog = [];
        data.sessionLog.push(sessionLogEntry);
        saveFitnessData(data);
        displayRecentExercises();

        // Close the modal and reset state
        workoutModal.classList.add('modal-hidden');
        if (workoutTimerInterval) clearInterval(workoutTimerInterval);
        workoutTimerInterval = null;
        workoutSequence = [];
        currentStepIndex = 0;
        alert('Workout canceled. Progress so far has been saved.');
      });
    }
  }
});
const WALLET_WHITELIST = [
  "0x807061df657a7697c04045da7d16d941861caabc", // Add real wallet addresses here
];

// --- Snapshot helper functions ---
const LAST_SNAPSHOT_KEY = 'lastAutoSnapshotDate';

function shouldTakeSnapshotToday() {
  const lastDate = localStorage.getItem(LAST_SNAPSHOT_KEY);
  const today = new Date().toISOString().split('T')[0];
  return lastDate !== today;
}

function markSnapshotTakenToday() {
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem(LAST_SNAPSHOT_KEY, today);
}

window.addEventListener('DOMContentLoaded', async () => {
  // --- Correlation Graph Modal ---
  document.getElementById('graph-icon')?.addEventListener('click', () => {
    showModal('correlation-graph-modal');
  });

  // Updated modal close logic for correlation graph modal
  const closeCorrGraphModal = document.querySelector('#correlation-graph-modal .modal-close');
  if (closeCorrGraphModal) {
    closeCorrGraphModal.addEventListener('click', () => {
      hideModal('correlation-graph-modal');
    });
  }

  document.getElementById('graph-data-select')?.addEventListener('change', () => {
    const selected = Array.from(document.getElementById('graph-data-select').selectedOptions).map(opt => opt.value);
    const ctx = document.getElementById('correlationChart').getContext('2d');
    const data = getFitnessData();

    const datasets = [];

    selected.forEach(type => {
      let entries = [];

      if (type === 'weight') {
        entries = data.weightLogs.map(e => ({ x: new Date(e.timestamp), y: parseFloat(e.weight) }));
      } else if (type.includes(':')) {
        const [exerciseType, field] = type.split(':');
        if (['reps', 'weight'].includes(field)) {
          entries = data.exercises.entries
            .filter(e => e.type === exerciseType)
            .map(e => ({
              x: new Date(e.timestamp),
              y: parseFloat(e[field])
            }));
        }
      } else if (data.measurements?.some(m => m.type === type)) {
        entries = data.measurements.filter(m => m.type === type).map(m => ({
          x: new Date(`${m.date}T${m.time}`),
          y: parseFloat(m.measurement)
        }));
      }

      datasets.push({
        label: type,
        data: entries,
        borderColor: `hsl(${Math.random() * 360}, 100%, 70%)`,
        backgroundColor: 'transparent',
        tension: 0.3
      });
    });

    if (window._correlationChart) window._correlationChart.destroy();
    window._correlationChart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        scales: {
          x: { type: 'time', title: { display: true, text: 'Time' } },
          y: { beginAtZero: true, title: { display: true, text: 'Value' } }
        }
      }
    });
  });
  // --- IPFS Icon Hover Popup ---
  const ipfsWrapper = document.getElementById('ipfsIconWrapper');
  const ipfsPopup = document.getElementById('ipfsHoverPopup');

  // Snapshot popup: show all snapshots (no pagination)
  function renderSnapshotPopup() {
    // Load snapshot history from latest snapshot's embedded snapshotHistory
    const latestKey = Object.keys(localStorage)
      .filter(k => k.startsWith('fitnessTrackerSnapshot-'))
      .sort()
      .reverse()[0];
    let history = [];
    if (latestKey) {
      const latestSnapshot = JSON.parse(localStorage.getItem(latestKey));
      history = (latestSnapshot?.data?.snapshotHistory || []).map(entry => {
        if (typeof entry === 'string') {
          return { cid: entry, timestamp: '' };
        }
        return entry;
      });
      // Include current snapshot CID
      if (latestSnapshot?.cid) {
        history.unshift({ cid: latestSnapshot.cid, timestamp: latestKey.split('fitnessTrackerSnapshot-')[1] });
      }
    }
    const today = new Date().toISOString().split('T')[0];

    // Show only the latest 7 snapshots
    ipfsPopup.innerHTML = history.slice(0, 7).map(h => {
      const date = h.timestamp
        ? new Date(h.timestamp).toLocaleString()
        : '(No timestamp)';
      const isToday = h.timestamp && h.timestamp.startsWith(today);
      const colorClass = isToday ? 'snapshot-today' : 'snapshot-old';
      const prefix = h.cid.slice(0, 6);
      const suffix = h.cid.slice(-4);
      const ipfsIcons = `<img src="img/IPFS_Logo.png" style="width:10px;height:10px;">`.repeat(4);
      const shortCid = `${prefix}${ipfsIcons}${suffix}`;
      return `<div class="${colorClass}">
        <strong>${date}</strong><br>
        <a href="https://${h.cid}.ipfs.w3s.link/" target="_blank" style="text-decoration:none;color:inherit;">
          ${shortCid}
        </a>
      </div>`;
    }).join('<hr style="opacity:0.3;">')
      + '<div style="text-align:center;margin-top:8px;">'
      + '<button id="show-all-snapshots-btn" style="font-size:0.6rem;background:#00e5ff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;">Show All</button>'
      + ' <button id="import-snapshot-btn" style="font-size:0.6rem;background:#ff00cc;color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;">📥 Import</button>'
      + '</div>';
    // (Optional: consider pagination if history.length > X in the future)
  }

  ipfsWrapper?.addEventListener('mouseenter', () => {
    renderSnapshotPopup();
    ipfsPopup.style.display = 'block';
  });

  ipfsWrapper?.addEventListener('mouseleave', () => {
    ipfsPopup.style.display = 'none';
  });

  // Keep popup open when mouse enters popup, close on leave
  ipfsPopup?.addEventListener('mouseenter', () => {
    ipfsPopup.style.display = 'block';
  });
  ipfsPopup?.addEventListener('mouseleave', () => {
    ipfsPopup.style.display = 'none';
  });

  document.body.addEventListener('click', (e) => {
    if (e.target.id === 'show-all-snapshots-btn') {
      showAllSnapshotsModal();
    }
    if (e.target.id === 'import-snapshot-btn') {
      ipfsPopup.style.display = 'none';
      showImportSnapshotModal();
    }
  });

  function showAllSnapshotsModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(0,0,0,0.8)';
    modal.style.zIndex = '10000';

    const content = document.createElement('div');
    content.className = 'modal';
    content.style.maxHeight = '80vh';
    content.style.overflowY = 'auto';
    content.style.maxWidth = '600px';
    content.style.padding = '1rem';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'modal-close';
    closeBtn.onclick = () => {
      document.body.removeChild(modal);
      document.body.classList.remove('modal-active');
    };
    content.appendChild(closeBtn);

    const allSnapshots = JSON.parse(localStorage.getItem('snapshotHistory') || '[]');
    let currentPage = 0;
    const pageSize = 10;
    const totalPages = Math.ceil(allSnapshots.length / pageSize);

    const renderPage = () => {
      content.querySelectorAll('.snapshot-item, .snapshot-nav').forEach(e => e.remove());
      const start = currentPage * pageSize;
      const page = allSnapshots.slice(start, start + pageSize);

      page.forEach(h => {
        const div = document.createElement('div');
        div.className = 'snapshot-item';
        const date = h.timestamp ? new Date(h.timestamp).toLocaleString() : '(No timestamp)';
        const shortCid = `${h.cid.slice(0, 6)}...${h.cid.slice(-4)}`;
        div.innerHTML = `<strong>${date}</strong><br><a href="https://${h.cid}.ipfs.w3s.link/" target="_blank" style="text-decoration:none;color:inherit;">${shortCid}</a>`;
        div.style.margin = '8px 0';
        content.appendChild(div);
      });

      const nav = document.createElement('div');
      nav.className = 'snapshot-nav';
      nav.style.textAlign = 'center';
      nav.style.marginTop = '1rem';

      const first = document.createElement('button');
      first.textContent = '⏮️';
      first.onclick = () => { currentPage = 0; renderPage(); };

      const prev = document.createElement('button');
      prev.textContent = '◀️';
      prev.disabled = currentPage === 0;
      prev.onclick = () => { if (currentPage > 0) { currentPage--; renderPage(); } };

      const next = document.createElement('button');
      next.textContent = '▶️';
      next.disabled = currentPage >= totalPages - 1;
      next.onclick = () => { if (currentPage < totalPages - 1) { currentPage++; renderPage(); } };

      const last = document.createElement('button');
      last.textContent = '⏭️';
      last.onclick = () => { currentPage = totalPages - 1; renderPage(); };

      [first, prev, ...Array.from({length: totalPages}, (_, i) => {
        const btn = document.createElement('button');
        btn.textContent = (i + 1).toString();
        btn.disabled = i === currentPage;
        btn.onclick = () => { currentPage = i; renderPage(); };
        return btn;
      }), next, last].forEach(b => {
        b.style.margin = '0 3px';
        nav.appendChild(b);
      });

      content.appendChild(nav);
    };

    renderPage();

    // Show imported snapshot CIDs at the bottom
    const importedList = JSON.parse(localStorage.getItem('importedSnapshotCIDs') || '[]');
    if (importedList.length > 0) {
      const importedSection = document.createElement('div');
      importedSection.style.cssText = 'margin-top:1.5rem;border-top:1px solid rgba(0,229,255,0.2);padding-top:1rem;';
      const importedTitle = document.createElement('h4');
      importedTitle.style.cssText = 'color:#ff00cc;font-size:0.85rem;margin:0 0 0.5rem;';
      importedTitle.textContent = '📥 Imported Snapshots';
      importedSection.appendChild(importedTitle);
      importedList.forEach(entry => {
        const row = document.createElement('div');
        row.style.cssText = 'margin:4px 0;font-size:0.75rem;';
        const date = entry.importedAt ? new Date(entry.importedAt).toLocaleString() : '';
        const short = `${entry.cid.slice(0, 6)}...${entry.cid.slice(-4)}`;
        row.innerHTML = `<span style="color:#aaa;">${date}</span> — <a href="https://${entry.cid}.ipfs.w3s.link/" target="_blank" style="color:#ff00cc;">${short}</a>`;
        importedSection.appendChild(row);
      });
      content.appendChild(importedSection);
    }

    modal.appendChild(content);
    document.body.appendChild(modal);
    document.body.classList.add('modal-active');
  }

  function showImportSnapshotModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'import-snapshot-modal';

    const content = document.createElement('div');
    content.className = 'modal';
    content.style.maxWidth = '500px';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'modal-close';
    closeBtn.onclick = () => {
      document.body.removeChild(modal);
      document.body.classList.remove('modal-active');
    };
    content.appendChild(closeBtn);

    const header = document.createElement('h3');
    header.style.cssText = 'color:#00e5ff;margin-top:0;';
    header.textContent = '📥 Import Past IPFS Snapshot';
    content.appendChild(header);

    const desc = document.createElement('p');
    desc.style.cssText = 'font-size:0.85rem;color:#ccc;';
    desc.textContent = 'Enter a snapshot CID to fetch historical data from IPFS and merge it into your current dataset. Duplicate entries (same timestamp) will not be added twice.';
    content.appendChild(desc);

    const inputGroup = document.createElement('div');
    inputGroup.style.cssText = 'margin:1rem 0;';
    inputGroup.innerHTML = `
      <label for="import-cid-input" style="display:block;margin-bottom:0.4rem;font-size:0.85rem;">IPFS CID:</label>
      <input id="import-cid-input" type="text" placeholder="bafyrei..."
        style="width:100%;box-sizing:border-box;padding:8px;background:#000030;color:#fff;border:1px solid #00e5ff;border-radius:6px;font-size:0.85rem;" />
    `;
    content.appendChild(inputGroup);

    const feedback = document.createElement('div');
    feedback.id = 'import-feedback';
    feedback.style.cssText = 'min-height:2rem;font-size:0.8rem;margin-bottom:0.5rem;';
    content.appendChild(feedback);

    const importBtn = document.createElement('button');
    importBtn.id = 'import-cid-btn';
    importBtn.textContent = 'Import & Merge';
    importBtn.style.cssText = 'background:#00e5ff;color:#000;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;';
    content.appendChild(importBtn);

    // Show previously imported CID history
    const importedList = JSON.parse(localStorage.getItem('importedSnapshotCIDs') || '[]');
    if (importedList.length > 0) {
      const historyDiv = document.createElement('div');
      historyDiv.style.cssText = 'margin-top:1.5rem;border-top:1px solid rgba(0,229,255,0.2);padding-top:1rem;';
      const histTitle = document.createElement('h4');
      histTitle.style.cssText = 'color:#00e5ff;font-size:0.85rem;margin:0 0 0.5rem;';
      histTitle.textContent = 'Previously Imported CIDs';
      historyDiv.appendChild(histTitle);
      importedList.slice(0, 10).forEach(entry => {
        const row = document.createElement('div');
        row.style.cssText = 'margin:4px 0;font-size:0.75rem;';
        const date = entry.importedAt ? new Date(entry.importedAt).toLocaleString() : '';
        const short = `${entry.cid.slice(0, 6)}...${entry.cid.slice(-4)}`;
        row.innerHTML = `<span style="color:#aaa;">${date}</span> — <a href="https://${entry.cid}.ipfs.w3s.link/" target="_blank" style="color:#00e5ff;">${short}</a>`;
        historyDiv.appendChild(row);
      });
      content.appendChild(historyDiv);
    }

    modal.appendChild(content);
    document.body.appendChild(modal);
    document.body.classList.add('modal-active');

    const cidInput = content.querySelector('#import-cid-input');
    importBtn.addEventListener('click', async () => {
      const cid = cidInput.value.trim();
      if (!cid) {
        feedback.textContent = '⚠️ Please enter a CID.';
        feedback.style.color = '#ffcc00';
        return;
      }

      feedback.textContent = '⏳ Fetching from IPFS…';
      feedback.style.color = '#00e5ff';
      importBtn.disabled = true;

      try {
        const result = await importAndMergeFromCID(cid);
        const { added } = result;
        feedback.innerHTML = `✅ Merged successfully!<br>
          Added: ${added.weightLogs} weight log(s), ${added.exercises} exercise entry(s), ${added.sessionLog} session(s).<br>
          <em style="color:#aaa;">Reload the page to see all merged data.</em>`;
        feedback.style.color = '#00ff99';
        cidInput.value = '';
        importBtn.disabled = false;

        setTimeout(() => {
          if (confirm('Import successful! Reload the page to see all merged data?')) {
            window.location.reload();
          }
        }, 500);
      } catch (err) {
        feedback.textContent = `❌ ${err.message}`;
        feedback.style.color = '#ff4444';
        importBtn.disabled = false;
      }
    });
  }
  // Removed pagination navigation for snapshot popup (all snapshots always shown)
  // --- Measurement Chart Logic ---
  const measurementChartCtx = document.getElementById('measurement-chart')?.getContext('2d');
  let measurementChart = null;

  if (measurementChartCtx) {
    // eslint-disable-next-line no-undef
    measurementChart = new Chart(measurementChartCtx, {
      type: 'line',
      data: {
        datasets: []
      },
      options: {
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              displayFormats: {
                day: 'MMM d'
              },
              tooltipFormat: 'MMM d, h:mm a'
            },
            ticks: {
              source: 'auto',
              autoSkip: false
            }
          },
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  const chartSelect = document.getElementById('measurement-chart-select');
  if (chartSelect) {
    chartSelect.addEventListener('change', () => {
      loadMeasurementChart(chartSelect.value);
    });
  }

  function loadMeasurementChart(selectedType = 'all') {
    const data = getFitnessData();
    const measurements = data.measurements || [];
    const grouped = {};

    measurements.forEach(entry => {
      if (!grouped[entry.type]) grouped[entry.type] = [];
      grouped[entry.type].push({
        x: new Date(`${entry.date}T${entry.time || '00:00'}`),
        y: parseFloat(entry.measurement)
      });
    });

    const datasets = [];

    if (selectedType === 'all') {
      Object.entries(grouped).forEach(([type, entries]) => {
        datasets.push({
          label: type,
          data: entries,
          borderColor: getColorForType(type),
          backgroundColor: 'rgba(255,255,255,0.05)',
          tension: 0.4
        });
      });
    } else if (grouped[selectedType]) {
      datasets.push({
        label: selectedType,
        data: grouped[selectedType],
        borderColor: getColorForType(selectedType),
        backgroundColor: 'rgba(255,255,255,0.05)',
        tension: 0.4
      });
    }

    if (measurementChart) {
      measurementChart.data.datasets = datasets;
      // Update Chart.js options for x axis to match body weight chart
      measurementChart.options.scales.x = {
        type: 'time',
        time: {
          unit: 'day',
          displayFormats: {
            day: 'MMM d'
          },
          tooltipFormat: 'MMM d, h:mm a'
        },
        ticks: {
          source: 'auto',
          autoSkip: false
        }
      };
      measurementChart.update();
    }

    // Measurement chart toggle buttons setup
    const toggle = document.getElementById('measurement-chart-toggle');
    if (toggle) {
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);
      newToggle.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const range = btn.textContent.toLowerCase(); // 'day', 'month', etc.
          const data = getFitnessData();
          const now = new Date();
          let cutoff = new Date();

          if (range === 'day') cutoff.setDate(now.getDate() - 1);
          if (range === 'month') cutoff.setDate(now.getDate() - 30);
          if (range === 'year') cutoff.setDate(now.getDate() - 365);
          if (range === 'max') cutoff = new Date(0); // all time

          const filteredMeasurements = data.measurements.filter(entry => {
            const ts = new Date(`${entry.date}T${entry.time || '00:00'}`);
            return ts >= cutoff;
          });

          const grouped = {};
          filteredMeasurements.forEach(entry => {
            if (!grouped[entry.type]) grouped[entry.type] = [];
            grouped[entry.type].push({
              x: new Date(`${entry.date}T${entry.time || '00:00'}`),
              y: parseFloat(entry.measurement)
            });
          });

          const datasets = [];
          if (chartSelect.value === 'all') {
            Object.entries(grouped).forEach(([type, entries]) => {
              datasets.push({
                label: type,
                data: entries,
                borderColor: getColorForType(type),
                backgroundColor: 'rgba(255,255,255,0.05)',
                tension: 0.4
              });
            });
          } else if (grouped[chartSelect.value]) {
            datasets.push({
              label: chartSelect.value,
              data: grouped[chartSelect.value],
              borderColor: getColorForType(chartSelect.value),
              backgroundColor: 'rgba(255,255,255,0.05)',
              tension: 0.4
            });
          }

          if (measurementChart) {
            measurementChart.data.datasets = datasets;
            measurementChart.update();
          }
        });
      });
    }
  }

  function getColorForType(type) {
    const colors = {
      Bicep: '#00e5ff',
      Chest: '#ff3d3d',
      Waist: '#aa00ff',
      Thigh: '#00ffcc',
      Calf: '#ffff00'
    };
    return colors[type] || '#ffffff';
  }

  loadMeasurementChart('all');
// --- Measurements Modal Logic ---
const measurementForm = document.getElementById('measurement-form');
const measurementTypeSelect = document.getElementById('measurement-type');
const measurementDateInput = document.getElementById('measurement-date');

if (measurementDateInput) {
  const today = new Date().toISOString().split('T')[0];
  measurementDateInput.value = today;
}

if (measurementForm) {
  // Add new type to dropdown if selected
  measurementTypeSelect?.addEventListener('change', () => {
    if (measurementTypeSelect.value === 'add-new') {
      const newType = prompt('Enter a new measurement type:');
      if (
        newType &&
        newType.trim() !== '' &&
        !Array.from(measurementTypeSelect.options).some(opt => opt.value === newType)
      ) {
        // Insert new option before add-new
        const opt = document.createElement('option');
        opt.value = newType;
        opt.textContent = newType;
        measurementTypeSelect.insertBefore(opt, measurementTypeSelect.querySelector('option[value="add-new"]'));
        measurementTypeSelect.value = newType;
      } else {
        measurementTypeSelect.value = ''; // Reset if invalid or cancelled
      }
    }
  });

  measurementForm.addEventListener('submit', e => {
    e.preventDefault();
    const type = measurementTypeSelect.value;
    const measurement = parseFloat(document.getElementById('measurement').value);
    const date = document.getElementById('measurement-date').value;
    const time = document.getElementById('measurement-time').value;
    // Optionally: description field in the future
    const data = getFitnessData();
    if (!Array.isArray(data.measurements)) data.measurements = [];
    data.measurements.push({ type, measurement, date, time });
    saveFitnessData(data);
    measurementForm.reset();
    if (measurementDateInput) {
      const today = new Date().toISOString().split('T')[0];
      measurementDateInput.value = today;
    }
    // Update measurement chart
    if (typeof loadMeasurementChart === 'function') {
      loadMeasurementChart(document.getElementById('measurement-chart-select')?.value || 'all');
    }
    // Optionally close modal or provide feedback
  });
}
  const walletButton = document.getElementById('wallet-connect');
  const footer = document.querySelector('footer');
  const walletDisplay = document.getElementById('wallet-display');

  function shortenAddress(addr) {
    // Show full 0x prefix
    const prefix = addr.slice(0, 6); // '0x1234'
    const suffix = addr.slice(-4);
    return `${prefix}
      <img src="img/Ens_Eth_Breathe.png" class="wallet-icon" />
      <img src="img/Ens_Eth_Breathe.png" class="wallet-icon" />
      <img src="img/Ens_Eth_Breathe.png" class="wallet-icon" />
      <img src="img/Ens_Eth_Breathe.png" class="wallet-icon" />
    ${suffix}`;
  }

  async function connectWallet(preAuthorizedAccount = null) {
    if (typeof window.ethereum !== 'undefined') {
      try {
        let account;
        if (preAuthorizedAccount) {
          account = preAuthorizedAccount;
        } else {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          account = accounts[0];
        }
        if (!account || typeof account !== 'string') return;
        walletButton.classList.remove('disconnected');
        walletButton.classList.add('connected');
        walletButton.title = `Connected: ${account}`;
        window._connectedAccount = account;
        console.log(`Connected to ${account}`);

        if (WALLET_WHITELIST.includes(account.toLowerCase())) {
          footer.style.display = 'flex';
        } else {
          footer.style.display = 'none';
          alert('This wallet is not whitelisted.');
        }

        // walletDisplay.innerHTML = shortenAddress(account);

        // --- Wallet ticker circle animation ---
        const walletTicker = document.getElementById('wallet-ticker-circle');
        walletTicker.innerHTML = '';
        const prefix = account.slice(2, 8);
        const suffix = account.slice(-4);
        [...prefix].forEach(char => {
          const span = document.createElement('span');
          span.classList.add('ticker-letter');
          span.textContent = char;
          walletTicker.appendChild(span);
        });
        for (let i = 0; i < 4; i++) {
          const img = document.createElement('img');
          img.classList.add('ticker-letter');
          img.src = 'img/Ens_Eth_Breathe.png';
          img.style.width = '12px';
          img.style.height = '12px';
          walletTicker.appendChild(img);
        }
        [...suffix].forEach(char => {
          const span = document.createElement('span');
          span.classList.add('ticker-letter');
          span.textContent = char;
          walletTicker.appendChild(span);
        });

        function positionWalletLetters() {
          const letters = walletTicker.querySelectorAll('.ticker-letter');
          const centerX = 65;
          const centerY = 65;
          const radius = 54;
          const angleStep = (2 * Math.PI) / letters.length;
          letters.forEach((letter, index) => {
            const angle = index * angleStep;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            letter.style.left = `${x}px`;
            letter.style.top = `${y}px`;
          });
        }
        positionWalletLetters();

        function animateWalletTicker() {
          let angle = 0;
          function rotate() {
            walletTicker.style.transform = `rotate(${angle}deg)`;
            angle += 0.2;
            requestAnimationFrame(rotate);
          }
          rotate();
        }
        animateWalletTicker();

        // Show current weight display and update it once wallet is connected
        document.getElementById('current-weight-display').style.display = 'block';
        displayCurrentWeight();

        // On auto-connect (page reload), attempt silent restore only.
        // On user-initiated connect, allow full email login flow.
        const result = preAuthorizedAccount
          ? await tryAutoRestoreW3upClient()
          : await connectW3upClient();
        
        if (result) {
           console.log("Web3.Storage space DID:", result.spaceDid);
           const status = document.getElementById("ipfs-status");
           status.style.display = "block";
           const ipfsIconEl = document.getElementById("ipfsIcon");
           if (ipfsIconEl) ipfsIconEl.style.display = "inline-block";

           // Dynamic DID key animation characters (new ticker circle)
           const did = result.spaceDid;
           const prefix = did.slice(8, 14);
           const suffix = did.slice(-4);
           const tickerCircle = document.getElementById('ticker-circle');
           tickerCircle.innerHTML = '';

           [...prefix].forEach(char => {
             const span = document.createElement('span');
             span.classList.add('ticker-letter');
             span.textContent = char;
             tickerCircle.appendChild(span);
           });
           for (let i = 0; i < 4; i++) {
             const img = document.createElement('img');
             img.classList.add('ticker-letter');
             img.src = 'img/IPFS_Logo.png';
             img.style.width = '12px';
             img.style.height = '12px';
             tickerCircle.appendChild(img);
           }
           [...suffix].forEach(char => {
             const span = document.createElement('span');
             span.classList.add('ticker-letter');
             span.textContent = char;
             tickerCircle.appendChild(span);
           });

           // Add "* ⚸ *" to the end of the ticker
           const star1 = document.createElement('span');
           star1.classList.add('ticker-letter');
           star1.textContent = '*';
           tickerCircle.appendChild(star1);

           const shakti = document.createElement('span');
           shakti.classList.add('ticker-letter');
           shakti.textContent = '⚸';
           tickerCircle.appendChild(shakti);

           const star2 = document.createElement('span');
           star2.classList.add('ticker-letter');
           star2.textContent = '*';
           tickerCircle.appendChild(star2);

           // Position letters (recentered snake on IPFS icon with logo-aligned origin)
           function positionLetters() {
             const letters = document.querySelectorAll('.ticker-letter');
             const tickerWrapper = document.querySelector('.ticker-wrapper');
             const wrapperRect = tickerWrapper.getBoundingClientRect();
             const centerX = wrapperRect.width / 2;  // small X offset tweak
             const centerY = wrapperRect.height / 2; // small Y offset tweak
             const radius = 54;
             const angleStep = (2 * Math.PI) / letters.length;

             letters.forEach((letter, index) => {
               const angle = index * angleStep;
               const x = centerX + radius * Math.cos(angle);
               const y = centerY + radius * Math.sin(angle);
               letter.style.left = `${x}px`;
               letter.style.top = `${y}px`;
             });
           }
           positionLetters();

           // Animate circle
           function animateTicker() {
             let angle = 0;
             function rotate() {
               tickerCircle.style.transform = `rotate(${angle}deg)`;
               angle += 0.2;
               requestAnimationFrame(rotate);
             }
             rotate();
           }
           animateTicker();
          
           // Add IPFS upload click listener after icon is shown
           const ipfsIcon = document.getElementById("ipfsIcon");
           if (ipfsIcon && !ipfsIcon._ipfsListenerAdded) {
             ipfsIcon.addEventListener("click", async () => {
               const data = getFitnessData();
               const cid = await uploadDataToIPFS(data, result.client);
               if (cid) {
                 alert(`Snapshot uploaded to IPFS.\nCID:\n${cid}`);
                 console.log("Uploaded CID:", cid);
               } else {
                 alert("Upload failed.");
               }
             });
             ipfsIcon._ipfsListenerAdded = true;
           }

           // --- Snapshot catch-up logic: check if we missed today's snapshot
           if (result?.client) {
             // Check if we missed today's snapshot
             if (shouldTakeSnapshotToday()) {
               const data = getFitnessData();
               const cid = await uploadDataToIPFS(data, result.client);
               if (cid) {
                 console.log("📦 Catch-up snapshot uploaded:", cid);
                 markSnapshotTakenToday();
               }
             }
           }

           // Auto snapshot at midnight
           function scheduleMidnightSnapshot(client) {
             if (!client) return;

             const now = new Date();
             const nextMidnight = new Date(
               now.getFullYear(),
               now.getMonth(),
               now.getDate() + 1,
               0, 0, 0, 0
             );
             const timeUntilMidnight = nextMidnight - now;

             setTimeout(() => {
               const data = getFitnessData();
               uploadDataToIPFS(data, client).then(cid => {
                 if (cid) {
                   console.log("🕛 Midnight snapshot uploaded:", cid);
                   markSnapshotTakenToday();
                 } else {
                   console.warn("❌ Midnight snapshot failed.");
                 }
               });

               // Reschedule for next day
               scheduleMidnightSnapshot(client);
             }, timeUntilMidnight);
           }

           // After connectW3upClient returns a result, schedule it
           if (result && result.client) {
             scheduleMidnightSnapshot(result.client);
           }
        } else {
           if (preAuthorizedAccount) {
             console.info("W3UP session not restored on auto-connect — click the wallet button to connect IPFS.");
           } else {
             console.error("Failed to connect to Web3.Storage.");
           }
        }

      } catch (error) {
        console.error('Wallet connection error:', error);
      }
    } else {
      alert('MetaMask is not installed. Please install it to connect your wallet.');
    }
  }

  walletButton.addEventListener('click', connectWallet);

  // Auto-connect wallet on page load if the user already authorized MetaMask previously.
  // Uses eth_accounts (no prompt) — only eth_requestAccounts prompts the user.
  if (typeof window.ethereum !== 'undefined') {
    window.ethereum.request({ method: 'eth_accounts' })
      .then(async accounts => {
        if (accounts && accounts.length > 0) {
          await connectWallet(accounts[0]);
        }
      })
      .catch(err => console.warn('Wallet auto-connect check failed:', err));
  }

  // Modal logic
  const modalOverlay = document.getElementById('weight-modal');
  const modal = document.querySelector('#weight-modal .modal');
  const closeModalBtn = document.getElementById('modal-close');
  const weightBtn = document.getElementById('log-weight');
  const supplementsBtn = document.getElementById('log-supplements');
  const exerciseBtn = document.getElementById('log-exercise');
  const roundButtons = document.querySelectorAll('.round-button');

  let weightChart = null;

  const modals = {
    weight: document.getElementById('weight-modal'),
    supplements: document.getElementById('supplements-modal'),
    exercise: document.getElementById('exercise-modal'),
    measurements: document.getElementById('measurements-modal'),
    diet: document.getElementById('dietModal')
  };

  function openModal(name, triggerBtn) {
    if (!modals[name]) {
      console.warn(`Modal not found for: ${name}`);
      return;
    }
    Object.values(modals).forEach(m => m?.classList.add('modal-hidden'));
    roundButtons.forEach(btn => btn.classList.remove('active'));
    triggerBtn.classList.add('active');
    modals[name].classList.remove('modal-hidden');

    // Chart.js initialization only when opening the weight modal
    if (!weightChart && name === 'weight') {
      const ctx = document.getElementById('weight-chart').getContext('2d');
      // eslint-disable-next-line no-undef
      weightChart = new Chart(ctx, {
        type: 'line',
        data: {
          // Chart.js 3+ time scale: no need for labels, use data.x
          datasets: [{
            label: 'Average Weight',
            data: [],
            borderColor: '#00e5ff',
            backgroundColor: 'rgba(0, 229, 255, 0.2)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'day',
                displayFormats: {
                  day: 'MMM d'
                },
                tooltipFormat: 'MMM d, h:mm a'
              },
              ticks: {
                source: 'auto',
                autoSkip: false
              }
            },
            y: { beginAtZero: true }
          }
        }
      });
      // Load past weights from localStorage
      const data = getFitnessData();
      data.weightLogs.forEach(entry => {
        weightChart.data.datasets[0].data.push({ x: new Date(entry.timestamp), y: entry.weight });
      });
      weightChart.update();
    }

    // Enhanced chart filter logic for weight chart toggles (day/month/year/max)
    if (name === 'weight') {
      const weightChartToggle = document.getElementById('weight-chart-toggle');
      if (weightChartToggle) {
        // Remove previous listeners by cloning
        const newToggle = weightChartToggle.cloneNode(true);
        weightChartToggle.parentNode.replaceChild(newToggle, weightChartToggle);
        newToggle.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', () => {
            const range = btn.textContent.toLowerCase(); // 'day', 'month', 'year', 'max'
            const data = getFitnessData();
            const now = new Date();
            let cutoff = new Date();

            if (range === 'day') cutoff.setDate(now.getDate() - 1);
            if (range === 'month') cutoff.setDate(now.getDate() - 30);
            if (range === 'year') cutoff.setDate(now.getDate() - 365);
            if (range === 'max') cutoff = new Date(0); // all time

            const filtered = data.weightLogs
              .map(entry => ({
                ...entry,
                time: new Date(entry.timestamp)
              }))
              .filter(entry => entry.time >= cutoff);

            if (weightChart) {
              // Group entries by date for average/min/max (keeping time for x)
              const groupMap = new Map();
              filtered.forEach(entry => {
                const dateKey = entry.timestamp.split(' ')[0];
                if (!groupMap.has(dateKey)) groupMap.set(dateKey, []);
                groupMap.get(dateKey).push({ ...entry });
              });

              // Build data points as {x: date, y: avg}
              const dataPoints = [];
              groupMap.forEach((entries, date) => {
                // Find average for that day
                const avg = entries.reduce((a, b) => a + b.weight, 0) / entries.length;
                // Use first time of day for x
                const firstTimestamp = entries[0].timestamp;
                // Use date with time 00:00 for x, or firstTimestamp as Date
                const x = new Date(firstTimestamp);
                dataPoints.push({ x, y: avg });
              });
              // Sort by x ascending
              dataPoints.sort((a, b) => a.x - b.x);
              weightChart.data.datasets[0].data = dataPoints;
              weightChart.data.datasets[0].label = 'Average Weight';
              // Remove labels for time scale
              weightChart.data.labels = [];
              weightChart.update();
            }
          });
        });
      }
    }
  }

  weightBtn.addEventListener('click', () => openModal('weight', weightBtn));
  supplementsBtn.addEventListener('click', () => openModal('supplements', supplementsBtn));
  exerciseBtn.addEventListener('click', () => openModal('exercise', exerciseBtn));
  // Measurements button handler
  const measurementsBtn = document.getElementById('log-measurements');
  if (measurementsBtn) {
    measurementsBtn.addEventListener('click', () => openModal('measurements', measurementsBtn));
  }

  // Diet button handler
  const dietBtn = document.getElementById('dietBtn');
  if (dietBtn) {
    dietBtn.addEventListener('click', () => openModal('diet', dietBtn));
  }

  const closeButtons = document.querySelectorAll('.modal-close');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      Object.values(modals).forEach(m => m?.classList.add('modal-hidden'));
      roundButtons.forEach(btn => btn.classList.remove('active'));
    });
  });

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        Object.values(modals).forEach(m => m?.classList.add('modal-hidden'));
        roundButtons.forEach(btn => btn.classList.remove('active'));
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Object.values(modals).forEach(m => m?.classList.add('modal-hidden'));
      roundButtons.forEach(btn => btn.classList.remove('active'));
    }
  });

  // Form handling
  const weightForm = document.getElementById('weight-form');

  const weightDateInput = document.getElementById('date');
  if (weightDateInput) {
    const today = new Date().toISOString().split('T')[0];
    weightDateInput.value = today;
  }

  if (weightForm) weightForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const weight = parseFloat(document.getElementById('weight').value);
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    const timestamp = `${date} ${time}`;

    logWeight(weight, timestamp);

    if (weightChart) {
      // Add data point as { x: Date, y: weight }
      weightChart.data.datasets[0].data.push({ x: new Date(timestamp), y: weight });
      // No need to set labels; Chart.js time scale uses x
      weightChart.update();
    }

    displayCurrentWeight();

    weightForm.reset();
    if (weightDateInput) {
      const today = new Date().toISOString().split('T')[0];
      weightDateInput.value = today;
    }
    Object.values(modals).forEach(m => m?.classList.add('modal-hidden'));
    roundButtons.forEach(btn => btn.classList.remove('active'));
  });

  // Helper: show a timed status message in the weight modal feedback element
  const STATUS_MESSAGE_DURATION_MS = 3000;
  const MIN_WEIGHT_LBS = 50;
  const MAX_WEIGHT_LBS = 1000;

  function showWeightStatus(msg) {
    const statusEl = document.getElementById('weight-status');
    if (!statusEl) return;
    statusEl.textContent = msg;
    setTimeout(() => { statusEl.textContent = ''; }, STATUS_MESSAGE_DURATION_MS);
  }

  // Helper: append a new data point to the weight chart and refresh it
  function appendWeightDataPoint(weight, timestamp) {
    if (weightChart) {
      weightChart.data.datasets[0].data.push({ x: new Date(timestamp), y: weight });
      weightChart.update();
    }
  }

  // Handle manual weight entry from the weight modal form
  const manualWeightForm = document.getElementById('manualWeightForm');
  if (manualWeightForm) {
    manualWeightForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const weight = parseFloat(document.getElementById('manualWeight').value);

      if (isNaN(weight) || weight < MIN_WEIGHT_LBS || weight > MAX_WEIGHT_LBS) {
        showWeightStatus(`⚠️ Enter a valid weight between ${MIN_WEIGHT_LBS} and ${MAX_WEIGHT_LBS} lbs.`);
        return;
      }

      const timestamp = new Date().toISOString();
      logWeight(weight, timestamp);
      appendWeightDataPoint(weight, timestamp);
      displayCurrentWeight();

      const weightReading = document.getElementById('weightReading');
      if (weightReading) weightReading.textContent = `${weight.toFixed(1)} lbs`;

      showWeightStatus('✅ Logged!');
      manualWeightForm.reset();
    });
  }

  // Handle weight readings coming from the Bluetooth scale (dispatched in index.html)
  document.addEventListener('weightLogged', (e) => {
    const { weight, timestamp } = e.detail;
    logWeight(weight, timestamp);
    appendWeightDataPoint(weight, timestamp);
    displayCurrentWeight();
    showWeightStatus('✅ Logged!');
  });
});

// (ticker arc animation code replaced by ticker-circle logic)
// --- Exercise Form Logic ---
const exerciseForm = document.getElementById('exercise-form');
if (exerciseForm) {
  // --- Dynamic Set Inputs ---
  const setCountInput = document.getElementById('exercise-sets');
  const setInputsContainer = document.getElementById('exercise-set-inputs');

  function updateSetInputs() {
    const sets = parseInt(setCountInput.value || 1);
    setInputsContainer.innerHTML = '';

    for (let i = 0; i < sets; i++) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.marginBottom = '6px';

      const repInput = document.createElement('input');
      repInput.type = 'number';
      repInput.placeholder = `Reps for set ${i + 1}`;
      repInput.name = `set-reps-${i}`;
      repInput.required = true;
      repInput.style.width = '48%';

      const weightInput = document.createElement('input');
      weightInput.type = 'text';
      weightInput.placeholder = `Weight for set ${i + 1}`;
      weightInput.name = `set-weight-${i}`;
      weightInput.required = true;
      weightInput.style.width = '48%';

      row.appendChild(repInput);
      row.appendChild(weightInput);
      setInputsContainer.appendChild(row);
    }
  }

  if (setCountInput && setInputsContainer) {
    setCountInput.addEventListener('input', updateSetInputs);
    updateSetInputs(); // initialize
  }

  // Ensure exercise list container is inside the modal, not duplicated
  let exerciseListContainer = document.getElementById('exercise-list');
  if (!exerciseListContainer) {
    exerciseListContainer = document.createElement('div');
    exerciseListContainer.id = 'exercise-list';
    // Find the modal container (parent of form)
    const modalDiv = exerciseForm.closest('.modal');
    if (modalDiv) {
      modalDiv.appendChild(exerciseListContainer);
    } else {
      // fallback: append after form
      exerciseForm.parentNode.appendChild(exerciseListContainer);
    }
  }

  // Pre-fill date field with current date
  const dateInput = document.getElementById('exercise-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }

  function loadExercises() {
    const data = getFitnessData();
    const list = Array.isArray(data.exercises?.entries) ? data.exercises.entries : [];
    // Clear the container and append new content
    exerciseListContainer.innerHTML = '';
    const header = document.createElement('h3');
    header.textContent = 'Logged Exercises';
    exerciseListContainer.appendChild(header);
    const ul = document.createElement('ul');
    list.forEach((entry) => {
      let descStr = entry.description ? ` (${entry.description})` : '';
      let setsDisplay = '';
      if (Array.isArray(entry.sets)) {
        setsDisplay = entry.sets
          .map((set, idx) => `Set ${idx + 1}: ${set.reps} reps @ ${set.weight}`)
          .join('; ');
      } else if (entry.reps !== undefined && entry.sets !== undefined) {
        setsDisplay = `${entry.reps} reps x ${entry.sets} sets${entry.weight !== undefined && entry.weight !== null && entry.weight !== '' ? ` @ ${entry.weight} lbs/kg` : ''}`;
      }
      const li = document.createElement('li');
      li.textContent = `${entry.type}${descStr} - ${setsDisplay} on ${entry.timestamp}`;
      ul.appendChild(li);
    });
    exerciseListContainer.appendChild(ul);
  }

  // Exercise dropdown: Add new type dynamically when "+ Add New" is selected
  const exerciseTypeSelect = document.getElementById('exercise-type');

  function populateExerciseTypeDropdown() {
    const select = exerciseTypeSelect;
    if (!select) return;
    select.innerHTML = '';
    const data = getFitnessData(); // Ensures types initialized
    const types = data.exercises.types || [];
    types.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      select.appendChild(opt);
    });
    const addNew = document.createElement('option');
    addNew.value = 'add-new';
    addNew.textContent = '+ Add New';
    select.appendChild(addNew);
  }

  if (exerciseTypeSelect) {
    // Ensure dropdown is populated after fitness data is initialized
    populateExerciseTypeDropdown();
    exerciseTypeSelect.addEventListener('change', () => {
      if (exerciseTypeSelect.value === 'add-new') {
        const newType = prompt('Enter a new exercise type:');
        if (
          newType &&
          newType.trim() !== '' &&
          !getFitnessData().exercises.types.includes(newType)
        ) {
          const data = getFitnessData();
          data.exercises.types.push(newType);
          saveFitnessData(data);
          populateExerciseTypeDropdown();
          exerciseTypeSelect.value = newType;
        } else {
          exerciseTypeSelect.value = ''; // Reset if invalid or cancelled
        }
      }
    });
  }

  exerciseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.getElementById('exercise-type').value;
    const sets = parseInt(document.getElementById('exercise-sets').value);
    // Collect per-set reps/weight
    const setEntries = [];
    for (let i = 0; i < sets; i++) {
      const reps = parseInt(exerciseForm[`set-reps-${i}`].value);
      const weight = exerciseForm[`set-weight-${i}`].value;
      setEntries.push({ reps, weight });
    }
    const date = document.getElementById('exercise-date').value;
    const time = document.getElementById('exercise-time').value;
    const timestamp = `${date} ${time}`;
    // Optionally get description if present in form
    const descInput = document.getElementById('exercise-description');
    const description = descInput ? descInput.value : undefined;

    const data = getFitnessData();
    // Store per-set entries as array in 'sets' property
    data.exercises.entries.push({ type, sets: setEntries, description, timestamp });
    saveFitnessData(data);

    exerciseForm.reset();
    // Re-fill date after reset
    if (dateInput) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today;
    }
    updateSetInputs();
    loadExercises();
    displayRecentExercises();
  });
  // Load on page load
  loadExercises();
}

// Expose requestLocation globally
window.requestLocation = requestLocation;
// --- Exercise Log Modal logic (for footer Exercise button) ---
window.addEventListener('DOMContentLoaded', () => {
  const logExerciseBtn = document.getElementById('log-exercise');
  if (logExerciseBtn) {
    logExerciseBtn.addEventListener('click', () => {
      const modal = document.getElementById('exercise-log-modal');
      if (!modal) return;
      modal.style.display = 'block';
      // Lifetime stats summary logic
      const stats = getLifetimeWorkoutStats();
      const data = getFitnessData();
      const log = data.exerciseLog || [];

      const pullups = log.filter(e => e.type?.toLowerCase() === 'pullups').reduce((acc, e) => acc + (parseInt(e.reps) || 0), 0);
      const pushups = log.filter(e => e.type?.toLowerCase() === 'pushups').reduce((acc, e) => acc + (parseInt(e.reps) || 0), 0);
      const situps = log.filter(e => e.type?.toLowerCase() === 'situps').reduce((acc, e) => acc + (parseInt(e.reps) || 0), 0);

      const summaryHTML = `
        ⏱️ Total Work: ${(stats.totalWorkSeconds / 60).toFixed(1)} min |
        🧘 Rest: ${(stats.totalRestSeconds / 60).toFixed(1)} min<br>
        💪 Sets: ${stats.totalSets} | ✅ ${stats.completedSessions} | ❌ ${stats.canceledSessions}<br>
        🏋️‍♂️ Pull-ups: ${pullups} | Push-ups: ${pushups} | Sit-ups: ${situps}
      `;

      const summaryContainer = document.getElementById('lifetime-stats-summary');
      if (summaryContainer) summaryContainer.innerHTML = summaryHTML;
      // Render the exercise log list
      const list = document.getElementById('exercise-list');
      if (list) {
        list.innerHTML = '';
        log.slice().reverse().forEach(entry => {
          const li = document.createElement('li');
          li.textContent = `${entry.type} - ${entry.reps} reps${entry.weight ? ` @ ${entry.weight} lbs` : ''} (${entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''})`;
          list.appendChild(li);
        });
      }
      // Modal close logic
      const closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) {
        closeBtn.onclick = () => {
          modal.style.display = 'none';
        };
      }
    });
  }
});
// --- Chart Data Grouping and Preparation for Exercise Graph ---
function groupByDate(data, type) {
  const grouped = {};
  data.forEach(entry => {
    // Use date only (YYYY-MM-DD) for grouping
    let dateStr = '';
    if (entry.timestamp) {
      dateStr = entry.timestamp.split('T')[0];
    } else if (entry.date) {
      dateStr = entry.date;
    } else {
      return;
    }
    const reps = parseInt(entry.reps) || 0;
    if (!grouped[dateStr]) {
      grouped[dateStr] = { total: 0, sets: [], weights: [] };
    }
    grouped[dateStr].total += reps;
    grouped[dateStr].sets.push(reps);
    grouped[dateStr].weights.push(parseInt(entry.weight) || 0);
  });
  return grouped;
}

function prepareGraphData(data, type) {
  const grouped = groupByDate(data, type);
  const labels = Object.keys(grouped).sort();
  const reps = [];
  const weights = [];
  const tooltips = [];

  labels.forEach(date => {
    const sets = grouped[date].sets;
    reps.push(sets.reduce((a, b) => a + b, 0));
    weights.push(grouped[date].weights?.length ? Math.max(...grouped[date].weights) : 0);
    tooltips.push(`Reps: ${sets.join(', ')}`);
  });

  return { labels, reps, weights, tooltips };
}
// ===== Water Intake Tracker =====
const WATER_KEY = 'waterTrackerData';
const WATER_MAX = 8;
const WATER_ARC_RADIUS = 90; // SVG radius matching the path's 'A 90 90' arc
const WATER_ARC_LENGTH = Math.PI * WATER_ARC_RADIUS; // semi-circle arc length ≈ 282.74

function getWaterData() {
  const today = new Date().toISOString().split('T')[0];
  const raw = localStorage.getItem(WATER_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    if (data.date === today) {
      return data;
    }
  }
  const fresh = { date: today, count: 0 };
  localStorage.setItem(WATER_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveWaterData(data) {
  localStorage.setItem(WATER_KEY, JSON.stringify(data));
}

function updateWaterMeter() {
  const data = getWaterData();
  const count = Math.min(data.count, WATER_MAX);
  const filled = WATER_ARC_LENGTH * count / WATER_MAX;
  const empty = WATER_ARC_LENGTH - filled;

  const fillPath = document.getElementById('water-meter-fill');
  if (fillPath) {
    fillPath.setAttribute('stroke-dasharray', `${filled.toFixed(2)} ${empty.toFixed(2)}`);
  }

  const label = document.getElementById('water-count-label');
  if (label) {
    label.textContent = `${count}/${WATER_MAX}`;
  }

  const modalCount = document.getElementById('water-modal-count');
  if (modalCount) {
    modalCount.textContent = `${count} / ${WATER_MAX}`;
  }
}

function logWaterIntake() {
  const data = getWaterData();
  if (data.count < WATER_MAX) {
    data.count += 1;
    saveWaterData(data);
  }
  updateWaterMeter();
}

function removeWaterIntake() {
  const data = getWaterData();
  if (data.count > 0) {
    data.count -= 1;
    saveWaterData(data);
  }
  updateWaterMeter();
}

window.addEventListener('DOMContentLoaded', () => {
  updateWaterMeter();

  // Both drop buttons open the water log modal
  document.getElementById('water-drop-empty')?.addEventListener('click', () => showModal('water-modal'));
  document.getElementById('water-drop-full')?.addEventListener('click', () => showModal('water-modal'));

  // Modal action buttons
  document.getElementById('water-log-btn')?.addEventListener('click', logWaterIntake);
  document.getElementById('water-remove-btn')?.addEventListener('click', removeWaterIntake);

  // Close button
  document.getElementById('water-modal-close')?.addEventListener('click', () => hideModal('water-modal'));

  // Close on overlay click
  document.getElementById('water-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('water-modal')) {
      hideModal('water-modal');
    }
  });
});
// ===== End Water Intake Tracker =====

// --- DNFT Escrow Purchase Flow (BigNuten v1.0.0) ---
// Mirrors the DecentHead AboutModal.js on-chain buy pattern.
const _BIGNUTEN_ESCROW_ADDRESS  = '0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e';
const _BIGNUTEN_USDC_ADDRESS    = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'; // USDC on Optimism
const _BIGNUTEN_ZERO_ADDRESS    = '0x0000000000000000000000000000000000000000';
const _BIGNUTEN_CHAIN_ID        = 10n; // Optimism Mainnet
const _BIGNUTEN_OPTIMISM_RPC    = 'https://mainnet.optimism.io'; // public read-only RPC
const _BIGNUTEN_BUY_BTN_TEXT    = '🎟️ Buy Now';
const _BIGNUTEN_MSG_NO_NFT_STOCK = '⚠ NFT stock not yet loaded into escrow — check back soon.';

const _BIGNUTEN_ESCROW_ABI = [
  'function nextListingId() view returns (uint256)',
  'function getListing(uint256 listingId) view returns (tuple(address nftContract, uint256 tokenId, uint256 priceETH, address priceToken, uint256 priceAmount, uint256 available, bool active, string note))',
  'function getNFTBalance(address nftContract, uint256 tokenId) view returns (uint256)',
  'function purchaseWithETH(uint256 listingId, uint256 amount) payable',
  'function purchaseWithToken(uint256 listingId, uint256 amount)',
];

const _BIGNUTEN_ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

async function _loadBigNutenListings() {
  const container = document.getElementById('dnft-buy-cards');
  const statusEl  = document.getElementById('dnft-buy-status');
  if (!container) return;

  container.innerHTML = '<p class="dnft-buy-loading">⏳ Loading available editions…</p>';
  if (statusEl) statusEl.textContent = '';

  try {
    const ethers = window.ethers;
    if (!ethers) {
      container.innerHTML = '<p class="dnft-buy-loading">Could not load listings — please refresh.</p>';
      return;
    }

    // Use a public read-only RPC so listings and prices are visible to ALL
    // visitors, with or without MetaMask.  MetaMask is only needed at buy time.
    const provider = new ethers.JsonRpcProvider(_BIGNUTEN_OPTIMISM_RPC);
    const escrow   = new ethers.Contract(_BIGNUTEN_ESCROW_ADDRESS, _BIGNUTEN_ESCROW_ABI, provider);
    const count    = Number(await escrow.nextListingId());

    const raws = await Promise.all(
      Array.from({ length: count }, (_, i) => escrow.getListing(i))
    );

    const matched = raws
      .map((raw, i) => ({
        id:          i,
        nftContract: raw[0],
        tokenId:     raw[1],
        priceETH:    raw[2],
        priceToken:  raw[3],
        priceAmount: raw[4],
        available:   raw[5],
        active:      raw[6],
        note:        raw[7],
      }))
      .filter(l =>
        l.active &&
        l.available > 0n &&
        l.note.toLowerCase().includes('bignuten')
      );

    if (matched.length === 0) {
      container.innerHTML = '<p class="dnft-buy-loading">No editions currently listed — check back soon.</p>';
      return;
    }

    // Verify actual escrow NFT stock — listing `available` can be stale if
    // NFTs were never deposited or were later withdrawn.
    const nftBalances = await Promise.all(
      matched.map(l => escrow.getNFTBalance(l.nftContract, l.tokenId))
    );

    container.innerHTML = matched.map((l, idx) => {
      const nftInStock = nftBalances[idx] > 0n;

      // Determine human-readable price label (matches DecentHead logic)
      let priceLabel;
      if (l.priceETH > 0n) {
        priceLabel = `${ethers.formatEther(l.priceETH)} ETH`;
      } else if (l.priceAmount > 0n) {
        const isUsdc = !l.priceToken
          || l.priceToken === _BIGNUTEN_ZERO_ADDRESS
          || l.priceToken.toLowerCase() === _BIGNUTEN_USDC_ADDRESS.toLowerCase();
        priceLabel = isUsdc
          ? `$${(Number(l.priceAmount) / 1e6).toFixed(2)} USDC`
          : `${l.priceAmount.toString()} raw units (${l.priceToken.slice(0, 8)}…)`;
      } else {
        priceLabel = 'Free';
      }

      return `
        <div class="dnft-buy-card">
          <div class="dnft-buy-card-label">${l.note}</div>
          <div class="dnft-buy-card-supply">${l.available} available</div>
          ${nftInStock
            ? `<button class="dnft-buy-btn dnft-escrow-buy-btn"
                 data-listing-id="${l.id}"
                 data-price-amount="${l.priceAmount.toString()}"
                 data-price-eth="${l.priceETH.toString()}">
                 🎟️ Buy Now — ${priceLabel}
               </button>`
            : `<span class="dnft-buy-loading" style="color:#ff8800;" role="status">${_BIGNUTEN_MSG_NO_NFT_STOCK}</span>`
          }
        </div>
      `;
    }).join('');

    container.querySelectorAll('.dnft-escrow-buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const listingId   = parseInt(btn.dataset.listingId);
        const priceAmount = BigInt(btn.dataset.priceAmount);
        const priceEth    = BigInt(btn.dataset.priceEth);
        _handleBigNutenBuy(listingId, priceAmount, priceEth, btn, statusEl);
      });
    });

  } catch (err) {
    console.warn('[BigNuten] _loadBigNutenListings failed:', err);
    container.innerHTML = '<p class="dnft-buy-loading">Could not load listings — please refresh.</p>';
  }
}

async function _handleBigNutenBuy(listingId, priceAmount, priceEth, btn, statusEl) {
  const setStatus = (msg, color = '#aaa') => {
    if (!statusEl) return;
    statusEl.style.color  = color;
    statusEl.textContent  = msg;
  };

  if (!window.ethereum) {
    setStatus('⚠ MetaMask not found. Please install it to buy on-chain.', '#ff8800');
    return;
  }
  const ethers = window.ethers;
  if (!ethers) {
    setStatus('⚠ ethers.js not loaded.', '#ff8800');
    return;
  }

  try {
    btn.disabled    = true;
    btn.textContent = '⏳ Connecting wallet…';

    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);

    // Ensure we're on Optimism
    const network = await provider.getNetwork();
    if (network.chainId !== _BIGNUTEN_CHAIN_ID) {
      setStatus('⏳ Switching to Optimism…');
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xa' }] });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xa',
              chainName: 'Optimism Mainnet',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://mainnet.optimism.io'],
              blockExplorerUrls: ['https://optimistic.etherscan.io'],
            }],
          });
        } else {
          throw switchErr;
        }
      }
      const freshProvider = new ethers.BrowserProvider(window.ethereum);
      await _doBigNutenPurchase(freshProvider, ethers, listingId, btn, setStatus);
      return;
    }

    await _doBigNutenPurchase(provider, ethers, listingId, btn, setStatus);
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = _BIGNUTEN_BUY_BTN_TEXT;
    const data = err?.data ?? err?.info?.error?.data ?? '';
    if (typeof data === 'string' && data.startsWith('0x03dee4c5')) {
      setStatus('⚠ NFT stock not in escrow — the seller needs to deposit NFTs before purchase.', '#ff8800');
    } else {
      setStatus(`⚠ ${err.reason || err.message || 'Unknown error'}`, '#ff4444');
    }
  }
}

async function _doBigNutenPurchase(provider, ethers, listingId, btn, setStatus) {
  const signer = await provider.getSigner();
  const buyer  = signer.address;

  setStatus('⏳ Checking listing…');
  const escrow  = new ethers.Contract(_BIGNUTEN_ESCROW_ADDRESS, _BIGNUTEN_ESCROW_ABI, signer);
  const listing = await escrow.getListing(listingId);

  if (!listing.active) {
    btn.disabled = false; btn.textContent = _BIGNUTEN_BUY_BTN_TEXT;
    setStatus('⚠ This listing is no longer active.', '#ff8800'); return;
  }
  if (listing.available === 0n) {
    btn.disabled = false; btn.textContent = _BIGNUTEN_BUY_BTN_TEXT;
    setStatus('⚠ Sold out — no tokens remaining.', '#ff8800'); return;
  }

  setStatus('⏳ Verifying NFT stock…');
  const nftBalance = await escrow.getNFTBalance(listing.nftContract, listing.tokenId);
  console.log('[BigNuten] escrow NFT balance:', {
    nftContract: listing.nftContract,
    tokenId:     listing.tokenId.toString(),
    balance:     nftBalance.toString(),
  });
  if (nftBalance < 1n) {
    btn.disabled = false; btn.textContent = _BIGNUTEN_BUY_BTN_TEXT;
    setStatus(`⚠ ${_BIGNUTEN_MSG_NO_NFT_STOCK}`, '#ff8800'); return;
  }

  const tokenAmount = listing.priceAmount;
  const priceETH    = listing.priceETH ?? 0n;
  const rawToken    = listing.priceToken;

  let purchaseTx;

  if (priceETH > 0n) {
    // ETH listing — send exact ETH value
    setStatus('⏳ Confirm purchase in MetaMask…');
    btn.textContent = '⏳ Purchasing…';
    purchaseTx = await escrow.purchaseWithETH(listingId, 1, { value: priceETH });
  } else {
    // ERC-20 listing — approve token then purchase
    // address(0) stored in listing means "use the contract's default token (USDC)"
    const paymentToken = (rawToken && rawToken !== _BIGNUTEN_ZERO_ADDRESS)
      ? rawToken
      : _BIGNUTEN_USDC_ADDRESS;

    const tokenLabel = paymentToken.toLowerCase() === _BIGNUTEN_USDC_ADDRESS.toLowerCase()
      ? 'USDC'
      : `token (${paymentToken.slice(0, 8)}…)`;

    setStatus('⏳ Checking token allowance…');
    const token     = new ethers.Contract(paymentToken, _BIGNUTEN_ERC20_ABI, signer);
    const allowance = await token.allowance(buyer, _BIGNUTEN_ESCROW_ADDRESS);
    console.log('[BigNuten] allowance check:', {
      resolvedToken: paymentToken,
      allowance:     allowance.toString(),
      required:      tokenAmount.toString(),
    });

    if (allowance < tokenAmount) {
      setStatus(`⏳ Approving ${tokenLabel} spend (confirm in MetaMask)…`);
      btn.textContent = '⏳ Approving…';
      const approveTx = await token.approve(_BIGNUTEN_ESCROW_ADDRESS, tokenAmount);
      setStatus('⏳ Waiting for approval confirmation…');
      await approveTx.wait();
    }

    setStatus('⏳ Confirm purchase in MetaMask…');
    btn.textContent = '⏳ Purchasing…';
    purchaseTx = await escrow.purchaseWithToken(listingId, 1);
  }

  setStatus('⏳ Waiting for purchase confirmation…');
  await purchaseTx.wait();

  btn.disabled    = false;
  btn.textContent = '✅ Purchased!';
  if (statusEl) {
    statusEl.style.color = '#00e5ff';
    statusEl.innerHTML = `✅ Success! DNFT transferred to your wallet. Tx: <a href="https://optimistic.etherscan.io/tx/${purchaseTx.hash}" target="_blank" rel="noopener noreferrer" style="color:#00e5ff">${purchaseTx.hash.slice(0, 10)}…</a>`;
  }

  // Refresh listing cards
  _loadBigNutenListings();
}

// --- About Modal Logic & Staff of Aesculapius Dropdown ---
document.addEventListener('DOMContentLoaded', () => {
  const appTitleLeft    = document.getElementById('app-title-left');
  const aesRight        = document.getElementById('aesculapius-right');
  const aesDropdown     = document.getElementById('aesculapius-dropdown');
  const aboutModal      = document.getElementById('about-modal');
  const aboutModalClose = document.getElementById('about-modal-close');

  // ── About modal helpers ───────────────────────────────────────────────────

  function openAboutModal(scrollToDnft) {
    if (!aboutModal) return;
    aboutModal.classList.remove('modal-hidden');
    document.body.classList.add('modal-active');
    // Load live DNFT listings from escrow each time the modal opens
    _loadBigNutenListings();
    if (scrollToDnft) {
      const dnftSection = document.getElementById('dnft-supporter-section');
      if (dnftSection) {
        // Wait for the modal to be fully visible before scrolling
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dnftSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }
    } else {
      aboutModalClose && aboutModalClose.focus();
    }
  }

  function closeAboutModal() {
    if (!aboutModal) return;
    aboutModal.classList.add('modal-hidden');
    document.body.classList.remove('modal-active');
  }

  if (appTitleLeft) {
    appTitleLeft.addEventListener('click', () => openAboutModal(false));
  }

  if (aboutModalClose) {
    aboutModalClose.addEventListener('click', closeAboutModal);
  }

  if (aboutModal) {
    aboutModal.addEventListener('click', function (e) {
      if (e.target === aboutModal) {
        closeAboutModal();
      }
    });
  }

  // ── Staff of Aesculapius dropdown ────────────────────────────────────────

  function openAesDropdown() {
    if (!aesDropdown) return;
    aesDropdown.classList.remove('hidden');
    aesRight && aesRight.setAttribute('aria-expanded', 'true');
    refreshAesBnutBalance();
  }

  function closeAesDropdown() {
    if (!aesDropdown) return;
    aesDropdown.classList.add('hidden');
    aesRight && aesRight.setAttribute('aria-expanded', 'false');
  }

  function toggleAesDropdown(e) {
    e.stopPropagation();
    if (aesDropdown && aesDropdown.classList.contains('hidden')) {
      openAesDropdown();
    } else {
      closeAesDropdown();
    }
  }

  if (aesRight) {
    aesRight.addEventListener('click', toggleAesDropdown);
    aesRight.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleAesDropdown(e);
      }
      if (e.key === 'Escape') closeAesDropdown();
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (aesDropdown && !aesDropdown.classList.contains('hidden') &&
        !aesDropdown.contains(e.target) && e.target !== aesRight) {
      closeAesDropdown();
    }
  });

  // ── $BNUT balance in dropdown ─────────────────────────────────────────────

  async function refreshAesBnutBalance() {
    const amountEl = document.getElementById('aes-bnut-amount');
    if (!amountEl) return;
    const account = window._connectedAccount;
    if (!account) {
      amountEl.textContent = 'Connect wallet';
      return;
    }
    if (!window.CONTRACTS || !window.CONTRACTS.bnut ||
        window.CONTRACTS.bnut === '0x0000000000000000000000000000000000000000') {
      amountEl.textContent = '—';
      return;
    }
    amountEl.textContent = 'Loading…';
    try {
      const bnutAbi = ['function balanceOf(address account) view returns (uint256)'];
      const bnutProvider = new ethers.JsonRpcProvider(window.CONTRACTS.rpcUrl);
      const bnutContract = new ethers.Contract(window.CONTRACTS.bnut, bnutAbi, bnutProvider);
      const rawBalance = await bnutContract.balanceOf(account);
      const formatted = parseFloat(ethers.formatUnits(rawBalance, 18))
        .toLocaleString(undefined, { maximumFractionDigits: 2 });
      const symbol = (window.CONTRACTS.bnutToken && window.CONTRACTS.bnutToken.symbol) || 'BNUT';
      amountEl.textContent = `${formatted} $${symbol}`;
    } catch (err) {
      console.warn('[AES Dropdown] Could not fetch $BNUT balance:', err);
      const symbol = (window.CONTRACTS.bnutToken && window.CONTRACTS.bnutToken.symbol) || 'BNUT';
      amountEl.textContent = `— $${symbol}`;
    }
  }

  // ── Stub modal helpers ────────────────────────────────────────────────────

  const stubModals = [
    { btnId: 'aes-achieve-btn',   modalId: 'achievements-modal', closeId: 'achievements-modal-close' },
    { btnId: 'aes-data-btn',      modalId: 'data-sharing-modal', closeId: 'data-sharing-modal-close' },
    { btnId: 'aes-challenge-btn', modalId: 'challenge-modal',    closeId: 'challenge-modal-close' },
  ];

  stubModals.forEach(({ btnId, modalId, closeId }) => {
    const btn   = document.getElementById(btnId);
    const modal = document.getElementById(modalId);
    const close = document.getElementById(closeId);

    if (btn && modal) {
      btn.addEventListener('click', () => {
        closeAesDropdown();
        modal.classList.remove('modal-hidden');
        document.body.classList.add('modal-active');
      });
    }
    if (close && modal) {
      close.addEventListener('click', () => {
        modal.classList.add('modal-hidden');
        if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
          document.body.classList.remove('modal-active');
        }
      });
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('modal-hidden');
          if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
            document.body.classList.remove('modal-active');
          }
        }
      });
    }
  });

  // ── Governance modal ──────────────────────────────────────────────────────

  (function initGovernanceModal() {
    const govBtn   = document.getElementById('aes-gov-btn');
    const govModal = document.getElementById('governance-modal');
    const govClose = document.getElementById('governance-modal-close');

    if (!govBtn || !govModal) return;

    // Helper: refresh the wallet-aware sections in the modal header
    async function refreshGovWalletStatus() {
      const balanceEl   = document.getElementById('gov-wallet-balance');
      const adminPanel  = document.getElementById('gov-admin-panel');
      const createWrapper = document.getElementById('gov-create-btn-wrapper');

      if (!window.ethereum) return;
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send('eth_accounts', []);
        if (!accounts || accounts.length === 0) return;
        const addr = accounts[0];

        // BNUT balance
        const balance = await getBnutBalance(addr);
        if (balanceEl) {
          balanceEl.textContent = `💰 Your $BNUT: ${balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
          balanceEl.style.display = 'block';
        }

        // Create Proposal button (PROPOSER_ROLE)
        if (createWrapper) {
          const canPropose = await isProposer(addr);
          createWrapper.style.display = canPropose ? 'block' : 'none';
        }

        // Admin panel (DEFAULT_ADMIN_ROLE)
        if (adminPanel) {
          const adminStatus = await isAdmin(addr);
          adminPanel.style.display = adminStatus ? 'block' : 'none';
        }
      } catch (_) { /* wallet not ready */ }
    }

    // Open modal + load proposals + refresh wallet status
    govBtn.addEventListener('click', async () => {
      closeAesDropdown();
      govModal.classList.remove('modal-hidden');
      document.body.classList.add('modal-active');

      // Run in parallel
      await Promise.all([
        displayProposals('gov-proposals-container'),
        refreshGovWalletStatus(),
      ]);
    });

    // Close button
    if (govClose) {
      govClose.addEventListener('click', () => {
        govModal.classList.add('modal-hidden');
        if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
          document.body.classList.remove('modal-active');
        }
      });
    }

    // Click-outside to close
    govModal.addEventListener('click', (e) => {
      if (e.target === govModal) {
        govModal.classList.add('modal-hidden');
        if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
          document.body.classList.remove('modal-active');
        }
      }
    });

    // Create Proposal button — toggle form
    const createBtn  = document.getElementById('gov-create-btn');
    const createForm = document.getElementById('gov-create-form');
    const cancelBtn  = document.getElementById('gov-cancel-btn');
    const submitBtn  = document.getElementById('gov-submit-btn');
    const formStatus = document.getElementById('gov-form-status');

    if (createBtn && createForm) {
      createBtn.addEventListener('click', () => {
        createForm.style.display = createForm.style.display === 'none' ? 'block' : 'none';
        if (formStatus) formStatus.textContent = '';
      });
    }

    if (cancelBtn && createForm) {
      cancelBtn.addEventListener('click', () => {
        createForm.style.display = 'none';
        if (formStatus) formStatus.textContent = '';
      });
    }

    if (submitBtn && createForm) {
      submitBtn.addEventListener('click', async () => {
        const title    = (document.getElementById('gov-input-title')?.value || '').trim();
        const desc     = (document.getElementById('gov-input-desc')?.value  || '').trim();
        const optYes   = (document.getElementById('gov-input-yes')?.value   || '').trim();
        const optNo    = (document.getElementById('gov-input-no')?.value    || '').trim();
        const durDays  = Number(document.getElementById('gov-input-duration')?.value || 7);

        if (!title || !desc) {
          if (formStatus) formStatus.textContent = '⚠️ Title and description are required.';
          return;
        }

        submitBtn.disabled = true;
        if (formStatus) formStatus.textContent = '⏳ Submitting proposal…';

        try {
          const newId = await createProposal(
            title, desc,
            optYes || 'Yes', optNo || 'No',
            durDays
          );
          if (formStatus) formStatus.textContent = `✅ Proposal #${newId} created!`;
          // Clear form inputs
          createForm.querySelectorAll('input, textarea').forEach(el => {
            if (el.id === 'gov-input-duration') el.value = '7';
            else el.value = '';
          });
          // Refresh proposals list
          await displayProposals('gov-proposals-container');
          createForm.style.display = 'none';
        } catch (err) {
          if (formStatus) formStatus.textContent = `❌ Failed: ${err.reason || err.message || err}`;
        } finally {
          submitBtn.disabled = false;
        }
      });
    }

    // ── Admin Panel — Mint $BNUT ──────────────────────────────────────────
    const mintBtn    = document.getElementById('gov-mint-btn');
    const mintStatus = document.getElementById('gov-mint-status');

    if (mintBtn) {
      mintBtn.addEventListener('click', async () => {
        const toAddr = (document.getElementById('gov-mint-addr')?.value || '').trim();
        const amount = Number(document.getElementById('gov-mint-amount')?.value || 0);
        const reason = (document.getElementById('gov-mint-reason')?.value || '').trim();

        if (!toAddr || !toAddr.startsWith('0x') || toAddr.length !== 42) {
          if (mintStatus) mintStatus.textContent = '⚠️ Enter a valid wallet address.';
          return;
        }
        if (!amount || amount <= 0) {
          if (mintStatus) mintStatus.textContent = '⚠️ Enter a positive amount.';
          return;
        }

        mintBtn.disabled = true;
        if (mintStatus) mintStatus.textContent = '⏳ Minting…';

        try {
          const txHash = await mintBnutToAddress(toAddr, amount, reason || 'Admin mint');
          if (mintStatus) mintStatus.textContent = `✅ Minted ${amount} $BNUT! Tx: ${txHash.slice(0, 18)}…`;
          document.getElementById('gov-mint-addr').value   = '';
          document.getElementById('gov-mint-amount').value = '';
          document.getElementById('gov-mint-reason').value = '';
          // Refresh balance
          await refreshGovWalletStatus();
        } catch (err) {
          if (mintStatus) mintStatus.textContent = `❌ Mint failed: ${err.reason || err.message || err}`;
        } finally {
          mintBtn.disabled = false;
        }
      });
    }

    // ── Admin Panel — Add Proposer ────────────────────────────────────────
    const addProposerBtn    = document.getElementById('gov-add-proposer-btn');
    const addProposerStatus = document.getElementById('gov-add-proposer-status');

    if (addProposerBtn) {
      addProposerBtn.addEventListener('click', async () => {
        const addr = (document.getElementById('gov-add-proposer-addr')?.value || '').trim();

        if (!addr || !addr.startsWith('0x') || addr.length !== 42) {
          if (addProposerStatus) addProposerStatus.textContent = '⚠️ Enter a valid wallet address.';
          return;
        }

        addProposerBtn.disabled = true;
        if (addProposerStatus) addProposerStatus.textContent = '⏳ Granting PROPOSER_ROLE…';

        try {
          const txHash = await addProposer(addr);
          if (addProposerStatus) addProposerStatus.textContent = `✅ Proposer added! Tx: ${txHash.slice(0, 18)}…`;
          document.getElementById('gov-add-proposer-addr').value = '';
        } catch (err) {
          if (addProposerStatus) addProposerStatus.textContent = `❌ Failed: ${err.reason || err.message || err}`;
        } finally {
          addProposerBtn.disabled = false;
        }
      });
    }

    // ── Admin Panel — Remove Proposer ─────────────────────────────────────
    const rmProposerBtn    = document.getElementById('gov-rm-proposer-btn');
    const rmProposerStatus = document.getElementById('gov-rm-proposer-status');

    if (rmProposerBtn) {
      rmProposerBtn.addEventListener('click', async () => {
        const addr = (document.getElementById('gov-rm-proposer-addr')?.value || '').trim();

        if (!addr || !addr.startsWith('0x') || addr.length !== 42) {
          if (rmProposerStatus) rmProposerStatus.textContent = '⚠️ Enter a valid wallet address.';
          return;
        }

        rmProposerBtn.disabled = true;
        if (rmProposerStatus) rmProposerStatus.textContent = '⏳ Revoking PROPOSER_ROLE…';

        try {
          const txHash = await removeProposer(addr);
          if (rmProposerStatus) rmProposerStatus.textContent = `✅ Proposer removed! Tx: ${txHash.slice(0, 18)}…`;
          document.getElementById('gov-rm-proposer-addr').value = '';
        } catch (err) {
          if (rmProposerStatus) rmProposerStatus.textContent = `❌ Failed: ${err.reason || err.message || err}`;
        } finally {
          rmProposerBtn.disabled = false;
        }
      });
    }

    // ── Admin Panel — Subscription Plans (DecentEscrow) ───────────────────

    const escrowZeroAddr = '0x0000000000000000000000000000000000000000';

    /** Render the plan list inside #escrow-plans-list */
    async function refreshEscrowPlansList() {
      const listEl  = document.getElementById('escrow-plans-list');
      const countEl = document.getElementById('escrow-plans-count');
      if (!listEl) return;

      listEl.innerHTML = '<p class="gov-loading">⏳ Loading plans from DecentEscrow…</p>';
      try {
        const plans = await listDecentEscrowPlans();
        if (countEl) countEl.textContent = `(${plans.length} plan${plans.length !== 1 ? 's' : ''})`;

        if (plans.length === 0) {
          listEl.innerHTML = '<p class="gov-loading">No plans created yet. Use the form below to add one.</p>';
          return;
        }

        const bnutAddr = (window.BNUT_CONTRACT_ADDRESS || '').toLowerCase();
        const usdcAddr = '0x0b2c639c533813f4aa9d7837caf62653d097ff85';

        listEl.innerHTML = plans.map(p => {
          const isEth   = p.paymentToken === escrowZeroAddr || p.paymentToken.toLowerCase() === escrowZeroAddr;
          const isBnut  = p.paymentToken.toLowerCase() === bnutAddr;
          const isUsdc  = p.paymentToken.toLowerCase() === usdcAddr;
          const tokenLabel = isEth
            ? 'ETH'
            : isBnut ? '$BNUT'
            : isUsdc ? 'USDC'
            : `${p.paymentToken.slice(0, 8)}…`;

          let priceFormatted;
          if (isEth) {
            priceFormatted = `${ethers.formatEther(p.pricePerPeriod)} ETH`;
          } else if (isBnut) {
            priceFormatted = `${ethers.formatEther(p.pricePerPeriod)} BNUT`;
          } else if (isUsdc) {
            priceFormatted = `$${(Number(p.pricePerPeriod) / 1e6).toFixed(2)} USDC`;
          } else {
            priceFormatted = `${p.pricePerPeriod.toString()} (raw)`;
          }

          const days = Number(p.periodSeconds) / 86400;
          const statusBadge = p.active
            ? '<span style="color:#00e5ff;">● Active</span>'
            : '<span style="color:#ff8800;">○ Inactive</span>';

          return `
            <div style="border:1px solid rgba(0,229,255,0.2); border-radius:6px; padding:0.5rem 0.75rem; margin-bottom:0.5rem;">
              <strong>Plan ${p.id}</strong> — ${p.name || '(unnamed)'}
              &nbsp;${statusBadge}<br/>
              <span style="color:#aaa; font-size:0.82em;">💰 ${priceFormatted} / ${days} day${days !== 1 ? 's' : ''} · token: ${tokenLabel}</span>
            </div>
          `;
        }).join('');
      } catch (err) {
        listEl.innerHTML = `<p class="gov-loading" style="color:#ff4444;">❌ Could not load plans: ${err.message}</p>`;
      }
    }

    const escrowRefreshBtn = document.getElementById('escrow-plans-refresh-btn');
    if (escrowRefreshBtn) {
      escrowRefreshBtn.addEventListener('click', () => refreshEscrowPlansList());
    }

    // Auto-load when admin section is opened (details toggle)
    const escrowPlansSection = document.getElementById('escrow-plans-section');
    if (escrowPlansSection) {
      escrowPlansSection.addEventListener('toggle', () => {
        if (escrowPlansSection.open) refreshEscrowPlansList();
      });
    }

    // ── Create Plan ────────────────────────────────────────────────────────
    const createPlanBtn    = document.getElementById('escrow-create-plan-btn');
    const createPlanStatus = document.getElementById('escrow-create-plan-status');

    if (createPlanBtn) {
      createPlanBtn.addEventListener('click', async () => {
        const name   = (document.getElementById('escrow-plan-name')?.value   || '').trim();
        const token  = (document.getElementById('escrow-plan-token')?.value  || '').trim() || escrowZeroAddr;
        const price  = (document.getElementById('escrow-plan-price')?.value  || '').trim();
        const period = Number(document.getElementById('escrow-plan-period')?.value || 0);

        if (!name) {
          if (createPlanStatus) createPlanStatus.textContent = '⚠️ Enter a plan name.';
          return;
        }
        if (!price || isNaN(Number(price)) || Number(price) <= 0) {
          if (createPlanStatus) createPlanStatus.textContent = '⚠️ Enter a valid price.';
          return;
        }
        if (!period || period <= 0) {
          if (createPlanStatus) createPlanStatus.textContent = '⚠️ Enter a valid period (seconds > 0).';
          return;
        }

        const isEthPlan = !token || token === escrowZeroAddr;
        let priceWei;
        try {
          // ETH and BNUT are 18-decimal; USDC is 6-decimal.
          const usdcAddr = '0x0b2c639c533813f4aa9d7837caf62653d097ff85';
          const isUsdc   = token.toLowerCase() === usdcAddr;
          priceWei = isUsdc
            ? BigInt(Math.round(Number(price) * 1e6))
            : ethers.parseEther(price);
        } catch (_) {
          if (createPlanStatus) createPlanStatus.textContent = '⚠️ Invalid price format.';
          return;
        }

        createPlanBtn.disabled = true;
        if (createPlanStatus) createPlanStatus.textContent = '⏳ Creating plan — confirm in MetaMask…';

        try {
          const { txHash, planId } = await createDecentEscrowPlan(name, token, priceWei, period);
          if (createPlanStatus) {
            createPlanStatus.innerHTML =
              `✅ Plan ${planId} created! ` +
              `<a href="https://optimistic.etherscan.io/tx/${txHash}" target="_blank" rel="noopener noreferrer" style="color:#00e5ff;">↗ Tx</a>`;
          }
          const nameEl   = document.getElementById('escrow-plan-name');
          const tokenEl  = document.getElementById('escrow-plan-token');
          const priceEl  = document.getElementById('escrow-plan-price');
          const periodEl = document.getElementById('escrow-plan-period');
          if (nameEl)   nameEl.value   = '';
          if (tokenEl)  tokenEl.value  = '';
          if (priceEl)  priceEl.value  = '';
          if (periodEl) periodEl.value = '';
          // Refresh the plans list
          await refreshEscrowPlansList();
        } catch (err) {
          if (createPlanStatus) createPlanStatus.textContent = `❌ Failed: ${err.reason || err.message || err}`;
        } finally {
          createPlanBtn.disabled = false;
        }
      });
    }

    // ── Deactivate Plan ────────────────────────────────────────────────────
    const deactivatePlanBtn    = document.getElementById('escrow-deactivate-plan-btn');
    const deactivatePlanStatus = document.getElementById('escrow-deactivate-plan-status');

    if (deactivatePlanBtn) {
      deactivatePlanBtn.addEventListener('click', async () => {
        const planIdInput = document.getElementById('escrow-deactivate-plan-id');
        const planId = Number(planIdInput?.value ?? -1);

        if (planId < 0 || isNaN(planId)) {
          if (deactivatePlanStatus) deactivatePlanStatus.textContent = '⚠️ Enter a valid plan ID (0 or higher).';
          return;
        }

        deactivatePlanBtn.disabled = true;
        if (deactivatePlanStatus) deactivatePlanStatus.textContent = `⏳ Deactivating plan ${planId} — confirm in MetaMask…`;

        try {
          const txHash = await deactivateDecentEscrowPlan(planId);
          if (deactivatePlanStatus) {
            deactivatePlanStatus.innerHTML =
              `✅ Plan ${planId} deactivated! ` +
              `<a href="https://optimistic.etherscan.io/tx/${txHash}" target="_blank" rel="noopener noreferrer" style="color:#00e5ff;">↗ Tx</a>`;
          }
          if (planIdInput) planIdInput.value = '';
          await refreshEscrowPlansList();
        } catch (err) {
          if (deactivatePlanStatus) deactivatePlanStatus.textContent = `❌ Failed: ${err.reason || err.message || err}`;
        } finally {
          deactivatePlanBtn.disabled = false;
        }
      });
    }
  })();

  // ── Wire up existing DNFT + Subscription buttons in dropdown ─────────────

  const aesDnftBtn = document.getElementById('aes-dnft-btn');
  if (aesDnftBtn) {
    aesDnftBtn.addEventListener('click', () => {
      closeAesDropdown();
      openAboutModal(true);
    });
  }

  const aesSubBtn = document.getElementById('aes-sub-btn');
  if (aesSubBtn) {
    aesSubBtn.addEventListener('click', () => {
      closeAesDropdown();
      openSubscriptionModal();
    });
  }

  // ── Subscription Status Modal ─────────────────────────────────────────────

  (function initSubscriptionModal() {
    const subModal  = document.getElementById('subscription-modal');
    const subClose  = document.getElementById('subscription-modal-close');
    if (!subModal) return;

    // ── helpers ──

    function openSubModal(method) {
      subModal.classList.remove('modal-hidden');
      document.body.classList.add('modal-active');
      loadSubscriptionStatus();
      renderPaymentHistory();
      // Load live ETH / BNUT prices from the on-chain contract.
      import('./subscription.js').then(({ loadCryptoPrices }) => loadCryptoPrices()).catch((err) => {
        console.warn('[subscription] could not load crypto prices:', err.message);
      });
      // Optionally switch to a specific payment tab (e.g. 'eth' or 'bnut')
      if (method) {
        const targetTab = subModal.querySelector(`.sub-method-tab[data-method="${method}"]`);
        if (targetTab) targetTab.click();
      }
    }

    function closeSubModal() {
      subModal.classList.add('modal-hidden');
      if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
        document.body.classList.remove('modal-active');
      }
    }

    // Expose so the button above can call it
    window.openSubscriptionModal = openSubModal;

    if (subClose) subClose.addEventListener('click', closeSubModal);
    subModal.addEventListener('click', (e) => {
      if (e.target === subModal) closeSubModal();
    });

    // ── Subscription status ──

    async function loadSubscriptionStatus() {
      const statusBadge   = document.getElementById('sub-status-badge');
      const statusMethod  = document.getElementById('sub-status-method');
      const statusDetails = document.getElementById('sub-status-details');
      const manageRow     = document.getElementById('sub-manage-row');
      const statusCard    = document.getElementById('sub-status-card');

      // Read persisted state from localStorage (set after a successful payment)
      const stored = (() => {
        try { return JSON.parse(localStorage.getItem('bignuten_subscription') || 'null'); }
        catch { return null; }
      })();

      // Also try on-chain if wallet connected
      let onChain = null;
      if (window.connectedWallet) {
        try {
          const { checkSubscriptionStatus } = await import('./subscription.js');
          onChain = await checkSubscriptionStatus(window.connectedWallet);
        } catch (err) { console.warn('[subscription] on-chain status check skipped:', err.message); }
      }

      const isActive = onChain?.isSubscribed || (stored && stored.status === 'active' && new Date(stored.expiry) > new Date());
      const expiry   = onChain?.expiry ? onChain.expiry : (stored?.expiry ? new Date(stored.expiry) : null);
      const method   = stored?.method || null;
      const plan     = stored?.plan   || null;

      if (isActive) {
        statusBadge.textContent = '🟢 Active';
        statusBadge.className   = 'sub-status-badge sub-badge-active';
        statusBadge.setAttribute('aria-label', 'Subscription status: Active');
        statusCard.classList.add('sub-card-active');

        if (method) statusMethod.textContent = method;

        if (statusDetails) {
          statusDetails.style.display = 'block';
          const planEl    = document.getElementById('sub-detail-plan');
          const methodEl  = document.getElementById('sub-detail-method');
          const renewalEl = document.getElementById('sub-detail-renewal');
          const billEl    = document.getElementById('sub-detail-billing');

          if (planEl)    planEl.textContent    = plan   || 'Monthly · $10';
          if (methodEl)  methodEl.textContent  = method || '—';
          if (renewalEl) renewalEl.textContent = expiry ? expiry.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' }) : '—';
          if (billEl)    billEl.textContent    = '✅ Paid';
        }

        if (manageRow) {
          manageRow.style.display = 'flex';
          // Point manage link to the right portal
          const manageLink = document.getElementById('sub-manage-link');
          if (manageLink && method) {
            if (method.toLowerCase().includes('paypal')) {
              manageLink.href = 'https://www.paypal.com/myaccount/autopay/';
            } else if (method.toLowerCase().includes('stripe') || method.toLowerCase().includes('card')) {
              manageLink.href = 'https://billing.stripe.com/p/login/test_00000';
            } else if (method.toLowerCase().includes('eth') || method.toLowerCase().includes('bnut')) {
              // On-chain subscription — link to Optimism Etherscan for the contract
              const subscriptionAddress = (window.CONTRACTS && window.CONTRACTS.subscription) || '';
              manageLink.href = subscriptionAddress && subscriptionAddress !== '0x0000000000000000000000000000000000000000'
                ? `https://optimistic.etherscan.io/address/${subscriptionAddress}`
                : '#';
              manageLink.textContent = '🔍 View on Optimism Explorer';
            } else {
              manageLink.href = '#';
            }
          }
        }
      } else if (expiry && expiry < new Date()) {
        statusBadge.textContent = '🔴 Expired';
        statusBadge.className   = 'sub-status-badge sub-badge-expired';
        statusBadge.setAttribute('aria-label', 'Subscription status: Expired');
        statusCard.classList.remove('sub-card-active');
        if (statusDetails) statusDetails.style.display = 'none';
        if (manageRow)     manageRow.style.display      = 'none';
      } else {
        statusBadge.textContent = '⚪ No Active Plan';
        statusBadge.className   = 'sub-status-badge sub-badge-inactive';
        statusBadge.setAttribute('aria-label', 'Subscription status: No active plan');
        statusCard.classList.remove('sub-card-active');
        if (statusDetails) statusDetails.style.display = 'none';
        if (manageRow)     manageRow.style.display      = 'none';
      }
    }

    // ── Plan toggle (Monthly / Annual) ──

    const planBtns = subModal.querySelectorAll('.sub-plan-btn');
    let currentPlan = 'monthly';

    planBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        planBtns.forEach(b => { b.classList.remove('sub-plan-active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('sub-plan-active');
        btn.setAttribute('aria-selected', 'true');
        currentPlan = btn.dataset.plan;

        // Swap PayPal forms
        const monthlyForm = document.getElementById('sub-paypal-monthly-form');
        const annualForm  = document.getElementById('sub-paypal-annual-form');
        if (monthlyForm) monthlyForm.style.display = currentPlan === 'monthly' ? '' : 'none';
        if (annualForm)  annualForm.style.display  = currentPlan === 'annual'  ? '' : 'none';

        // Update Stripe price label
        const stripePriceLabel = document.getElementById('sub-stripe-price-label');
        if (stripePriceLabel) stripePriceLabel.textContent = currentPlan === 'annual' ? '$99 / year' : '$10 / month';
      });
    });

    // ── Payment method tabs ──

    const methodTabs   = subModal.querySelectorAll('.sub-method-tab');
    const methodPanels = {
      paypal: document.getElementById('sub-panel-paypal'),
      stripe: document.getElementById('sub-panel-stripe'),
      eth:    document.getElementById('sub-panel-eth'),
      bnut:   document.getElementById('sub-panel-bnut'),
    };

    methodTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        methodTabs.forEach(t => { t.classList.remove('sub-tab-active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('sub-tab-active');
        tab.setAttribute('aria-selected', 'true');

        Object.values(methodPanels).forEach(p => { if (p) p.style.display = 'none'; });
        const activePanel = methodPanels[tab.dataset.method];
        if (activePanel) activePanel.style.display = '';
      });
    });

    // ── Stripe button ──

    const stripeBtn    = document.getElementById('sub-stripe-btn');
    const stripeStatus = document.getElementById('sub-stripe-status');
    if (stripeBtn) {
      stripeBtn.addEventListener('click', async () => {
        stripeBtn.disabled = true;
        if (stripeStatus) stripeStatus.textContent = '⏳ Redirecting to Stripe…';
        try {
          const { initStripeSubscription } = await import('./subscription.js');
          const priceId = currentPlan === 'annual'
            ? (window.STRIPE_ANNUAL_PRICE_ID  || 'price_annual_placeholder')
            : (window.STRIPE_MONTHLY_PRICE_ID || 'price_monthly_placeholder');
          await initStripeSubscription(priceId);
        } catch (err) {
          if (stripeStatus) stripeStatus.textContent = `❌ ${err.message || 'Stripe unavailable'}`;
        } finally {
          stripeBtn.disabled = false;
        }
      });
    }

    // ── ETH button ──

    const ethBtn    = document.getElementById('sub-eth-btn');
    const ethStatus = document.getElementById('sub-eth-status');
    if (ethBtn) {
      ethBtn.addEventListener('click', async () => {
        ethBtn.disabled = true;
        if (ethStatus) ethStatus.textContent = '⏳ Opening MetaMask…';
        try {
          const { payCryptoSubscription } = await import('./subscription.js');
          const txHash = await payCryptoSubscription();
          const explorerUrl = `https://optimistic.etherscan.io/tx/${txHash}`;
          if (ethStatus) ethStatus.innerHTML =
            `✅ Subscribed! <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer">View Tx ↗</a>`;
          _saveSubscriptionLocal('ETH / MetaMask', currentPlan, txHash);
          await loadSubscriptionStatus();
          renderPaymentHistory();
        } catch (err) {
          if (ethStatus) ethStatus.textContent = `❌ ${err.message || 'Transaction failed'}`;
        } finally {
          ethBtn.disabled = false;
        }
      });
    }

    // ── $BNUT button ──

    const bnutBtn    = document.getElementById('sub-bnut-btn');
    const bnutStatus = document.getElementById('sub-bnut-status');
    if (bnutBtn) {
      bnutBtn.addEventListener('click', async () => {
        bnutBtn.disabled = true;
        if (bnutStatus) bnutStatus.textContent = '⏳ Opening MetaMask…';
        try {
          const { payBNUTSubscription } = await import('./subscription.js');
          const txHash = await payBNUTSubscription();
          const explorerUrl = `https://optimistic.etherscan.io/tx/${txHash}`;
          if (bnutStatus) bnutStatus.innerHTML =
            `✅ Subscribed! <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer">View Tx ↗</a>`;
          _saveSubscriptionLocal('$BNUT Token', currentPlan, txHash);
          await loadSubscriptionStatus();
          renderPaymentHistory();
        } catch (err) {
          if (bnutStatus) bnutStatus.textContent = `❌ ${err.message || 'Transaction failed'}`;
        } finally {
          bnutBtn.disabled = false;
        }
      });
    }

    // ── Cancel button ──

    const cancelBtn = document.getElementById('sub-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        const stored = (() => {
          try { return JSON.parse(localStorage.getItem('bignuten_subscription') || 'null'); }
          catch { return null; }
        })();

        const methodLower = (stored?.method || '').toLowerCase();
        let cancelUrl = 'https://www.paypal.com/myaccount/autopay/';
        if (methodLower.includes('stripe') || methodLower.includes('card')) {
          cancelUrl = 'https://billing.stripe.com/p/login/test_00000';
        } else if (methodLower.includes('eth') || methodLower.includes('bnut')) {
          // On-chain — clear local record and refresh
          localStorage.removeItem('bignuten_subscription');
          loadSubscriptionStatus();
          return;
        }
        window.open(cancelUrl, '_blank', 'noopener,noreferrer');
      });
    }

    // ── Payment History ──

    function renderPaymentHistory() {
      const listEl = document.getElementById('sub-history-list');
      if (!listEl) return;

      const raw = (() => {
        try { return JSON.parse(localStorage.getItem('bignuten_payment_history') || '[]'); }
        catch { return []; }
      })();

      if (!raw.length) {
        listEl.innerHTML = '<p class="gov-loading" id="sub-history-empty">No payment records found.</p>';
        return;
      }

      listEl.innerHTML = raw.slice().reverse().map(p => `
        <div class="sub-history-item">
          <span class="sub-history-date">${new Date(p.date).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' })}</span>
          <span class="sub-history-desc">${p.description || 'Subscription'}${p.txHash ? ` <a href="https://optimistic.etherscan.io/tx/${p.txHash}" target="_blank" rel="noopener noreferrer" class="sub-history-tx">↗ Tx</a>` : ''}</span>
          <span class="sub-history-amount">${p.amount || ''}</span>
          <span class="${p.ok ? 'sub-history-status-ok' : 'sub-history-status-fail'}">${p.ok ? '✔' : '✖'}</span>
        </div>
      `).join('');
    }

    // ── Helpers ──

    function _saveSubscriptionLocal(method, plan, txHash) {
      const expiry = new Date();
      if (plan === 'annual') expiry.setFullYear(expiry.getFullYear() + 1);
      else expiry.setMonth(expiry.getMonth() + 1);

      const isCrypto = method.toLowerCase().includes('eth') || method.toLowerCase().includes('bnut');

      localStorage.setItem('bignuten_subscription', JSON.stringify({
        status: 'active',
        method,
        plan: isCrypto ? 'Monthly · On-Chain' : (plan === 'annual' ? 'Annual · $99' : 'Monthly · $10'),
        expiry: expiry.toISOString(),
        txHash: txHash || null,
      }));

      // Append to history
      const history = (() => {
        try { return JSON.parse(localStorage.getItem('bignuten_payment_history') || '[]'); }
        catch { return []; }
      })();
      history.push({
        date:        new Date().toISOString(),
        description: `${isCrypto ? 'Monthly (30 days)' : (plan === 'annual' ? 'Annual' : 'Monthly')} plan via ${method}`,
        amount:      isCrypto ? '—' : (plan === 'annual' ? '$99' : '$10'),
        ok:          true,
        txHash:      txHash || null,
      });
      localStorage.setItem('bignuten_payment_history', JSON.stringify(history));
    }

    // Record successful PayPal redirects by detecting query param ?paypal=success
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('paypal') === 'success') {
      const savedPlan = urlParams.get('plan') === 'annual' ? 'annual' : 'monthly';
      _saveSubscriptionLocal('PayPal', savedPlan);
      history.replaceState({}, '', window.location.pathname);
    }

  }());

  (function initPayrollModal() {
    const payrollBtn   = document.getElementById('aes-payroll-btn');
    const payrollModal = document.getElementById('payroll-modal');
    const payrollClose = document.getElementById('payroll-modal-close');

    if (!payrollModal) return;

    // ── Render pending payouts list ───────────────────────────────────────

    function renderPendingList(pending) {
      const listEl = document.getElementById('payroll-pending-list');
      const actionsEl = document.getElementById('payroll-actions');
      if (!listEl) return;

      if (!pending || pending.length === 0) {
        listEl.innerHTML = '<p class="gov-loading">🎉 No pending payouts — queue is empty!</p>';
        if (actionsEl) actionsEl.style.display = 'none';
        return;
      }

      const rows = pending.map((p, i) => `
        <div class="gov-admin-section-body" style="margin-bottom:0.5rem; border:1px solid rgba(0,229,255,0.2); border-radius:6px; padding:0.5rem 0.75rem;">
          <strong>#${i + 1} ${p.issueRef}</strong>
          ${p.contributorGithub ? `<span style="color:#aaa;"> · @${p.contributorGithub}</span>` : ''}
          <br/>
          <span style="color:#00e5ff;">💰 ${p.amount} BNUT</span>
          &nbsp;→&nbsp;
          <code style="font-size:0.78em;">${p.contributor}</code>
          <br/>
          <span style="color:#888; font-size:0.78em;">Queued ${new Date(p.queuedAt).toLocaleDateString()} by @${p.queuedBy}</span>
        </div>
      `).join('');

      listEl.innerHTML = rows;
      if (actionsEl) actionsEl.style.display = 'block';
    }

    function renderSettledList(settled) {
      const listEl = document.getElementById('payroll-settled-list');
      if (!listEl) return;

      if (!settled || settled.length === 0) {
        listEl.innerHTML = '<p class="gov-loading">No settled payouts yet.</p>';
        return;
      }

      // Show most recent first, max 10 entries.
      const recent = [...settled].reverse().slice(0, 10);
      const rows = recent.map(p => {
        const txLink = p.txHash
          ? `<a href="https://optimistic.etherscan.io/tx/${p.txHash}" target="_blank" rel="noopener" style="color:#00e5ff;">${p.txHash.slice(0, 12)}…</a>`
          : '—';
        return `
          <div style="margin-bottom:0.4rem; font-size:0.85rem;">
            <strong>${p.issueRef}</strong> · ${p.amount} BNUT
            → <code style="font-size:0.78em;">${p.contributor}</code>
            · ${txLink}
          </div>
        `;
      }).join('');

      listEl.innerHTML = rows;
    }

    // ── Load queue and populate modal ─────────────────────────────────────

    async function refreshPayrollModal() {
      const balanceEl = document.getElementById('payroll-treasury-balance');

      try {
        // Load queue
        const queue = await loadPayrollQueue();
        renderPendingList(queue.pending);
        renderSettledList(queue.settled);

        // Treasury balance (read-only, no wallet needed)
        const bal = await getTreasuryBalance();
        if (balanceEl) {
          balanceEl.textContent = `🏦 Treasury: ${bal.toLocaleString(undefined, { maximumFractionDigits: 2 })} BNUT`;
          balanceEl.style.display = 'block';
        }
      } catch (err) {
        const listEl = document.getElementById('payroll-pending-list');
        if (listEl) listEl.innerHTML = `<p style="color:#ff6b6b;">❌ ${err.message}</p>`;
      }
    }

    // ── Show Payroll button only to treasury owner ─────────────────────────

    async function maybeShowPayrollButton() {
      if (!payrollBtn || !window.ethereum) return;
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send('eth_accounts', []);
        if (!accounts || accounts.length === 0) return;
        const isOwner = await isTreasuryOwner(accounts[0]);
        payrollBtn.style.display = isOwner ? 'block' : 'none';
      } catch (_) { /* wallet not ready */ }
    }

    // Run on wallet connect or account change.
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', maybeShowPayrollButton);
    }
    // Also check once on load.
    maybeShowPayrollButton();

    // ── Settle Payroll button ─────────────────────────────────────────────

    const settleBtn    = document.getElementById('payroll-settle-btn');
    const settleStatus = document.getElementById('payroll-settle-status');

    if (settleBtn) {
      settleBtn.addEventListener('click', async () => {
        settleBtn.disabled = true;
        if (settleStatus) settleStatus.textContent = '⏳ Loading queue…';

        try {
          const queue = await loadPayrollQueue();
          if (!queue.pending || queue.pending.length === 0) {
            if (settleStatus) settleStatus.textContent = '🎉 No pending payouts!';
            return;
          }

          if (settleStatus) settleStatus.textContent = `⏳ Sending batch payout for ${queue.pending.length} contributor(s) via MetaMask…`;

          const txHash = await settlePayroll(queue.pending);

          if (settleStatus) {
            const txUrl = `https://optimistic.etherscan.io/tx/${txHash}`;
            settleStatus.innerHTML = `✅ Settled! <a href="${txUrl}" target="_blank" rel="noopener" style="color:#00e5ff;">View on Optimism Explorer ↗</a>`;
          }

          // Refresh the list.
          await refreshPayrollModal();
        } catch (err) {
          if (settleStatus) settleStatus.textContent = `❌ ${err.reason || err.message || err}`;
        } finally {
          settleBtn.disabled = false;
        }
      });
    }

    // ── Open modal ────────────────────────────────────────────────────────

    if (payrollBtn) {
      payrollBtn.addEventListener('click', async () => {
        closeAesDropdown();
        payrollModal.classList.remove('modal-hidden');
        document.body.classList.add('modal-active');
        await refreshPayrollModal();
      });
    }

    // ── Close modal ───────────────────────────────────────────────────────

    if (payrollClose) {
      payrollClose.addEventListener('click', () => {
        payrollModal.classList.add('modal-hidden');
        if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
          document.body.classList.remove('modal-active');
        }
      });
    }

    payrollModal.addEventListener('click', (e) => {
      if (e.target === payrollModal) {
        payrollModal.classList.add('modal-hidden');
        if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
          document.body.classList.remove('modal-active');
        }
      }
    });
  })();
});
