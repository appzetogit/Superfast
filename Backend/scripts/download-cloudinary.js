import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure Cloudinary is configured
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'zx9n8lhi',
  api_key: process.env.CLOUDINARY_API_KEY || '874275636216265',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'LGeFHTTSUxcvUFhn-APS2HZLVBM'
});

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

async function downloadFile(url, destination) {
  try {
    const dir = path.dirname(destination);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Check if file already exists
    if (fs.existsSync(destination)) {
      console.log(`Skipping existing file: ${destination}`);
      return true;
    }

    console.log(`Downloading: ${url} -> ${destination}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unexpected response ${response.statusText}`);
    
    await pipeline(response.body, fs.createWriteStream(destination));
    return true;
  } catch (err) {
    console.error(`Failed to download ${url}:`, err);
    return false;
  }
}

async function fetchAllResources() {
  console.log('Fetching metadata for all resources...');
  let resources = [];
  let nextCursor = null;

  do {
    const result = await cloudinary.search
      .expression('resource_type:image')
      .max_results(500)
      .next_cursor(nextCursor)
      .execute();
      
    resources = resources.concat(result.resources);
    nextCursor = result.next_cursor;
    
    console.log(`Fetched ${resources.length} of ${result.total_count} resources...`);
  } while (nextCursor);

  return resources;
}

async function run() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const resources = await fetchAllResources();
  
  // Save metadata
  const metadataPath = path.join(UPLOADS_DIR, 'cloudinary_metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(resources, null, 2));
  console.log(`Saved metadata to ${metadataPath}`);

  // Download files
  let successCount = 0;
  let failCount = 0;

  for (const resource of resources) {
    // Cloudinary's secure_url gives us the full url.
    // The public_id often looks like 'folder/subfolder/filename'
    // We will save it locally as uploads/folder/subfolder/filename.format
    const localRelativePath = `${resource.public_id}.${resource.format}`;
    const destination = path.join(UPLOADS_DIR, localRelativePath);
    
    const success = await downloadFile(resource.secure_url, destination);
    if (success) successCount++;
    else failCount++;
  }

  console.log('Download complete!');
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

run().catch(console.error);
