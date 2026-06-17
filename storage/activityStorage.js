let activities = [];

export function addActivity(
  text
) {

  activities.push({
    text,
    timestamp: Date.now()
  });

  if (
    activities.length > 20
  ) {

    activities.shift();
  }
}

export function getActivities() {

  return activities;
}

export function clearActivities() {

  activities = [];
}