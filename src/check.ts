/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'path';
import fs from 'fs';

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

interface AnalyzeRouteData {
  output_files: Array<{
    filename: string;
  }>;
  chunk_parts: Array<{
    output_file_index: number;
    size: number;
    compressed_size: number;
  }>;
}

export interface BundleSizeConfig {
  files: Array<{
    path: string;
    maxSize: string;
  }>;
}

interface RouteBundle {
  path: string;
  route: string;
  gzipSize: number;
}

const toBundlePath = (buildDir: string, route: string) =>
  path.join(
    buildDir,
    // eslint-disable-next-line sonarjs/single-char-in-character-classes
    `.bundlesize${route.replace(/[/]/g, '_').replace(/[[\]]/g, '-')}`,
  );

const loadRoutes = (buildDir: string): string[] => {
  const routesPath = path.join(buildDir, 'data', 'routes.json');
  return JSON.parse(fs.readFileSync(routesPath, 'utf8')) as string[];
};

const getRouteAnalyzeDataPath = (buildDir: string, route: string) => {
  const routeSegments = route.split('/').filter(Boolean);
  return path.join(buildDir, 'data', ...routeSegments, 'analyze.data');
};

const loadAnalyzeData = (buildDir: string, route: string): AnalyzeRouteData => {
  const dataPath = getRouteAnalyzeDataPath(buildDir, route);
  const file = fs.readFileSync(dataPath);
  const jsonLength = file.readUInt32BE(0);
  return JSON.parse(
    file.subarray(4, 4 + jsonLength).toString('utf8'),
  ) as AnalyzeRouteData;
};

const getRouteBundleSize = (routeData: AnalyzeRouteData) => {
  const clientChunkIndexes = new Set(
    routeData.output_files.flatMap((file, index) =>
      file.filename.startsWith('[client-fs]/_next/static/') &&
      file.filename.endsWith('.js')
        ? [index]
        : [],
    ),
  );

  return routeData.chunk_parts.reduce((total, part) => {
    if (!clientChunkIndexes.has(part.output_file_index)) {
      return total;
    }

    return total + part.compressed_size;
  }, 0);
};

const writeBundleMetadataFiles = ({
  buildDir,
  routes,
}: {
  buildDir: string;
  routes: string[];
}): RouteBundle[] => {
  return routes.map((route) => {
    const routeData = loadAnalyzeData(buildDir, route);
    const outFile = toBundlePath(buildDir, route);
    const gzipSize = getRouteBundleSize(routeData);

    fs.writeFileSync(
      outFile,
      JSON.stringify(
        {
          route,
          gzipSize,
        },
        null,
        2,
      ),
    );

    return {
      path: outFile,
      route,
      gzipSize,
    };
  });
};

const generateBundleSizeConfig = ({
  routeBundles,
  maxSize,
  previousConfiguration,
}: {
  routeBundles: RouteBundle[];
  maxSize: string;
  previousConfiguration: BundleSizeConfig;
}): BundleSizeConfig => {
  const previousConfigurationMap = new Map(
    previousConfiguration.files.map((config) => [config.path, config.maxSize]),
  );
  return {
    files: routeBundles.map((routeBundle) => ({
      path: routeBundle.path,
      maxSize: previousConfigurationMap.get(routeBundle.path) || maxSize,
    })),
  };
};

const getDefaultBuildDir = () => {
  const analyzeBuildDir = '.next/diagnostics/analyze';
  return fs.existsSync(analyzeBuildDir) ? analyzeBuildDir : '.next';
};

const extractArgs = (args: string[]) => {
  const parsedArgs = parse(args) as unknown as Args;
  const maxSize = parsedArgs.maxSize || '200 kB';
  const buildDir = parsedArgs.buildDir || getDefaultBuildDir();
  const delta = parsedArgs.delta || '5 kB';

  return {
    maxSize,
    buildDir,
    delta,
    previousConfigFileName: parsedArgs.previousConfigFileName,
  };
};

const validateBundles = ({
  config,
  routeBundles,
}: {
  config: BundleSizeConfig;
  routeBundles: RouteBundle[];
}) => {
  const routeBundleMap = new Map(
    routeBundles.map((routeBundle) => [routeBundle.path, routeBundle]),
  );

  const failedBundles = config.files.flatMap((bundleConfig) => {
    const routeBundle = routeBundleMap.get(bundleConfig.path);
    if (!routeBundle) {
      return [];
    }

    const maxSizeInBytes = bytes(bundleConfig.maxSize);
    if (routeBundle.gzipSize <= maxSizeInBytes) {
      return [];
    }

    return [
      {
        route: routeBundle.route,
        path: bundleConfig.path,
        actualSize: routeBundle.gzipSize,
        maxSize: bundleConfig.maxSize,
      },
    ];
  });

  if (failedBundles.length === 0) {
    config.files.forEach((bundleConfig) => {
      const routeBundle = routeBundleMap.get(bundleConfig.path);
      if (!routeBundle) {
        return;
      }

      // eslint-disable-next-line no-console
      console.log(
        `PASS ${routeBundle.route}: ${bytes(routeBundle.gzipSize)} <= ${bundleConfig.maxSize}`,
      );
    });
    return true;
  }

  failedBundles.forEach((bundle) => {
    // eslint-disable-next-line no-console
    console.log(
      `FAIL ${bundle.route}: ${bytes(bundle.actualSize)} > ${bundle.maxSize}`,
    );
  });
  return false;
};

export default function check(args: string[]) {
  try {
    const { maxSize, buildDir, delta, previousConfigFileName } =
      extractArgs(args);

    const routes = loadRoutes(buildDir);
    const routeBundles = writeBundleMetadataFiles({
      buildDir,
      routes,
    });
    const previousConfiguration = getPreviousConfig(
      buildDir,
      previousConfigFileName,
    );
    const config = generateBundleSizeConfig({
      routeBundles,
      maxSize,
      previousConfiguration,
    });
    const configFile = path.join(buildDir, 'next-page-bundlesize.config.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    writeNewConfigFile(config, delta, maxSize, buildDir);
    const isValid = validateBundles({ config, routeBundles });
    process.exit(isValid ? 0 : 1);
    return;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
    process.exit(1);
    return;
  }
}
