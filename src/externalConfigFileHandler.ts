import path from 'path';
import fs from 'fs';
import bytes from 'bytes';

import { BundleSizeConfig, MeasuredBundleSize } from './types';
import { formatBytes } from './formatBytes';

// Keep a small buffer above already-oversized routes so the regenerated config
// does not pin the limit to the exact current size.
const exceededMaxSizeBufferInBytes = 500;

export const writeNewConfigFile = (
  measuredBundleSizes: MeasuredBundleSize[],
  delta: string,
  maxSize: string,
  buildDir: string,
) => {
  try {
    const newConfig = updateConfigurationWithNewBundleSizes(
      measuredBundleSizes,
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
  measuredBundleSizes: MeasuredBundleSize[],
  delta: string,
  maxSize: string,
): BundleSizeConfig => {
  let totalBundleSize = 0;
  const deltaInBytes = bytes(delta);
  const maxSizeInBytes = bytes(maxSize);

  if (deltaInBytes === null || maxSizeInBytes === null) {
    throw new Error('delta or maxSize has an invalid byte format');
  }

  const newConfig = measuredBundleSizes.map((file) => {
    totalBundleSize += file.sizeInBytes;

    return {
      path: file.path,
      maxSize: formatBytes(
        file.sizeInBytes < maxSizeInBytes
          ? file.sizeInBytes + deltaInBytes
          : file.sizeInBytes + exceededMaxSizeBufferInBytes,
      ),
    };
  });

  // eslint-disable-next-line no-console
  console.log('Total bundlesize of your project is', bytes(totalBundleSize));

  return {
    files: newConfig,
  };
};
