import { prepareTestDatabase, testDatabaseUrl, type TestSuite } from "./test-database";

// `npm run test:db:init`: recreates both test databases from the migrations.
// The test runners create and migrate them on their own; this is for starting over.

async function main() {
  for (const suite of ["vitest", "e2e"] satisfies TestSuite[]) {
    const url = testDatabaseUrl(suite);
    await prepareTestDatabase(url, { recreate: true });
    console.log(`Recreated ${new URL(url).pathname.slice(1)} for ${suite}.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
