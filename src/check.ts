/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'path';
import fs from 'fs';

import { getRouteBundleSizes, toLegacyBundlePath } from './nextAnalyzeData';
import {
  getPreviousConfig,
  writeNewConfigFile,
} from './externalConfigFileHandler';

const { parse } = require('yargs');
const bytes = require('bytes');
interface Args {
  maxSize: string;
  buildDir: string;
  delta: string;
  previousConfigFileName?: string;
}

export interface BundleSizeConfig {
  files: Array<{
    path: string;
    maxSize: string;
    size?: string;
  }>;
}

const generateBundleSizeConfig = ({
  buildDir,
  routeBundles,
  maxSize,
  previousConfiguration,
}: {
  buildDir: string;
  routeBundles: Array<{
    path: string;
    size: number;
  }>;
  maxSize: string;
  previousConfiguration: BundleSizeConfig;
}): BundleSizeConfig => {
  const previousConfigurationMap = new Map(
    previousConfiguration.files.map((config) => [config.path, config.maxSize]),
  );
  return {
    files: routeBundles.map((routeBundle) => ({
      path: routeBundle.path,
      maxSize:
        previousConfigurationMap.get(routeBundle.path) ||
        previousConfigurationMap.get(
          toLegacyBundlePath(buildDir, routeBundle.path),
        ) ||
        maxSize,
      size: bytes(routeBundle.size),
    })),
  };
};

const extractArgs = (args: string[]) => {
  const parsedArgs = parse(args) as unknown as Args;
  const maxSize = parsedArgs.maxSize || '200 kB';
  const buildDir = parsedArgs.buildDir || '.next';
  const delta = parsedArgs.delta || '5 kB';

  return {
    maxSize,
    buildDir,
    delta,
    previousConfigFileName: parsedArgs.previousConfigFileName,
  };
};

const checkBundleSizes = ({
  config,
  routeBundles,
}: {
  config: BundleSizeConfig;
  routeBundles: Array<{
    path: string;
    size: number;
  }>;
}) => {
  const routeBundleMap = new Map(
    routeBundles.map((routeBundle) => [routeBundle.path, routeBundle.size]),
  );

  return config.files
    .map((file) => {
      const bundleSize = routeBundleMap.get(file.path);
      if (bundleSize === undefined) {
        return null;
      }

      const maxSize = bytes(file.maxSize);
      if (typeof maxSize !== 'number') {
        throw new Error(
          `Could not parse max size "${file.maxSize}" for ${file.path}`,
        );
      }

      if (bundleSize <= maxSize) {
        return null;
      }

      return `${file.path}: ${bytes(bundleSize)} exceeds ${file.maxSize}`;
    })
    .filter((failure): failure is string => failure !== null);
};

export default function check(args: string[]) {
  try {
    const { maxSize, buildDir, delta, previousConfigFileName } =
      extractArgs(args);

    const routeBundles = getRouteBundleSizes(buildDir);
    const previousConfiguration = getPreviousConfig(
      buildDir,
      previousConfigFileName,
    );
    const config = generateBundleSizeConfig({
      buildDir,
      routeBundles,
      maxSize,
      previousConfiguration,
    });
    const configFile = path.join(buildDir, 'next-page-bundlesize.config.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    writeNewConfigFile(routeBundles, delta, maxSize, buildDir);

    const failures = checkBundleSizes({
      config,
      routeBundles,
    });

    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.log('Bundle size check failed:');
      failures.forEach((failure) => {
        // eslint-disable-next-line no-console
        console.log(`- ${failure}`);
      });
      process.exit(1);
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
    process.exit(1);
    return;
  }

  process.exit(0);
}
