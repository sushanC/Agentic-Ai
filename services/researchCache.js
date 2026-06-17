let lastResearch = "";

export function setResearch(
  report
) {

  lastResearch =
    report;
}

export function getResearch() {

  return lastResearch;
}