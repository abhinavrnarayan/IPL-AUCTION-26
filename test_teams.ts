import { teamUploadSchema } from "./lib/domain/schemas";
import { normalizeTeamRows } from "./lib/domain/upload";

const body = {
  teams: [
    { name: "Alpha Kings", shortCode: null },
    { name: "Beta Warriors", shortCode: null },
  ]
};

const result = teamUploadSchema.safeParse(body);
console.log("Validation Result:", JSON.stringify(result, null, 2));

if (result.success) {
  const normalized = normalizeTeamRows(result.data.teams);
  console.log("Normalized:", JSON.stringify(normalized, null, 2));
}

