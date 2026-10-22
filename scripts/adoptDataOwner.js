import "dotenv/config";
import { adoptExistingDataOwner, DATA_OWNER_ADOPTION_CONFIRMATION } from "../storage/dataOwnership.js";

const confirmation = process.argv[2];
try {
  if (confirmation !== DATA_OWNER_ADOPTION_CONFIRMATION) {
    const error = new Error("Owner-adoption confirmation phrase is required.");
    error.code = "DATA_OWNER_ADOPTION_CONFIRMATION_REQUIRED";
    throw error;
  }
  const result = await adoptExistingDataOwner({
    issuer: process.env.SAMGPT_OIDC_ISSUER,
    subject: process.env.SAMGPT_DATA_OWNER_SUBJECT,
    confirmation,
  });
  console.log("Existing local data assigned to configured OIDC owner.", { adoptedAt: result.adoptedAt });
} catch (error) {
  console.error("Data owner adoption failed.", { code: error.code || "DATA_OWNER_ADOPTION_FAILED" });
  if (error.code === "DATA_OWNER_ADOPTION_CONFIRMATION_REQUIRED") {
    console.error(`Usage: SAMGPT_OIDC_ISSUER=https://issuer SAMGPT_DATA_OWNER_SUBJECT=<subject> node scripts/adoptDataOwner.js ${DATA_OWNER_ADOPTION_CONFIRMATION}`);
  }
  process.exitCode = 1;
}
