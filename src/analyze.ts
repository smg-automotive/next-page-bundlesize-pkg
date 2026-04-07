import path from 'path';
import fs from 'fs';

import { BundleSizeConfig, MeasuredBundleSize } from './types';

interface AnalyzeOutputFile {
  filename: string;
}

interface ChunkPart {
  output_file_index: number;
  compressed_size: number;
}

interface AnalyzeData {
  output_files: AnalyzeOutputFile[];
  chunk_parts: ChunkPart[];
}

const analyzeDataHeaderSize = 4;
const clientChunkPrefix = '[client-fs]/_next/static/chunks/';

const isClientJavaScriptChunk = (filename: string) =>
  filename.startsWith(clientChunkPrefix) && filename.endsWith('.js');

const isComparableRoute = (route: string) =>
  !route.startsWith('/api/') && !route.startsWith('/_');

const getAnalyzeDataPathCandidates = (dataDir: string, route: string) => {
  const normalizedRoute = route.replace(/^\/+/, '');

  if (!normalizedRoute) {
    return [
      path.join(dataDir, 'analyze.data'),
      path.join(dataDir, 'index', 'analyze.data'),
    ];
  }

  return [path.join(dataDir, normalizedRoute, 'analyze.data')];
};

const readAnalyzeData = (filePath: string): AnalyzeData => {
  const buffer = fs.readFileSync(filePath);

  if (buffer.length < analyzeDataHeaderSize) {
    throw new Error(`Analyzer file "${filePath}" is invalid`);
  }

  const jsonLength = buffer.readUInt32BE(0);
  const jsonEnd = analyzeDataHeaderSize + jsonLength;

  if (jsonEnd > buffer.length) {
    throw new Error(`Analyzer file "${filePath}" is truncated`);
  }

  const parsedData = JSON.parse(
    buffer.subarray(analyzeDataHeaderSize, jsonEnd).toString('utf8'),
  ) as Partial<AnalyzeData>;

  if (
    !Array.isArray(parsedData.output_files) ||
    !Array.isArray(parsedData.chunk_parts)
  ) {
    throw new Error(`Analyzer file "${filePath}" is missing required fields`);
  }

  return {
    output_files: parsedData.output_files,
    chunk_parts: parsedData.chunk_parts,
  };
};

const loadAnalyzeDataForRoute = (dataDir: string, route: string) => {
  const filePath = getAnalyzeDataPathCandidates(dataDir, route).find(
    (candidatePath) => fs.existsSync(candidatePath),
  );

  if (!filePath) {
    throw new Error(`Cannot find analyzer output for route "${route}"`);
  }

  return readAnalyzeData(filePath);
};

const measureRoute = ({ output_files, chunk_parts }: AnalyzeData) => {
  const outputFileSizes = new Map<number, number>();

  for (const chunkPart of chunk_parts) {
    const outputFile = output_files[chunkPart.output_file_index];

    if (!outputFile || !isClientJavaScriptChunk(outputFile.filename)) {
      continue;
    }

    outputFileSizes.set(
      chunkPart.output_file_index,
      (outputFileSizes.get(chunkPart.output_file_index) ?? 0) +
        chunkPart.compressed_size,
    );
  }

  return Array.from(outputFileSizes.values()).reduce(
    (totalSize, size) => totalSize + size,
    0,
  );
};

export const collectMeasuredBundleSizes = ({
  buildDir,
  maxSize,
  previousConfiguration,
}: {
  buildDir: string;
  maxSize: string;
  previousConfiguration: BundleSizeConfig;
}): MeasuredBundleSize[] => {
  const analyzeDataDir = path.join(buildDir, 'diagnostics', 'analyze', 'data');
  const routes = JSON.parse(
    fs.readFileSync(path.join(analyzeDataDir, 'routes.json'), 'utf8'),
  ) as unknown;

  if (!Array.isArray(routes)) {
    throw new Error('Analyzer routes.json is invalid');
  }

  const previousConfigurationMap = new Map(
    previousConfiguration.files.map((config) => [config.path, config.maxSize]),
  );

  return routes
    .filter((route): route is string => typeof route === 'string')
    .filter(isComparableRoute)
    .map((route) => {
      const sizeInBytes = measureRoute(
        loadAnalyzeDataForRoute(analyzeDataDir, route),
      );

      return {
        path: route,
        sizeInBytes,
        maxSize: previousConfigurationMap.get(route) ?? maxSize,
      };
    })
    .filter(({ sizeInBytes }) => sizeInBytes > 0);
};
