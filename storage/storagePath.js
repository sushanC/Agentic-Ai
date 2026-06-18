import path from "path";
import os from "os";
import fs from "fs";

const appFolder =
  path.join(
    os.homedir(),
    ".personal-agent"
  );

if (!fs.existsSync(appFolder)) {

  fs.mkdirSync(
    appFolder,
    { recursive: true }
  );
}

export function getStoragePath(
  fileName
) {

  return path.join(
    appFolder,
    fileName
  );
}