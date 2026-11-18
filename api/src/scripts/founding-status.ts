import dataSource from "../database/data-source";
import billingConfig from "../config/billing.config";
import { BillingRepository } from "../billing/billing.repository";
import { returnedRows } from "../content-engine/returned-rows";

/**
 * Grant or remove founding-creator status for one user, by email.
 *
 *   yarn workspace @contentual/api billing:founding -- --email creator@example.com --grant
 *   yarn workspace @contentual/api billing:founding -- --email creator@example.com --unflag
 *
 * Granting takes a cohort seat when one is free but still sets the flag when
 * none is: the cap guards purchases, not support decisions. Unflagging does
 * not hand the seat back.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const emailIndex = argv.indexOf("--email");
  const email = emailIndex === -1 ? undefined : argv[emailIndex + 1]?.trim().toLowerCase();
  const grant = argv.includes("--grant");
  const unflag = argv.includes("--unflag");

  if (!email || grant === unflag) {
    console.error("Usage: billing:founding -- --email <address> (--grant | --unflag)");
    process.exitCode = 1;
    return;
  }

  await dataSource.initialize();

  try {
    const repository = new BillingRepository(dataSource);
    const cohortCap = billingConfig().billing.offers.founding.cohortCap;

    const result = await dataSource.transaction(async (manager) => {
      const [user] = returnedRows<{ id: string }>(
        await manager.query(`SELECT "id" FROM "user" WHERE "email" = $1`, [email]),
      );

      if (!user) {
        return { status: "not_found" as const };
      }

      await repository.ensureAccount(user.id, manager);
      const account = await repository.findAccountForUpdate(user.id, manager);

      if (account?.isFoundingCreator === grant) {
        return { status: "unchanged" as const, userId: user.id };
      }

      const seatClaimed = grant && (await repository.claimFoundingSeat(cohortCap, manager));
      await repository.setFoundingFlag(user.id, grant, manager);

      return { status: grant ? "granted" : "unflagged", userId: user.id, seatClaimed };
    });

    console.log(JSON.stringify({ email, ...result }, null, 2));

    if (result.status === "granted" && !result.seatClaimed) {
      console.warn(
        "The founding cohort is full; the flag was set without a seat. Raise BILLING_FOUNDING_COHORT_CAP if that was intended.",
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
