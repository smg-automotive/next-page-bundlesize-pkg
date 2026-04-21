/* eslint-disable @typescript-eslint/no-require-imports */
import vm from 'vm';
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
  pages?: {
    [pageName: string]: string[];
  };
  rootMainFiles?: string[];
}

interface AppPathRoutesManifest {
  [routeName: string]: string;
}

interface AppPathsManifest {
  [routeName: string]: string;
}

interface ClientModule {
  chunks?: string[];
}

interface ClientReferenceManifest {
  clientModules?: Record<string, ClientModule>;
}

type PageChunkMap = Map<string, string[]>;

const isFileNotExistingError = (err: unknown): err is NodeJS.ErrnoException =>
  Boolean(
    err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT',
  );

const isJavaScriptChunk = (chunk: string) => chunk.endsWith('.js');

const uniqueJavaScriptChunks = (chunks: string[]) =>
  Array.from(new Set(chunks.filter(isJavaScriptChunk)));

const addPageChunks = (
  pageChunks: PageChunkMap,
  page: string,
  chunks: string[],
) => {
  const uniqueChunks = uniqueJavaScriptChunks(chunks);
  if (!uniqueChunks.length) {
    return;
  }

  pageChunks.set(
    page,
    Array.from(new Set([...(pageChunks.get(page) || []), ...uniqueChunks])),
  );
};

const toBundleFileName = (page: string) =>
  `.bundlesize${page.replace(/\//g, '_').replace(/\[/g, '-').replace(/\]/g, '-')}`;

