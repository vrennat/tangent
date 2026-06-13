// Inspect how the live scorer sees specific candidate pages (description, categories,
// isPolitical, specificity) — pulled from the warm cache. Pass titles as args, or use
// the default WWII-cluster set: `bun run diag.ts "Adolf Hitler" "Nazi Germany"`.
import { isPolitical } from '../../src/lib/feed/politics.ts';
import { specificity } from '../../src/lib/feed/score.ts';
import { readFileSync } from 'node:fs';
const cache = JSON.parse(readFileSync(`${import.meta.dir}/cache.json`, 'utf8'));
const targets = process.argv.slice(2).length
	? process.argv.slice(2)
	: ['Adolf Hitler', 'Nazi Germany', 'World War II', 'Soviet Union', 'World War I'];
for (const src of Object.keys(cache)) {
  for (const c of cache[src]) {
    if (targets.includes(c.title)) {
      const blob = `${c.title} ${c.description ?? ''} ${(c.categories??[]).join(' ')}`;
      console.log(`\n${c.title}`);
      console.log(`  description: ${JSON.stringify(c.description)}`);
      console.log(`  categories(${(c.categories??[]).length}): ${JSON.stringify(c.categories)}`);
      console.log(`  isPolitical(blob): ${isPolitical(blob)}  specificity: ${specificity(c)}  thumb: ${!!c.thumbnail}`);
      targets.splice(targets.indexOf(c.title),1);
      break;
    }
  }
  if (!targets.length) break;
}
