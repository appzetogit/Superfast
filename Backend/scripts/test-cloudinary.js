import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

cloudinary.config({
  cloud_name: 'zx9n8lhi',
  api_key: '874275636216265',
  api_secret: 'LGeFHTTSUxcvUFhn-APS2HZLVBM'
});

async function testFetch() {
  try {
    const result = await cloudinary.search
      .expression('resource_type:image')
      .max_results(500)
      .execute();
      
    console.log(`Found ${result.total_count} images`);
    
    // Write just the first one to check structure
    if (result.resources.length > 0) {
      console.log('Sample metadata:', JSON.stringify(result.resources[0], null, 2));
    }
  } catch (error) {
    console.error('Error fetching from Cloudinary:', error);
  }
}

testFetch();
