const fs = require('fs');
const path = require('path');

// Create a minimal package.json for Lambda
const lambdaPackageJson = {
  name: 'lambda-handlers',
  version: '1.0.0',
  main: 'index.js',
  dependencies: {
    '@aws-sdk/client-dynamodb': '^3.470.0',
    '@aws-sdk/client-s3': '^3.470.0',
    '@aws-sdk/lib-dynamodb': '^3.470.0',
    '@aws-sdk/s3-request-presigner': '^3.470.0',
    bcrypt: '^5.1.1',
  },
};

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('dist directory not found. Run npm run build first.');
  process.exit(1);
}

// Write package.json to dist
fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(lambdaPackageJson, null, 2));

console.log('Lambda package.json created in dist directory');
