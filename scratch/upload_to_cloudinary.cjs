const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;

// 1. Load environment variables manually from .env
const envPath = path.resolve(__dirname, '../.env');
console.log(`[Cloudinary Upload] Loading environment from ${envPath}`);
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let val = (match[2] || '').trim();
      // Strip outer quotes if any
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.slice(1, -1);
      }
      val = val.trim();
      process.env[key] = val;
    }
  }
}

// 2. Validate credentials
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const dbUrl = process.env.TIDB_URL;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('\n[Error] Cloudinary environment variables are missing in .env!');
  console.error('Please configure:');
  console.error('  CLOUDINARY_CLOUD_NAME');
  console.error('  CLOUDINARY_API_KEY');
  console.error('  CLOUDINARY_API_SECRET');
  process.exit(1);
}

if (!dbUrl) {
  console.error('\n[Error] TIDB_URL environment variable is missing in .env!');
  process.exit(1);
}

// 3. Configure Cloudinary
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

// 4. Directories
const u1Dir = path.resolve(__dirname, '../../U1');
const syllabusDir = path.resolve(__dirname, '../src/data/syllabus');

async function run() {
  console.log('\n--- Starting Cloudinary Upload & DB Linking ---');
  console.log(`Source Image Folder: ${u1Dir}`);
  console.log(`Syllabus Folder: ${syllabusDir}`);

  if (!fs.existsSync(u1Dir)) {
    console.error(`[Error] Source folder U1 does not exist at ${u1Dir}`);
    process.exit(1);
  }

  // Connect to TiDB
  console.log('[Database] Connecting to TiDB...');
  const connection = await mysql.createConnection({
    uri: dbUrl,
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    }
  });
  console.log('[Database] Connected successfully.');

  // Ensure image_url column exists
  try {
    await connection.execute("ALTER TABLE formulas ADD COLUMN image_url VARCHAR(255) DEFAULT NULL");
    console.log('[Database] Verified formulas table image_url column.');
  } catch (dbErr) {
    if (!dbErr.message.includes('Duplicate column name') && !dbErr.message.includes('already exists')) {
      console.warn('[Database] Alter table info:', dbErr.message);
    }
  }

  try {
    // Read all files in U1 directory
    const files = fs.readdirSync(u1Dir);
    console.log(`[Images] Found ${files.length} files in U1 folder.`);

    // Loop through units 1 to 6
    for (let u = 1; u <= 6; u++) {
      const jsonPath = path.join(syllabusDir, `unit${u}.json`);
      if (!fs.existsSync(jsonPath)) continue;

      console.log(`\n[Unit ${u}] Processing syllabus formulas from unit${u}.json...`);
      const dataStr = fs.readFileSync(jsonPath, 'utf8');
      const unitData = JSON.parse(dataStr);

      if (!unitData.formulas || !Array.isArray(unitData.formulas)) {
        console.log(`[Unit ${u}] No formulas found in JSON.`);
        continue;
      }

      for (let idx = 0; idx < unitData.formulas.length; idx++) {
        const formula = unitData.formulas[idx];
        const fNum = idx + 1;

        // Search for matching image file in files list
        // Expected bases: e.g. "U1F1", "U2F4", or "UIF5" (which is typo for "U1F5")
        const expectedBase1 = `U${u}F${fNum}`;
        const expectedBase2 = u === 1 ? `UIF${fNum}` : null; // Support the "UI" typo

        let matchedFile = null;
        for (const file of files) {
          const fileBase = path.basename(file, path.extname(file)); // e.g. "U1F1"
          if (fileBase.toUpperCase() === expectedBase1.toUpperCase() || 
              (expectedBase2 && fileBase.toUpperCase() === expectedBase2.toUpperCase())) {
            matchedFile = file;
            break;
          }
        }

        if (matchedFile) {
          const fullFilePath = path.join(u1Dir, matchedFile);
          console.log(`[Match] Formula "${formula.name}" maps to file ${matchedFile}`);

          // Upload to Cloudinary
          const publicId = `beeesmartlearn/formulas/U${u}F${fNum}`;
          console.log(`  -> Uploading to Cloudinary with public_id: ${publicId}...`);
          
          try {
            const uploadResult = await cloudinary.uploader.upload(fullFilePath, {
              public_id: publicId,
              overwrite: true,
              resource_type: 'image'
            });

            const secureUrl = uploadResult.secure_url;
            console.log(`  -> Upload successful: ${secureUrl}`);

            // Update Database record
            const [updateResult] = await connection.execute(
              'UPDATE formulas SET image_url = ? WHERE unit_number = ? AND name = ?',
              [secureUrl, u, formula.name]
            );

            console.log(`  -> Database updated. Rows affected: ${updateResult.affectedRows}`);
          } catch (uploadErr) {
            console.error(`  -> [Error] Upload or database update failed: ${uploadErr.message}`);
          }
        }
      }
    }

    console.log('\n--- Processing Complete ---');
  } finally {
    await connection.end();
    console.log('[Database] Connection closed.');
  }
}

run().catch((err) => {
  console.error('[Fatal Error] Script crashed:', err);
});
