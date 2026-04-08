import path from 'path';
import fs from 'fs';
import bytes from 'bytes';

import { BundleSizeReport, MeasuredBundleSize } from './types';
import { formatBytes } from './formatBytes';
import { extractArgs } from './extractArgs';
import {
  getPreviousConfig,
  writeNewConfigFile,
} from './externalConfigFileHandler';
import { collectMeasuredBundleSizes } from './analyze';

const createBundleSizeReport = (
  measuredBundleSizes: MeasuredBundleSize[],
): BundleSizeReport => ({
  files: measuredBundleSizes.map(
    ({ path: bundlePath, maxSize, sizeInBytes }) => ({
      path: bundlePath,
      maxSize,
      size: formatBytes(sizeInBytes),
    }),
  ),
});

const getFailingBundles = (measuredBundleSizes: MeasuredBundleSize[]) =>
  measuredBundleSizes.filter((bundleSize) => {
    const maxSizeInBytes = bytes(bundleSize.maxSize);

    if (maxSizeInBytes === null) {
      throw new Error(
        `Route "${bundleSize.path}" has an invalid maxSize "${bundleSize.maxSize}"`,
      );
    }

    return bundleSize.sizeInBytes > maxSizeInBytes;
  });

const logFailingBundles = (failingBundles: MeasuredBundleSize[]) => {
  if (failingBundles.length === 0) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log('Bundle size limit exceeded for:');
  failingBundles.forEach((bundleSize) => {
    // eslint-disable-next-line no-console
    console.log(
      `  ${bundleSize.path}: ${formatBytes(bundleSize.sizeInBytes)} > ${bundleSize.maxSize}`,
    );
  });
};

export default function check(args: string[]) {
  try {
    const { maxSize, buildDir, delta, previousConfigFileName } =
      extractArgs(args);

    const previousConfiguration = getPreviousConfig(
      buildDir,
      previousConfigFileName,
    );
    const measuredBundleSizes = collectMeasuredBundleSizes({
      buildDir,
      maxSize,
      previousConfiguration,
    });
    const config = createBundleSizeReport(measuredBundleSizes);
    const configFile = path.join(buildDir, 'next-page-bundlesize.config.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    writeNewConfigFile(measuredBundleSizes, delta, maxSize, buildDir);

    const failingBundles = getFailingBundles(measuredBundleSizes);
    logFailingBundles(failingBundles);

    if (failingBundles.length > 0) {
      process.exit(1);
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err instanceof Error ? err.message : String(err));
    process.exit(1);
    return;
  }

  process.exit(0);
}
