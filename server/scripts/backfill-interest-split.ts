// One-off backfill after migration 20261010000000_interest_principal_split:
// replays every loan's payment history so installments and payments get their
// exact interest/principal split (interest first). Safe to run repeatedly.
//   npm run backfill:split --workspace server
import { prisma } from '../src/db.js';
import { rebuildLoanAllocation } from '../src/lib/loanService.js';

const loans = await prisma.loan.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });
let ok = 0;
const failed: { id: string; error: string }[] = [];
for (const { id } of loans) {
  try {
    await rebuildLoanAllocation(id);
    ok++;
  } catch (err) {
    // Usually a loan whose stored history is inconsistent (e.g. data from
    // before the capitalization replay fix). Left untouched for review.
    failed.push({ id, error: err instanceof Error ? err.message : String(err) });
  }
}
console.log(`Rebuilt ${ok}/${loans.length} loans.`);
for (const f of failed) console.log(`  ✗ ${f.id}: ${f.error}`);
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
