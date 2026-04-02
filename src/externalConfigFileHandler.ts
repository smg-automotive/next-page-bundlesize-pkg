/* eslint-disable @typescript-eslint/no-require-imports */
import { gzipSync } from 'zlib';
import path from 'path';
import fs from 'fs';

import { BundleSizeConfig } from './check';

const bytes = require('bytes');

const getBundleSize = (filePath: string) => {
  const fileContent = fs.readFileSync(filePath, 'utf8');

  try {
    const parsed = JSON.parse(fileContent) as { gzipSize?: number };
    if (typeof parsed.gzipSize === 'number') {
      return parsed.gzipSize;
    }
  } catch {
    // fall back to measuring the raw file contents for legacy bundle files
  }

  return gzipSync(fileContent).byteLength;
};

export const writeNewConfigFile = (
  oldConfig: BundleSizeConfig,
  delta: string,
  maxSize: string,
  buildDir: string,
) => {
  try {
    const newConfig = updateConfigurationWithNewBundleSizes(
      oldConfig,
      delta,
      maxSize,
    );
    fs.writeFileSync(
      path.join(buildDir, 'bundlesize.json'),
      JSON.stringify(newConfig, null, 2),
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('Cannot create new config file', error);
  }
};

export const getPreviousConfig = (
  buildDir: string,
  fileName?: string,
): BundleSizeConfig => {
  const emptyBundleSizeConfig: BundleSizeConfig = { files: [] };
  if (!fileName) {
    // eslint-disable-next-line no-console
    console.log('No config file specified... using maxSize as default');
    return emptyBundleSizeConfig;
  }
  try {
    const config = fs.readFileSync(path.join(buildDir, fileName)).toString();
    return JSON.parse(config);
  } catch {
    // eslint-disable-next-line no-console
    console.log(
      'Previous config file not existing or invalid JSON format... using maxSize as default',
    );
    return emptyBundleSizeConfig;
  }
};

const updateConfigurationWithNewBundleSizes = (
  config: BundleSizeConfig,
  delta: string,
  maxSize: string,
): BundleSizeConfig => {
  let totalBundleSize = 0;
  const newConfig = config.files.map((file) => {
    const sizeInBytes = getBundleSize(file.path);
    const deltaInBytes = bytes(delta);
    const maxSizeInBytes = bytes(maxSize);
    totalBundleSize += sizeInBytes;

    return {
      path: file.path,
      maxSize: bytes(
        sizeInBytes < maxSizeInBytes
          ? sizeInBytes + deltaInBytes
          : sizeInBytes + 500, // magic number 500 is to prevent failing if it's exactly the same size
      ),
    };
  });

  // eslint-disable-next-line no-console
  console.log('Total bundlesize of your project is', bytes(totalBundleSize));

  return {
    files: newConfig,
  };
};
