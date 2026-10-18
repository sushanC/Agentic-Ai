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
    { recursive: true, mode: 0o700 }
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
