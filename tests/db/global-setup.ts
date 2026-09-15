import { prepareTestDatabase, testDatabaseUrl } from "../support/test-database";

export default async function setup() {
  await prepareTestDatabase(testDatabaseUrl("vitest"));
}
