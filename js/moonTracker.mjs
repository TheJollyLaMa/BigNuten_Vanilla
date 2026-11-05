import { Astronomy, checkedDate, lunarState, localCalendar, localDate, heliocentric, lunarVector } from './lunarAstronomy.mjs';

const PLANETS = [
  ['Mercury', '#b6b0a7'], ['Venus', '#f4d18c'], ['Earth', '#58baff'], ['Mars', '#ff795d'],
  ['Jupiter', '#dcb58d'], ['Saturn', '#edd59f'], ['Uranus', '#8ee2e5'], ['Neptune', '#758eff'],
];
const STORIES = [
  ['Kamada', 'kamada'], ['Varuthini', 'varuthini'], ['Mohini', 'mohini'], ['Apara', 'apara'],
  ['Pandava Nirjala', 'pandava-nirjala'], ['Yogini', 'yogini'], ['Sayana', 'sayana'], ['Kamika', 'kamika'],
  ['Pavitropana', 'pavitropana'], ['Aja', 'aja-annada'], ['Parsva', 'parsva'], ['Indira', 'indira'],
  ['Papankusha', 'papankusha'], ['Rama', 'rama'], ['Utthana', 'utthana'], ['Utpanna', 'utpanna'],
  ['Mokshada', 'mokshada'], ['Saphala', 'saphala'], ['Putrada', 'putrada'], ['Sat-Tila', 'sattila'],
  ['Bhaimi', 'bhaimi'], ['Vaikuntha', 'vaikuntha'], ['Amalaki', 'amalaki'], ['Papamochani', 'papamochani'],
];
let linked = null;
let refreshTracker = () => {};
const el = id => document.getElementById(id);
const text = (id, value) => { if (el(id)) el(id).textContent = value; };

export function requestLocation() {
  el('moon-location-details').open = true;
  if (!navigator.geolocation) {
    text('location-info', 'Location unavailable: this browser does not support geolocation. Enter coordinates below.');
    return;
  }
  text('location-info', 'Requesting location…');
  navigator.geolocation.getCurrentPosition(position => {
    el('moon-latitude').value = position.coords.latitude.toFixed(5);
    el('moon-longitude').value = position.coords.longitude.toFixed(5);
    text('location-info', 'Coordinates filled. Confirm the location’s timezone, then choose Apply location.');
  }, error => {
    text('location-info', `Location unavailable: ${error.message}. You can enter coordinates manually.`);
  }, { timeout: 15000, maximumAge: 300000 });
}

