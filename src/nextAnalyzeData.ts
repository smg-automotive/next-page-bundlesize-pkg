import path from 'path';
import fs from 'fs';

export interface RouteBundleSize {
  path: string;
  size: number;
}

interface EdgeReference {
  offset: number;
  length: number;
}

interface AnalyzeHeader {
  chunk_parts: Array<{
    compressed_size: number;
    output_file_index: number;
  }>;
  output_file_chunk_parts: EdgeReference;
  output_files: Array<{
    filename: string;
  }>;
}

class AnalyzeDataFile {
  constructor(
    private readonly header: AnalyzeHeader,
    private readonly binaryData: DataView,
  ) {}

  chunkPart(index: number) {
    return this.header.chunk_parts[index];
  }

  outputFile(index: number) {
    return this.header.output_files[index];
  }

  outputFileCount() {
    return this.header.output_files.length;
  }

  outputFileChunkParts(index: number) {
    return this.readEdgesDataAtIndex(
      this.header.output_file_chunk_parts,
      index,
    );
  }

  private readEdgesDataAtIndex(reference: EdgeReference, index: number) {
    const { offset, length } = reference;
    if (length === 0) {
      return [];
    }

    const edgeGroupCount = this.binaryData.getUint32(offset, false);
    if (index < 0 || index >= edgeGroupCount) {
      return [];
    }

    const offsetsStart = offset + 4;
    const previousOffset =
      index === 0
        ? 0
        : this.binaryData.getUint32(offsetsStart + (index - 1) * 4, false);
    const currentOffset = this.binaryData.getUint32(
      offsetsStart + index * 4,
      false,
    );
    const edgeCount = currentOffset - previousOffset;
    if (edgeCount === 0) {
      return [];
    }

    const dataStart = offset + 4 + edgeGroupCount * 4;
    return Array.from({ length: edgeCount }, (_, edgeIndex) =>
      this.binaryData.getUint32(
        dataStart + (previousOffset + edgeIndex) * 4,
        false,
      ),
    );
  }
}

const getAnalyzeDataDir = (buildDir: string) =>
  path.join(buildDir, 'diagnostics', 'analyze', 'data');

const getRouteAnalyzeDataPath = (buildDir: string, route: string) =>
  route === '/'
    ? path.join(getAnalyzeDataDir(buildDir), 'analyze.data')
    : path.join(
        getAnalyzeDataDir(buildDir),
        route.replace(/^\//, ''),
        'analyze.data',
      );

const isClientJavaScriptFile = (filename: string) =>
  filename.startsWith('[client-fs]/') && filename.endsWith('.js');

const loadAnalyzeRoutes = (buildDir: string): string[] => {
  const routesFile = path.join(getAnalyzeDataDir(buildDir), 'routes.json');
  try {
    return JSON.parse(fs.readFileSync(routesFile, 'utf8')) as string[];
  } catch {
    throw new Error(
      `Could not load analyzer routes from ${routesFile}. Run "next experimental-analyze --output" first.`,
    );
  }
};

const loadAnalyzeDataFile = (filePath: string) => {
  const fileContent = fs.readFileSync(filePath);
  const buffer = fileContent.buffer.slice(
    fileContent.byteOffset,
    fileContent.byteOffset + fileContent.byteLength,
  );
  const dataView = new DataView(buffer);
  const headerLength = dataView.getUint32(0, false);
  const headerJson = fileContent.subarray(4, 4 + headerLength).toString('utf8');
  const header = JSON.parse(headerJson) as AnalyzeHeader;
  const binaryBuffer = buffer.slice(4 + headerLength);

  return new AnalyzeDataFile(header, new DataView(binaryBuffer));
};

const extractRouteBundleSize = (buildDir: string, route: string) => {
  const routeAnalyzeDataPath = getRouteAnalyzeDataPath(buildDir, route);
  if (!fs.existsSync(routeAnalyzeDataPath)) {
    return null;
  }

  const analyzeData = loadAnalyzeDataFile(routeAnalyzeDataPath);
  const chunkPartIndices = new Set<number>();

  for (
    let outputFileIndex = 0;
    outputFileIndex < analyzeData.outputFileCount();
    outputFileIndex += 1
  ) {
    const outputFile = analyzeData.outputFile(outputFileIndex);
    if (!outputFile || !isClientJavaScriptFile(outputFile.filename)) {
      continue;
    }

    analyzeData
      .outputFileChunkParts(outputFileIndex)
      .forEach((chunkPartIndex) => {
        chunkPartIndices.add(chunkPartIndex);
      });
  }

  const size = Array.from(chunkPartIndices).reduce((total, chunkPartIndex) => {
    const chunkPart = analyzeData.chunkPart(chunkPartIndex);
    return total + (chunkPart?.compressed_size ?? 0);
  }, 0);

  return {
    path: route,
    size,
  };
};

export const getRouteBundleSizes = (buildDir: string): RouteBundleSize[] => {
  const routeBundleSizes = loadAnalyzeRoutes(buildDir)
    .map((route) => extractRouteBundleSize(buildDir, route))
    .filter((route): route is RouteBundleSize => route !== null);

  if (routeBundleSizes.length === 0) {
    throw new Error(
      `No analyzer route data found in ${getAnalyzeDataDir(buildDir)}. Run "next experimental-analyze --output" first.`,
    );
  }

  return routeBundleSizes;
};

export const toLegacyBundlePath = (buildDir: string, route: string) =>
  path.join(
    buildDir,
    `.bundlesize${route.replace(/\//g, '_').replace(/[[\]]/g, '-')}`,
  );
