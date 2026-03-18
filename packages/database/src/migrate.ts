import 'dotenv/config';
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString =
  process.env.DEV_DATABASE_URL ||
  'postgresql://postgres.zhotzdemwwyfzevtygob:wkiN3jgh@aws-1-eu-central-1.pooler.supabase.com:6543/postgres';

console.log('🔄 Running database migrations...');
console.log('Connecting to:', connectionString.replace(/:[^:@]+@/, ':****@'));

const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    // 1. Create migrations tracking table if not exists
    await client`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // 2. Get already applied migrations
    const applied = await client`SELECT name FROM _migrations`;
    const appliedSet = new Set(applied.map((r) => r.name));

    // 3. Read migration files from supabase/migrations
    const migrationsDir = path.join(__dirname, '../../../supabase/migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️ No migrations directory found at:', migrationsDir);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // Sort alphabetically (0001_, 0002_, etc.)

    console.log(`📁 Found ${files.length} migration files`);

    // 4. Apply each migration that hasn't been run
    let appliedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ⏭️  ${file} (already applied)`);
        continue;
      }

      console.log(`  🔄 Applying ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        // Execute the migration (use unsafe for raw SQL)
        await client.unsafe(sql);

        // Record that this migration was applied
        await client`INSERT INTO _migrations (name) VALUES (${file})`;
        console.log(`  ✅ ${file} applied successfully`);
        appliedCount++;
      } catch (err) {
        console.error(`  ❌ Failed to apply ${file}:`, err);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('✅ Database is up to date (no new migrations)');
    } else {
      console.log(`✅ Applied ${appliedCount} migration(s) successfully`);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