function format(date, timeZone) {
  return date ? new Intl.DateTimeFormat(undefined, {
    timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date) : 'Unavailable (no event in this search window)';
}

export function initMoonTracker() {
  if (!el('moon-modal')) return;
  el('moon-timezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let cacheKey = '';
  let calendar = null;
  const notified = new Set();
  let notifications = false;

  refreshTracker = () => {
    try {
      const now = new Date();
      const state = lunarState(now);
      const zone = linked?.timeZone || el('moon-timezone').value;
      text('moon-info', `${state.name} · Tithi ${state.tithi}/30 · ${(state.illumination * 100).toFixed(1)}% illuminated\n` +
        `Moon age: ${state.ageDays.toFixed(2)} elapsed days since new moon\n` +
        `Tithi: ${format(state.start, zone)} → ${format(state.end, zone)}`);
      text('ekadasi-info', 'Link a location to calculate Jolly’s moonrise rule. Astronomical tithis are shown separately.');
      el('moon-icon')?.removeAttribute('data-observance');
      if (!linked) return;
      const key = `${state.newMoon.toISOString()}/${localDate(now, zone)}/${linked.latitude}/${linked.longitude}/${zone}`;
      if (key !== cacheKey) {
        calendar = localCalendar(now, linked.latitude, linked.longitude, zone);
        cacheKey = key;
      }
      const count = calendar.rises.filter(rise => rise <= now).length;
      text('location-info', `Location: ${linked.latitude}, ${linked.longitude} · ${zone} (confirmed)\n` +
        'Coordinates stay in this page session; no server or profile upload.');
      text('moon-local-events', `Local moonrise count: ${count || 'awaiting first moonrise'} since new moon\n` +
        `Sunrise: ${format(calendar.sunrise, zone)}\nMoonrise: ${format(calendar.moonrise, zone)}`);
      const upcoming = calendar.upcoming;
      if (!upcoming) {
        text('ekadasi-info', 'Jolly’s rule unavailable: target moonrise or following sunrise absent in the search window.');
        return;
      }
      const today = localDate(now, zone);
      const isToday = localDate(upcoming.sunrise, zone) === today;
      const missing = calendar.observances.filter(event => !event.sunrise).map(event => event.reason);
      text('ekadasi-info', `Jolly’s rule · ${isToday ? 'Observance date is today' : 'Next observance'}: ${format(upcoming.sunrise, zone)}\n` +
        `Day ${upcoming.targetDay} begins at local moonrise: ${format(upcoming.moonrise, zone)}\n` +
        `Previous sunset (preparation): ${format(calendar.sunset, zone)}\n` +
        'Custom calendar — see the method and limitations below.' +
        (missing.length ? `\nUnavailable in this lunation: ${missing.join(' ')}` : ''));
      el('moon-icon')?.setAttribute('data-observance', isToday ? 'today' : 'upcoming');
      const eventKey = `${cacheKey}/${upcoming.targetDay}`;
      const hours = (upcoming.sunrise - now) / 3600000;
      if (notifications && hours >= 0 && hours <= 24 && !notified.has(eventKey)) {
        new Notification('BigNuten · Jolly’s rule', {
          body: `Upcoming local observance: ${format(upcoming.sunrise, zone)}. See the tracker for preparation and limitations.`,
        });
        notified.add(eventKey);
      }
    } catch (error) {
      text('moon-info', `Astronomy unavailable: ${error.message}`);
      text('ekadasi-info', 'Observance unavailable. Do not rely on an earlier result.');
      text('moon-local-events', '');
      el('moon-icon')?.removeAttribute('data-observance');
      console.error('Moon tracker:', error);
    }
  };
  el('moon-location-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const latitude = Number(el('moon-latitude').value);
      const longitude = Number(el('moon-longitude').value);
      const timeZone = el('moon-timezone').value.trim();
      if (!el('moon-latitude').value.trim() || !el('moon-longitude').value.trim()) throw new Error('Both coordinates are required.');
      const candidate = localCalendar(new Date(), latitude, longitude, timeZone);
      linked = { latitude, longitude, timeZone };
      calendar = candidate;
      cacheKey = '';
      el('moon-location-details').open = false;
      refreshTracker();
    } catch (error) {
      text('location-info', `Location not applied: ${error.message}${linked ? ' Previous applied coordinates and timezone remain active.' : ''}`);
    }
  });
  el('moon-clear-location').addEventListener('click', () => {
    linked = null;
    calendar = null;
    cacheKey = '';
    el('moon-latitude').value = '';
    el('moon-longitude').value = '';
    el('moon-location-details').open = true;
    text('location-info', 'Location not linked. Confirm a timezone matching your coordinates, not necessarily your device.');
    text('moon-local-events', '');
    refreshTracker();
  });
  el('moon-notifications').addEventListener('click', async () => {
    try {
      if (!('Notification' in window)) throw new Error('Browser notifications are unsupported.');
      if (notifications) {
        notifications = false;
        el('moon-notifications').textContent = 'Enable page-session reminders';
        text('moon-notification-status', 'Page-session reminders turned off.');
        return;
      }
      notifications = await Notification.requestPermission() === 'granted';
      el('moon-notifications').textContent = notifications ? 'Turn off page-session reminders' : 'Enable page-session reminders';
      text('moon-notification-status', notifications
        ? 'Reminders on for this page session only. The page must remain open and active; background/closed-browser delivery is not guaranteed.'
        : 'Notification permission not granted. Use the visible calendar instead.');
      refreshTracker();
    } catch (error) {
      text('moon-notification-status', `Reminders unavailable: ${error.message}`);
    }
  });
  const list = el('ekadasi-links');
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Ekadasi story library (not a dated calendar)';
  details.append(summary);
  for (const [name, slug] of STORIES) {
    const link = document.createElement('a');
    link.href = `https://iskcondesiretree.com/page/${slug}-ekadasi`;
    link.textContent = `${name} Ekadasi`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    details.append(link, document.createElement('br'));
  }
  list.replaceChildren(details);
  text('location-info', 'Location not linked. Confirm a timezone matching your coordinates, not necessarily your device.');
  refreshTracker();
  setInterval(() => { if (!document.hidden) refreshTracker(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshTracker(); });
  new MutationObserver(() => {
    if (!el('moon-modal').classList.contains('modal-hidden')) refreshTracker();
  }).observe(el('moon-modal'), { attributes: true, attributeFilter: ['class'] });
  initPlanetarium();
}

function initPlanetarium() {
  const canvas = el('solar-system-canvas');
  const context = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let simulation = null;
  let playing = false;
  let outer = false;
  let frame = null;
  let previous = 0;
  let positions = [];
  const currentDate = () => simulation || new Date();
  const active = () => !document.hidden && el('ss-details').open && !el('moon-modal').classList.contains('modal-hidden');
  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previous = 0;
  };
  const draw = () => {
    try {
      const date = checkedDate(currentDate());
      const size = Math.max(220, Math.min(canvas.parentElement.clientWidth - 24, 600));
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * ratio);
      canvas.height = Math.round(size * ratio);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const cx = size / 2;
      const max = outer ? 32 : 1.8;
      const scale = r => (cx - 28) * Math.pow(r / max, 0.48);
      const sky = context.createRadialGradient(cx, cx, 0, cx, cx, cx);
      sky.addColorStop(0, '#14243e');
      sky.addColorStop(1, '#030712');
      context.fillStyle = sky;
      context.fillRect(0, 0, size, size);
      context.fillStyle = '#acc3df';
      for (let i = 0; i < 80; i++) context.fillRect((Math.sin(i * 37) + 1) * size / 2, (Math.cos(i * 71) + 1) * size / 2, 1, 1);
      context.strokeStyle = '#839ab533';
      for (const au of outer ? [1, 5, 10, 20, 30] : [0.4, 0.7, 1, 1.5]) {
        context.beginPath();
        context.arc(cx, cx, scale(au), 0, 2 * Math.PI);
        context.stroke();
      }
      const sun = context.createRadialGradient(cx, cx, 1, cx, cx, 22);
      sun.addColorStop(0, '#fffbd6');
      sun.addColorStop(0.25, '#ffd45c');
      sun.addColorStop(1, '#ffc14d00');
      context.fillStyle = sun;
      context.fillRect(cx - 22, cx - 22, 44, 44);
      positions = [];
      const rows = [];
      const labels = [];
      const planets = outer ? PLANETS : PLANETS.slice(0, 4);
      planets.forEach(([name, color], index) => {
        const vector = heliocentric(name, date);
        const angle = Math.atan2(vector.y, vector.x);
        const px = cx + scale(vector.radius) * Math.cos(angle);
        const py = cx - scale(vector.radius) * Math.sin(angle);
        const radius = name === 'Jupiter' || name === 'Saturn' ? 7 : 5;
        const surface = context.createRadialGradient(px - 2, py - 2, 0, px, py, radius);
        surface.addColorStop(0, '#ffffff');
        surface.addColorStop(0.3, color);
        surface.addColorStop(1, '#101725');
        context.fillStyle = surface;
        context.beginPath();
        context.arc(px, py, radius, 0, 2 * Math.PI);
        context.fill();
        if (name === 'Saturn') {
          context.strokeStyle = color;
          context.beginPath();
          context.ellipse(px, py, 12, 4, -0.3, 0, 2 * Math.PI);
          context.stroke();
        }
        context.fillStyle = '#e3efff';
        context.font = '12px sans-serif';
        const labelX = Math.min(size - 18, px + 8);
        let labelY = Math.max(14, py - 7);
        while (labels.some(label => Math.abs(label.x - labelX) < 20 && Math.abs(label.y - labelY) < 16)) labelY += 16;
        if (labelY !== Math.max(14, py - 7)) {
          context.strokeStyle = '#bcd3ec88';
          context.beginPath();
          context.moveTo(px + radius, py);
          context.lineTo(labelX, labelY - 5);
          context.stroke();
        }
        labels.push({ x: labelX, y: labelY });
        context.fillText(`${index + 1}`, labelX, labelY);
        if (name === 'Earth') {
          const moon = lunarVector(date);
          const a = Math.atan2(moon.y, moon.x);
          context.fillStyle = '#e2e8f0';
          context.beginPath();
          context.arc(px + 16 * Math.cos(a), py - 16 * Math.sin(a), 2.5, 0, 2 * Math.PI);
          context.fill();
        }
        positions.push({ name, px, py, radius: vector.radius });
        rows.push(`${index + 1}. ${name}: ${vector.radius.toFixed(3)} AU`);
      });
      text('ss-timestamp', `${simulation ? 'Simulation' : 'Now'} · ${date.toISOString().replace('T', ' ').replace('Z', ' UTC')}`);
      text('ss-planet-list', rows.join(' · '));
      text('ss-error', '');
    } catch (error) {
      playing = false;
      stop();
      text('ss-error', `Planetary positions unavailable: ${error.message}`);
      text('ss-planet-list', '');
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    el('ss-play').textContent = playing ? 'Pause' : 'Play simulation';
  };
  const tick = ts => {
    frame = null;
    if (!active()) { previous = 0; return; }
    if (previous && ts - previous < 100) {
      frame = requestAnimationFrame(tick);
      return;
    }
    if (playing && simulation) {
      simulation = new Date(simulation.getTime() + (previous ? ts - previous : 0) * 10800);
    }
    previous = ts;
    draw();
    if (playing && !reduced.matches && active()) frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    stop();
    if (active()) {
      draw();
      if (playing && !reduced.matches) frame = requestAnimationFrame(tick);
    }
  };
  el('ss-play').addEventListener('click', () => {
    if (reduced.matches) {
      text('ss-error', 'Reduced motion is enabled. Choose a date or use +1 day instead.');
      return;
    }
    simulation ||= new Date();
    playing = !playing;
    sync();
  });
  el('ss-now').addEventListener('click', () => {
    simulation = null;
    playing = false;
    el('ss-date').value = new Date().toISOString().slice(0, 10);
    sync();
  });
  el('ss-next-day').addEventListener('click', () => {
    simulation = new Date(currentDate().getTime() + 86400000);
    playing = false;
    el('ss-date').value = simulation.toISOString().slice(0, 10);
    sync();
  });
  el('ss-date').addEventListener('change', event => {
    try {
      simulation = checkedDate(`${event.target.value}T12:00:00Z`);
      playing = false;
      sync();
    } catch (error) { text('ss-error', error.message); }
  });
  el('ss-toggle-outer').addEventListener('click', () => {
    outer = !outer;
    el('ss-toggle-outer').textContent = outer ? 'Show inner planets' : 'Show outer planets';
    sync();
  });
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const selected = positions.find(p => Math.hypot(p.px - x, p.py - y) < 18);
    text('ss-planet-info', selected ? `${selected.name} · ${selected.radius.toFixed(4)} AU from the Sun` : '');
  });
  el('ss-details').addEventListener('toggle', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', sync);
  reduced.addEventListener('change', () => { if (reduced.matches) playing = false; sync(); });
  new MutationObserver(sync).observe(el('moon-modal'), { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (active() && !playing && !simulation) draw(); }, 10000);
}
