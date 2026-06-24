const { runSmartAlerts } = require("../services/notifications/smartAlertService");

let smartAlertTimer = null;

function millisecondsUntilNextRun(now = new Date()) {
  const nextRun = new Date(now);
  nextRun.setHours(8, 0, 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  return nextRun.getTime() - now.getTime();
}

async function runSmartAlertJob() {
  try {
    const summary = await runSmartAlerts();
    console.log(`[Smart Alerts] created=${summary.created} skipped=${summary.skipped} errors=${summary.errors}`);
    return summary;
  } catch (error) {
    console.error("[Smart Alerts] erro geral", error);
    return { created: 0, skipped: 0, errors: 1 };
  }
}

function startSmartAlertSchedule() {
  if (smartAlertTimer) return smartAlertTimer;

  const scheduleNextRun = () => {
    smartAlertTimer = setTimeout(async () => {
      try {
        await runSmartAlertJob();
      } catch (error) {
        console.error("[Smart Alerts] falha no agendamento", error);
      } finally {
        scheduleNextRun();
      }
    }, millisecondsUntilNextRun());
    smartAlertTimer.unref?.();
  };

  scheduleNextRun();
  return smartAlertTimer;
}

function stopSmartAlertSchedule() {
  if (smartAlertTimer) {
    clearTimeout(smartAlertTimer);
    smartAlertTimer = null;
  }
}

module.exports = {
  millisecondsUntilNextRun,
  runSmartAlertJob,
  startSmartAlertSchedule,
  stopSmartAlertSchedule
};
