/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

import {
  getPreviousConfig,
  writeNewConfigFile,
} from './externalConfigFileHandler';

const { parse } = require('yargs');
interface Args {
  maxSize: string;
  buildDir: string;
  delta: string;
  previousConfigFileName?: string;
}

interface Manifest {
  pages: {
    [pageName: string]: string[];
  };
  [key: string]: Record<string, string | string[]>;
}

export interface BundleSizeConfig {
  files: Array<{
    path: string;
    maxSize: string;
  }>;
}

const combineAppAndPageChunks = (manifest: Manifest, page: string) =>
  Array.from(
    new Set([...manifest.pages['/_app'], ...manifest.pages[page]]),
  ).filter((chunk) => chunk.match(/\.js$/));

const concatenatePageBundles = ({
  buildDir,
  manifest,
}: {
  buildDir: string;
  manifest: Manifest;
}): string[] =>
  Object.keys(manifest.pages).map((page) => {
    const firstLoadChunks = combineAppAndPageChunks(manifest, page).map(
      (chunk) => path.join(buildDir, chunk),
    );

    const outFile = path.join(
      buildDir,
      `.bundlesize${page.replace(/[/]/g, '_').replace(/[[\]]/g, '-')}`,
    );

    fs.writeFileSync(outFile, '');
    firstLoadChunks.forEach((chunk) => {
      const chunkContent = fs.readFileSync(chunk);
      fs.appendFileSync(outFile, chunkContent);
    });

    return outFile;
  });

const generateBundleSizeConfig = ({
  pageBundles,
  maxSize,
  previousConfiguration,
}: {
  pageBundles: string[];
  maxSize: string;
  previousConfiguration: BundleSizeConfig;
}): BundleSizeConfig => {
  const previousConfigurationMap = new Map(
    previousConfiguration.files.map((config) => [config.path, config.maxSize]),
  );
  return {
    files: pageBundles.map((pageBundleName) => ({
      path: pageBundleName,
      maxSize: previousConfigurationMap.get(pageBundleName) || maxSize,
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

export default function check(args: string[]) {
  try {
    const { maxSize, buildDir, delta, previousConfigFileName } =
      extractArgs(args);

    const manifestFile = path.join(buildDir, 'build-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile).toString());

    const pageBundles = concatenatePageBundles({ buildDir, manifest });
    const previousConfiguration = getPreviousConfig(
      buildDir,
      previousConfigFileName,
    );
    const config = generateBundleSizeConfig({
      pageBundles,
      maxSize,
      previousConfiguration,
    });
    const configFile = path.join(buildDir, 'next-page-bundlesize.config.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    writeNewConfigFile(config, delta, maxSize, buildDir);

    execSync(`npx bundlesize --config=${configFile}`, { stdio: 'inherit' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
    process.exit(1);
  }

  process.exit(0);
}
