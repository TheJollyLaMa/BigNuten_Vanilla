export const COMPETITION_ENGINE_VERSION = 2;

export async function competitionEngineVersion(contract) {
  if (typeof contract?.competitionEngineVersion !== 'function') return 0;
  try {
    const value = Number(await contract.competitionEngineVersion());
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch (error) {
    if (error?.code === 'CALL_EXCEPTION' || error?.code === 'BAD_DATA') return 0;
    throw error;
  }
}

export async function supportsCompetitionEngineV2(contract) {
  return (await competitionEngineVersion(contract)) >= COMPETITION_ENGINE_VERSION;
}

function isComplete(entrant) {
  return Number(entrant.status) === 1;
}

function needsReport(entrant, week) {
  return Number(entrant.reportsSubmitted) <= week;
}

export function legacyCheckinBlockReason({ entrant, attendance, competition, config, week, progress }) {
  if (needsReport(entrant, week) && isComplete(entrant)) {
    return 'This deployed escrow cannot record a weekly report after completion. No transaction was sent. Wait for a compatible engine deployment; your existing check-in and report count are unchanged.';
  }
  const soloWillComplete = !attendance.checkedIn &&
    Number(competition.entrantCount) === 1 &&
    Number(entrant.status) === 0 &&
    Number(entrant.verifiedMeetups) + 1 >= Number(config.requiredMeetups) &&
    Number(progress?.totalDays) >= Number(config.requiredActivityDays) &&
    needsReport(entrant, week);
  if (soloWillComplete) {
    return 'This deployed escrow cannot record the final weekly report after a solo check-in completes the challenge. No transaction was sent. Wait for a compatible engine deployment before the final check-in.';
  }
  return '';
}

export async function handleWeeklyCheckin({
  reader,
  compId,
  week,
  account,
  connectSigner,
  prepareSubmission,
  onReportConfirmed,
}) {
  if (!account) throw new Error('Connect the enrolled wallet before checking in.');
  if (!Number.isSafeInteger(Number(compId)) || Number(compId) < 0 ||
      !Number.isSafeInteger(Number(week)) || Number(week) < 0) {
    throw new Error('Invalid competition or meetup week.');
  }
  const [competition, config, entrant, attendance, version] = await Promise.all([
    reader.getCompetition(compId),
    reader.getStreakChallenge(compId),
    reader.getStreakEntrant(compId, account),
    reader.meetupAttendance(compId, week, account),
    competitionEngineVersion(reader),
  ]);
  if (!entrant.joined) throw new Error('This wallet is not enrolled in the challenge.');
  if (!config.enabled || Number(competition.status) !== 0) throw new Error('This challenge is not active.');
  if (Number(entrant.status) === 2) throw new Error('Forfeited entrants cannot check in or submit reports.');
  if (Number(entrant.reportsSubmitted) < week) {
    throw new Error(`Weekly report ${Number(entrant.reportsSubmitted) + 1} is missing. This check-in is unchanged; recover earlier weekly reports in order before continuing.`);
  }
  const reportNeeded = needsReport(entrant, week);
  if (version < COMPETITION_ENGINE_VERSION) {
    const blocked = legacyCheckinBlockReason({ entrant, attendance, competition, config, week, progress: null });
    if (blocked && isComplete(entrant)) throw new Error(blocked);
  }

  const submission = attendance.checkedIn
    ? { progress: null, publish: async () => '' }
    : await prepareSubmission({ account, competition, config, attendance });
  if (submission.cancelled) return { cancelled: true };
  if (version < COMPETITION_ENGINE_VERSION) {
    const blocked = legacyCheckinBlockReason({ entrant, attendance, competition, config, week, progress: submission.progress });
    if (blocked) throw new Error(blocked);
  }

  const { account: signerAccount, signer, contract } = await connectSigner();
  if (signerAccount.toLowerCase() !== account.toLowerCase()) {
    throw new Error('The connected wallet changed. No check-in or report transaction was sent.');
  }

  const reportCid = reportNeeded ? await submission.publish({ account, signer, contract }) : '';
  if (reportCid === null) return { cancelled: true };
  if (!attendance.checkedIn) {
    await (await contract.selfCheckInMeetup(
      compId,
      week,
      submission.inviteCode,
      submission.progress.totalDays,
      submission.progress.weeklyDays,
      submission.goalMet,
      submission.progressHash
    )).wait();
  }

  const [confirmedAttendance, afterCheckin] = await Promise.all([
    reader.meetupAttendance(compId, week, account),
    reader.getStreakEntrant(compId, account),
  ]);
  if (!confirmedAttendance.checkedIn) {
    throw new Error('Check-in transaction was not confirmed on-chain. No weekly report was sent; refresh before retrying.');
  }
  if (
    version < COMPETITION_ENGINE_VERSION &&
    needsReport(afterCheckin, week) &&
    isComplete(afterCheckin)
  ) {
    throw new Error('Check-in is confirmed, but this deployed escrow cannot record the weekly report after completion. No report transaction was sent.');
  }
  if (Number(afterCheckin.reportsSubmitted) < week) {
    throw new Error(`Check-in is confirmed, but earlier reports are missing (${afterCheckin.reportsSubmitted}/${week}). No duplicate weekly report was sent.`);
  }

  let reportSent = false;
  if (Number(afterCheckin.reportsSubmitted) === week) {
    await (await contract.submitReport(compId, reportCid)).wait();
    reportSent = true;
  }
  const finalEntrant = await reader.getStreakEntrant(compId, account);
  if (Number(finalEntrant.reportsSubmitted) < week + 1) {
    throw new Error('Check-in is confirmed, but the weekly report is not yet confirmed on-chain. Retry to recover without repeating the check-in.');
  }
  if (reportCid && onReportConfirmed) {
    await onReportConfirmed({ reportCid, account, signer, contract, progressHash: submission.progressHash });
  }
  return {
    alreadyCheckedIn: Boolean(attendance.checkedIn),
    alreadyReported: !reportSent,
    reportsSubmitted: Number(finalEntrant.reportsSubmitted),
    status: Number(finalEntrant.status),
  };
}
