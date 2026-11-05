# Moon, Sun and local observance

The tracker separates three quantities that the old "Moon Day" label mixed:

- **Moon age:** elapsed 24-hour days since the calculated astronomical new moon.
- **Tithi:** the current 12-degree interval of geocentric Sun–Moon ecliptic longitude separation. The two conventional Ekadasi tithis are 11 and 26.
- **Local lunar day:** day 1 begins at new moon, and each subsequent local moonrise starts the next numbered day. This is not a tithi or a sequence of equal-length days. It is one greater than the number of post-new-moon moonrise events so far.

## Jolly's custom rule

For #419, the project owner's acceptance case is the moonrise early on
November 4 starting day 25, before that day's sunrise. The corrected numbering is:

1. Day 1 is the opening interval beginning at astronomical new moon.
2. The first subsequent local moonrise starts day 2; each further rise increments the day.
3. Day 11 and day 25 each select the **first local sunrise at or after their starting moonrise**.
4. Display the preceding sunset as a preparation reference.

A target moonrise after today's sunrise therefore selects a later sunrise.
Equality selects that sunrise. The counter resets to day 1 at each new moon.
Short intervals around new moon and missing rises are not replaced with
invented 24-hour days.

This is explicitly **not a verified ISKCON/Gaudiya Vaishnava calendar**.
It does not implement arunodaya/viddha rules, Maha-Dvadashi, lunar-month naming,
intercalary-month story selection or parana windows. The story library is
available independently, without a falsely calculated "current" named story.
It makes no medical claim or universal last-meal/dry-fasting prescription.
The custom reset convention reproduces the reported November dates, but
has not been independently verified against The Moon iPhone app across other
cycles. The initial PR incorrectly omitted the opening interval and selected
November 5; that was an off-by-one error, not a correction to the user's report.

### November report

At the public reference location Syracuse, NY (43.0481, -76.1474),
at 05:46 America/New_York:

| Date (2026) | Tithi | Local lunar day |
| --- | --- | --- |
| November 3 | 25: Krishna Dashami | 24 |
| November 4 | 26: Krishna Ekadasi | 25 |
| November 5 | 27: Krishna Dvadashi | 26 |

The moonrise starting local day 25 occurs on November 4 at approximately
01:43 EST, before sunrise at approximately 06:43 EST. The rule therefore
selects **November 4**, not November 5. This does **not** establish an official religious
observance date for either day. The original screenshots are not included
in the repository.

## Location, clocks and privacy

Use Link Location only when desired, or enter coordinates manually. Confirm
an IANA timezone matching the selected place, e.g. `America/New_York`.
The device timezone is only an editable initial suggestion: browser
geolocation does not supply a timezone and the app does not silently infer
one from longitude. Coordinate/timezone matching is user-confirmed, not an
automated geographic lookup.

Coordinates remain in the page session; they are not saved to a profile,
sent to an astronomy service or included in health exports. Clear linked
location removes the active coordinates and their input fields. Invalid
input reports an error and explicitly identifies whether the last applied
location remains active.

The calculation uses actual rise events, not 06:00, civil midnight, a custom
health-log day boundary, or the user's waking time. Local calendar dates use
the confirmed timezone, including DST. Missing moonrise/sunrise at high
latitudes produces unavailable states; a later available sunrise is labelled
with its actual date rather than assumed to be tomorrow. Rise searches are
bounded to the current/next lunation and three additional days for sunrise.

Reminders are separately opt-in and can be turned off in the tracker.
They run only in the current page session, with session-only deduplication
by local date, location and target. The app checks at one-minute intervals
while visible and on visibility/reopen. It is not a background scheduler:
closed-browser, suspended-tab, or timely operating-system delivery is not
guaranteed. Reopening checks the current result. Reminders within 24 hours
of an upcoming custom sunrise are preparation notices, not dietary advice.

## Planetary explorer

Now displays the actual instant and refreshes while the visible explorer
is open. Simulation is opt-in: play/pause, +1 day, a date at 12:00 UTC, or
reset to now. Play advances three simulated hours per real second. Motion
is disabled for reduced-motion preference; date selection and stepping
still work. Animation stops while the modal/details/page is hidden and
resumes without a hidden-time jump.

Positions are heliocentric geometric vectors in the J2000 ecliptic frame,
viewed from ecliptic north. This is **not a local visible-sky chart**.
Distances are power-law compressed, body sizes and Moon separation are
enlarged, and stars are decorative. Circular rings are explicitly distance
guides, not claimed orbital trajectories. The Moon's direction is computed
in the same frame and at the same simulated instant as the planets.
Text distances provide a non-canvas alternative.

## Engine, licensing and measured accuracy

Astronomy Engine **2.1.19**, by Don Cross, is pinned in the lockfile.
`js/vendor/astronomy-engine.mjs` is its unchanged ESM distribution with
the MIT license notice intact. Static Pages/IPFS deployments therefore
work offline after their assets are available, without resolving
`node_modules` or fetching a third-party ephemeris at runtime.
A test verifies the distribution matches the installed pinned package.

The declared application date range is **2024–2030**, inclusive. Calculation
errors are surfaced; results outside that range are not advertised.
Rise calculations use an observer at sea-level elevation and the engine's
standard horizon/refraction/body-radius conventions, not local terrain,
weather or an observed skyline. Real observed rises can differ.

Offline reference fixtures record retrieval provenance:

- US Naval Observatory: 347 primary phase times across 2024–2030,
  rounded to the minute. Maximum measured difference: **79.50 seconds**.
- JPL Horizons: 210 tithi transition instants, 30 consecutive boundaries
  starting each January of 2024–2030. Independent geometric geocentric
  Sun/Moon vectors and angular velocities convert longitude residual to
  an equivalent transition-time error. Maximum: **9.89 seconds**.
- JPL Horizons: all eight planets on 28 quarterly dates across 2024–2030,
  matched geometric heliocentric ecliptic J2000 vectors with UT inputs.
  Maximum angular difference: **0.005767 degrees**.
- USNO sunrise and moonrise for the public Syracuse fixture on November 4,
  2026, both checked to within **two minutes**, including reference rounding.

These are **sampled maxima, not exhaustive error bounds** for every instant
or location. Tests enforce <=120 seconds for phase/tithi checks and <=0.1
degree for planetary angular checks. No independent authority has validated
the project's custom religious rule; astronomical agreement is not that
validation.

Run `node --test test/lunarAstronomy.test.js`,
`node test/moonTracker.browser.mjs` and `node test/browser-smoke.mjs`.
The focused and full browser checks are also part of `npm run test:smoke`.
Reference refresh is a deliberate development
operation requiring public USNO/JPL access:
`node scripts/refreshAstronomyReferences.mjs`. Normal tests use saved fixtures
and never contact those services.

## Reuse decision

Receiving need: accurate astronomy and location-dependent moonrise/sunrise
selection without hiding the custom rule behind a conventional calendar.
Adapt the existing BigNuten modal, icon, story destinations and browser
fixtures from main `650638d`; replace the fixed mean-month/06:00 calculator
and static J2000 orbital approximation. Canopy's inspected inventory had no
astronomy lead, and the known BigNuten worktrees had no tracker implementation.
This is a scoped search, not whole-library coverage.

Use the established MIT Astronomy Engine rather than writing another
ephemeris. Its runtime/licensing fit a static browser app; no wallet,
health-storage, service-auth or chain contract is introduced. Existing
health records and unrelated worktrees are untouched.
