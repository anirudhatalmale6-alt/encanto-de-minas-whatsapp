const { insertScheduled, getPendingScheduled, markScheduledSent } = require('./database');

// In-memory timers for the current process
const timers = new Map();

function scheduleFollowup(phone, delayMinutes, callback) {
  const sendAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

  // Persist in SQLite for crash recovery
  insertScheduled(phone, 'followup', sendAt);

  // Set in-memory timer
  const timer = setTimeout(async () => {
    timers.delete(phone);
    try {
      await callback(phone);
    } catch (err) {
      console.error(`Followup callback error for ${phone}:`, err.message);
    }
  }, delayMinutes * 60 * 1000);

  timers.set(phone, timer);
  console.log(`Followup scheduled for ${phone} in ${delayMinutes} minutes`);
}

function cancelFollowup(phone) {
  const timer = timers.get(phone);
  if (timer) {
    clearTimeout(timer);
    timers.delete(phone);
    console.log(`Followup cancelled for ${phone}`);
  }
}

// Process any pending scheduled messages on startup (crash recovery)
async function processPending(callback) {
  const pending = getPendingScheduled();
  console.log(`Processing ${pending.length} pending scheduled messages`);

  for (const item of pending) {
    try {
      await callback(item.phone);
      markScheduledSent(item.id);
    } catch (err) {
      console.error(`Error processing pending for ${item.phone}:`, err.message);
    }
  }
}

// Mark DB entries as sent when the in-memory timer fires
function markFollowupSent(phone) {
  const pending = getPendingScheduled();
  const match = pending.find(p => p.phone === phone);
  if (match) {
    markScheduledSent(match.id);
  }
}

module.exports = {
  scheduleFollowup,
  cancelFollowup,
  processPending,
  markFollowupSent
};
