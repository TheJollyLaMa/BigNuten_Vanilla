const assert = require('node:assert/strict');
const test = require('node:test');

let checkinModule;
let handleWeeklyCheckin;
async function getCheckinModule() {
  checkinModule ||= await import('../js/streakCheckin.mjs');
  handleWeeklyCheckin = checkinModule.handleWeeklyCheckin;
  return checkinModule;
}

function fixture({
  version,
  status = 0,
  reportsSubmitted = 0,
  verifiedMeetups = 0,
  entrantCount = 2,
  checkedIn = false,
  submitFailures = 0,
} = {}) {
  const state = {
    entrant: {
      joined: true, reportsSubmitted, verifiedMeetups, verifiedActivityDays: 0,
      place: 0, qualifiedAt: 0, disqualified: false, status,
    },
    attendance: { checkedIn, peerApproved: false },
    selfCheckCalls: 0,
    reportCalls: 0,
    proofCIDs: [],
    connectCalls: 0,
    prepareCalls: 0,
    reportFailures: submitFailures,
  };
  const competition = {
    status: 0, entrantCount, totalWeeks: 4, stakeToken: '0x0000000000000000000000000000000000000000',
  };
  const config = { enabled: true, requiredMeetups: 4, requiredActivityDays: 28 };
  const reader = {
    ...(version === undefined ? {} : { competitionEngineVersion: async () => version }),
    getCompetition: async () => competition,
    getStreakChallenge: async () => config,
    getStreakEntrant: async () => ({ ...state.entrant }),
    meetupAttendance: async () => ({ ...state.attendance }),
  };
  const connectSigner = async () => {
    state.connectCalls += 1;
    return {
      account: '0xabc',
      signer: {},
      contract: {
        selfCheckInMeetup: async () => {
          state.selfCheckCalls += 1;
          state.attendance.checkedIn = true;
          return { wait: async () => ({ status: 1 }) };
        },
        submitReport: async (_compId, proofCID) => {
          state.reportCalls += 1;
          state.proofCIDs.push(proofCID);
          if (state.reportFailures > 0) {
            state.reportFailures -= 1;
            throw new Error('simulated report transaction failure');
          }
          state.entrant.reportsSubmitted += 1;
          return { wait: async () => ({ status: 1 }) };
        },
      },
    };
  };
  const run = (week = 0, overrides = {}) => handleWeeklyCheckin({
    reader,
    compId: 7,
    week,
    account: '0xabc',
    connectSigner,
    prepareSubmission: async () => {
      state.prepareCalls += 1;
      return {
        inviteCode: 'local',
        progress: { totalDays: 28, weeklyDays: 7 },
        goalMet: true,
        progressHash: `0x${'1'.repeat(64)}`,
        publish: async () => '',
      };
    },
    ...overrides,
  });
  return { state, run };
}

test('unknown deployed version fails closed and does not prompt a signer', async () => {
  const { competitionEngineVersion } = await getCheckinModule();
  const { state, run } = fixture({ status: 1, reportsSubmitted: 3, checkedIn: true });
  assert.equal(await competitionEngineVersion({ competitionEngineVersion: async () => { throw { code: 'CALL_EXCEPTION' }; } }), 0);
  await assert.rejects(run(3), /cannot record a weekly report after completion/);
  assert.equal(state.prepareCalls, 0);
  assert.equal(state.connectCalls, 0);
  assert.equal(state.selfCheckCalls, 0);
  assert.equal(state.reportCalls, 0);
});

test('legacy solo final check-in is explained before requesting a signer', async () => {
  await getCheckinModule();
  const { state, run } = fixture({ status: 0, reportsSubmitted: 3, verifiedMeetups: 3, entrantCount: 1 });
  await assert.rejects(run(3), /final weekly report after a solo check-in completes/);
  assert.equal(state.prepareCalls, 1);
  assert.equal(state.connectCalls, 0);
  assert.equal(state.selfCheckCalls, 0);
  assert.equal(state.reportCalls, 0);
});

test('confirmed check-in recovers a failed report without repeating check-in or report', async () => {
  await getCheckinModule();
  const { state, run } = fixture({ version: 2, submitFailures: 1 });
  await assert.rejects(run(), /simulated report transaction failure/);
  assert.equal(state.attendance.checkedIn, true);
  assert.equal(state.selfCheckCalls, 1);
  assert.equal(state.reportCalls, 1);

  const recovered = await run();
  assert.equal(recovered.alreadyCheckedIn, true);
  assert.equal(recovered.alreadyReported, false);
  assert.equal(recovered.reportsSubmitted, 1);
  assert.equal(state.prepareCalls, 1);
  assert.equal(state.selfCheckCalls, 1);
  assert.equal(state.reportCalls, 2);
  assert.deepEqual(state.proofCIDs, ['', '']);

  const repeated = await run();
  assert.equal(repeated.alreadyReported, true);
  assert.equal(repeated.reportsSubmitted, 1);
  assert.equal(state.selfCheckCalls, 1);
  assert.equal(state.reportCalls, 2);
});

test('source fixture engine version permits weekly report after completion', async () => {
  await getCheckinModule();
  const { state, run } = fixture({ version: 2, status: 1, entrantCount: 1 });
  state.attendance.checkedIn = true;
  const result = await run();
  assert.equal(result.alreadyCheckedIn, true);
  assert.equal(result.alreadyReported, false);
  assert.equal(state.connectCalls, 1);
  assert.equal(state.selfCheckCalls, 0);
  assert.equal(state.reportCalls, 1);
});

test('report gaps and wallet changes fail without duplicate check-in or false success', async () => {
  await getCheckinModule();
  const { state, run } = fixture({ version: 2, checkedIn: true, reportsSubmitted: 0 });
  await assert.rejects(run(1), /earlier weekly reports are missing|weekly report 1 is missing/i);
  assert.equal(state.connectCalls, 0);
  assert.equal(state.reportCalls, 0);

  const second = fixture({ version: 2 });
  await assert.rejects(second.run(0, {
    connectSigner: async () => ({ account: '0xdef', signer: {}, contract: {} }),
  }), /wallet changed/);
  assert.equal(second.state.selfCheckCalls, 0);
  assert.equal(second.state.reportCalls, 0);
});