const clientReferenceManifestPathFromServerPage = (serverPagePath: string) =>
  serverPagePath
    .replace(/^app\//, 'server/app/')
    .replace(/\.js$/, '_client-reference-manifest.js');

const collectClientReferenceChunks = (
  clientReferenceManifest: ClientReferenceManifest,
) =>
  uniqueJavaScriptChunks(
    Object.values(clientReferenceManifest.clientModules || {}).flatMap(
      ({ chunks = [] }) => chunks,
    ),
  );

const normalizeChunkPath = (chunk: string) => chunk.replace(/^\/?_next\//, '');

const chunkFilePath = (buildDir: string, chunk: string) => {
  try {
    return path.join(buildDir, decodeURIComponent(normalizeChunkPath(chunk)));
  } catch {
    return path.join(buildDir, normalizeChunkPath(chunk));
  }
};

const collectLegacyManifestChunks = (manifest: Manifest) => {
  const pageChunks: PageChunkMap = new Map();

  Object.keys(manifest.pages || {}).forEach((page) => {
    addPageChunks(pageChunks, page, combineAppAndPageChunks(manifest, page));
  });

  return pageChunks;
};

const mergePageChunks = (
  targetPageChunks: PageChunkMap,
  pageChunksToMerge: PageChunkMap,
) => {
  pageChunksToMerge.forEach((chunks, page) => {
    addPageChunks(targetPageChunks, page, chunks);
  });
};

const loadJsonFile = <T>({
  buildDir,
  fileName,
  fallback,
}: {
  buildDir: string;
  fileName: string;
  fallback: T;
}): T => {
  try {
    const pathToLoad = path.join(buildDir, fileName);
    return JSON.parse(fs.readFileSync(pathToLoad).toString()) as T;
  } catch (err) {
    if (!isFileNotExistingError(err)) {
      // eslint-disable-next-line no-console
      console.log(err);
      process.exit(1);
    }

    return fallback;
  }
};

const loadClientReferenceManifest = ({
  buildDir,
  fileName,
}: {
  buildDir: string;
  fileName: string;
}): ClientReferenceManifest => {
  try {
    const pathToLoad = path.join(buildDir, fileName);
    const fileContents = fs.readFileSync(pathToLoad).toString();
    const sandbox: {
      globalThis: {
        __RSC_MANIFEST?: Record<string, ClientReferenceManifest>;
      };
    } = { globalThis: {} };

    vm.runInNewContext(fileContents, sandbox, { timeout: 1000 });

    return Object.values(sandbox.globalThis.__RSC_MANIFEST || {})[0] || {};
  } catch (err) {
    if (!isFileNotExistingError(err)) {
      // eslint-disable-next-line no-console
      console.log(err);
      process.exit(1);
    }

    return {};
  }
};

const collectNext16AppRouteChunks = (buildDir: string) => {
  const buildManifest = loadJsonFile<Manifest>({
    buildDir,
    fileName: 'build-manifest.json',
    fallback: {},
  });
  const appPathRoutesManifest = loadJsonFile<AppPathRoutesManifest>({
    buildDir,
    fileName: 'app-path-routes-manifest.json',
    fallback: {},
  });
  const appPathsManifest = loadJsonFile<AppPathsManifest>({
    buildDir,
    fileName: path.join('server', 'app-paths-manifest.json'),
    fallback: {},
  });
  const pageChunks: PageChunkMap = new Map();
  const sharedAppChunks = uniqueJavaScriptChunks(
    buildManifest.rootMainFiles || [],
  );

  Object.entries(appPathRoutesManifest).forEach(([routeName, publicRoute]) => {
    if (!routeName.endsWith('/page')) {
      return;
    }

    const serverPagePath = appPathsManifest[routeName];

    if (!serverPagePath) {
      return;
    }

    const clientReferenceManifest = loadClientReferenceManifest({
      buildDir,
      fileName: clientReferenceManifestPathFromServerPage(serverPagePath),
    });

    addPageChunks(pageChunks, publicRoute, [
      ...sharedAppChunks,
      ...collectClientReferenceChunks(clientReferenceManifest),
    ]);
  });

  return pageChunks;
};

const collectAllPageChunks = (buildDir: string) => {
  const pageChunks: PageChunkMap = new Map();

  mergePageChunks(
    pageChunks,
    collectLegacyManifestChunks(
      loadJsonFile<Manifest>({
        buildDir,
        fileName: 'build-manifest.json',
        fallback: {},
      }),
    ),
  );
  mergePageChunks(
    pageChunks,
    collectLegacyManifestChunks(
      loadJsonFile<Manifest>({
        buildDir,
        fileName: 'app-build-manifest.json',
        fallback: {},
      }),
    ),
  );
  mergePageChunks(pageChunks, collectNext16AppRouteChunks(buildDir));

  return pageChunks;
};

export interface BundleSizeConfig {
  files: Array<{
    path: string;
    maxSize: string;
  }>;
}

const combineAppAndPageChunks = (manifest: Manifest, page: string) => {
  const appPageChunks = manifest.pages?.['/_app'];
  return Array.from(
    new Set([
      ...(appPageChunks ? appPageChunks : []),
      ...(manifest.pages?.[page] || []),
    ]),
  ).filter((chunk) => chunk.match(/\.js$/));
};

const concatenatePageBundles = ({
  buildDir,
  pageChunks,
}: {
  buildDir: string;
  pageChunks: PageChunkMap;
}): string[] => {
  const pageBundles: string[] = [];

  pageChunks.forEach((chunks, page) => {
    const firstLoadChunks = chunks.map((chunk) =>
      chunkFilePath(buildDir, chunk),
    );
    const outFile = path.join(buildDir, toBundleFileName(page));

    fs.writeFileSync(outFile, '');
    firstLoadChunks.forEach((chunk) => {
      const chunkContent = fs.readFileSync(chunk);
      fs.appendFileSync(outFile, chunkContent);
    });

    pageBundles.push(outFile);
  });

  return pageBundles;
};

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

    const pageBundles = concatenatePageBundles({
      buildDir,
      pageChunks: collectAllPageChunks(buildDir),
    });
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

    // eslint-disable-next-line sonarjs/os-command
    execSync(`npx bundlesize2 --config=${configFile}`, { stdio: 'inherit' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
    process.exit(1);
  }

  process.exit(0);
}
