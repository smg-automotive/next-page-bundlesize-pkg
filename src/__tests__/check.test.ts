import path from 'path';
import fs from 'fs';

import check from '../check';

const buildDir = './src/__tests__/.next';
const diagnosticsDir = path.join(buildDir, 'diagnostics');
const validRunConfig = [
  'jest',
  './node_modules/.bin/jest',
  '--maxSize',
  '1 kB',
  '--buildDir',
  buildDir,
];

const routeFixtures = [
  { route: '/', clientChunkSizes: [10, 20], serverChunkSizes: [500] },
  { route: '/_app', clientChunkSizes: [5, 15], serverChunkSizes: [400] },
  {
    route: '/[locale]/layout',
    clientChunkSizes: [12, 13],
    serverChunkSizes: [300],
  },
  {
    route: '/[locale]/search',
    clientChunkSizes: [12, 18],
    serverChunkSizes: [350],
  },
];

const encodeEdgeReference = (groups: number[][]) => {
  const flatValues = groups.flat();
  const buffer = Buffer.alloc(4 + groups.length * 4 + flatValues.length * 4);
  buffer.writeUInt32BE(groups.length, 0);

  let cumulativeOffset = 0;
  groups.forEach((group, groupIndex) => {
    cumulativeOffset += group.length;
    buffer.writeUInt32BE(cumulativeOffset, 4 + groupIndex * 4);
  });

  flatValues.forEach((value, valueIndex) => {
    buffer.writeUInt32BE(value, 4 + groups.length * 4 + valueIndex * 4);
  });

  return {
    buffer,
    reference: {
      offset: 0,
      length: buffer.length,
    },
  };
};

const createAnalyzeDataBuffer = ({
  clientChunkSizes,
  serverChunkSizes,
}: {
  clientChunkSizes: number[];
  serverChunkSizes: number[];
}) => {
  const chunkParts = [
    ...clientChunkSizes.map((compressedSize, outputFileIndex) => ({
      compressed_size: compressedSize,
      output_file_index: outputFileIndex,
    })),
    ...serverChunkSizes.map((compressedSize, index) => ({
      compressed_size: compressedSize,
      output_file_index: clientChunkSizes.length + index,
    })),
  ];
  const outputFiles = [
    ...clientChunkSizes.map((_, index) => ({
      filename: `[client-fs]/chunk-${index}.js`,
    })),
    ...serverChunkSizes.map((_, index) => ({
      filename: `[project]/server-${index}.js`,
    })),
  ];
  const outputFileChunkPartGroups = outputFiles.map((_, index) => [index]);
  const { buffer, reference } = encodeEdgeReference(outputFileChunkPartGroups);
  const header = {
    chunk_parts: chunkParts,
    output_file_chunk_parts: reference,
    output_files: outputFiles,
  };
  const headerBuffer = Buffer.from(JSON.stringify(header), 'utf8');
  const headerLengthBuffer = Buffer.alloc(4);
  headerLengthBuffer.writeUInt32BE(headerBuffer.length, 0);

  return Buffer.concat([headerLengthBuffer, headerBuffer, buffer]);
};

const getRouteAnalyzeDataPath = (route: string) =>
  route === '/'
    ? path.join(buildDir, 'diagnostics', 'analyze', 'data', 'analyze.data')
    : path.join(
        buildDir,
        'diagnostics',
        'analyze',
        'data',
        route.replace(/^\//, ''),
        'analyze.data',
      );

const writeAnalyzeFixture = () => {
  fs.rmSync(diagnosticsDir, { recursive: true, force: true });

  const analyzeDataDir = path.join(buildDir, 'diagnostics', 'analyze', 'data');
  fs.mkdirSync(analyzeDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(analyzeDataDir, 'routes.json'),
    JSON.stringify(
      routeFixtures.map(({ route }) => route),
      null,
      2,
    ),
  );

  routeFixtures.forEach((routeFixture) => {
    const analyzeDataPath = getRouteAnalyzeDataPath(routeFixture.route);
    fs.mkdirSync(path.dirname(analyzeDataPath), { recursive: true });
    fs.writeFileSync(analyzeDataPath, createAnalyzeDataBuffer(routeFixture));
  });
};

describe('cli', () => {
  const mockExit = jest
    .spyOn(process, 'exit')
    .mockImplementation((() => undefined) as never);

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    writeAnalyzeFixture();
  });

  it('produces config with correct routes and sizes', () => {
    check(validRunConfig);

    const config = fs
      .readFileSync('./src/__tests__/.next/next-page-bundlesize.config.json')
      .toString();
    expect(config).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('fails when bundles are larger than the limit', () => {
    check([
      'jest',
      './node_modules/.bin/jest',
      '--maxSize',
      '1 b',
      '--buildDir',
      buildDir,
    ]);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('uses the previous config if defined', () => {
    check([
      ...validRunConfig,
      '--previousConfigFileName',
      'master-config.json',
    ]);

    const config = fs
      .readFileSync('./src/__tests__/.next/next-page-bundlesize.config.json')
      .toString();
    expect(config).toMatchSnapshot();
  });

  it('adds a delta to the new config if smaller than maxSize', () => {
    check([
      ...validRunConfig,
      '--previousConfigFileName',
      'master-config.json',
      '--delta',
      '5 kB',
    ]);

    const updatedConfig = fs
      .readFileSync('./src/__tests__/.next/bundlesize.json')
      .toString();
    expect(updatedConfig).toMatchSnapshot();
  });
});
