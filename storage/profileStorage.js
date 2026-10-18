import { getStoragePath } from "./storagePath.js";
import { createJsonFileStore } from "./jsonFile.js";

const store = createJsonFileStore(getStoragePath("profile.json"), {
  fallbackValue: {},
  validate: value => value !== null && typeof value === "object" && !Array.isArray(value),
  mode: 0o600,
});

export const loadProfile = () => store.read();
export const saveProfile = profile => store.write(profile);

/** Merge extracted profile facts without overwriting keys saved by memory concurrently. */
export const updateProfile = patch => store.update(profile => ({ ...profile, ...patch }));
export const updateProfileValue = (key, updater) => store.update(profile => {
  profile[key] = updater(profile[key]);
  return profile;
});
export const removeProfileKey = key => store.update(profile => {
  delete profile[key];
  return profile;
});
