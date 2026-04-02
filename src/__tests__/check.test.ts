import path from 'path';
import fs from 'fs';

import check from '../check';

const buildDir = './src/__tests__/.analyze';
const normalizedBuildDir = path.normalize(buildDir);

const validRunConfig = [
  'jest',
  './node_modules/.bin/jest',
  '--maxSize',
  '1 kB',
  '--buildDir',
  buildDir,
];

const writeAnalyzeData = ({
  route,
  outputFiles,
  chunkParts,
}: {
  route: string;
  outputFiles: Array<{ filename: string }>;
  chunkParts: Array<{
    output_file_index: number;
    size: number;
    compressed_size: number;
  }>;
}) => {
  const dataPath = path.join(
    buildDir,
    'data',
    ...route.split('/').filter(Boolean),
    'analyze.data',
  );
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });

  const json = JSON.stringify({
    output_files: outputFiles,
    chunk_parts: chunkParts,
  });
  const header = Buffer.alloc(4);
  header.writeUInt32BE(Buffer.byteLength(json), 0);

  fs.writeFileSync(
    dataPath,
    Buffer.concat([header, Buffer.from(json, 'utf8'), Buffer.from([0, 1, 2])]),
  );
};

const createAnalyzeFixture = () => {
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(buildDir, 'data'), { recursive: true });

  fs.writeFileSync(
    path.join(buildDir, 'data', 'routes.json'),
    JSON.stringify(['/', '/[locale]/search', '/api/live'], null, 2),
  );

  writeAnalyzeData({
    route: '/',
    outputFiles: [
      { filename: '[client-fs]/_next/static/chunks/framework.js' },
      { filename: '[client-fs]/_next/static/chunks/home.js' },
      { filename: '[client-fs]/_next/static/chunks/home.css' },
      { filename: '[output]/.next/server/app/page.js' },
    ],
    chunkParts: [
      { output_file_index: 0, size: 300, compressed_size: 100 },
      { output_file_index: 1, size: 150, compressed_size: 50 },
      { output_file_index: 2, size: 100, compressed_size: 30 },
      { output_file_index: 3, size: 400, compressed_size: 120 },
    ],
  });

  writeAnalyzeData({
    route: '/[locale]/search',
    outputFiles: [
      { filename: '[client-fs]/_next/static/chunks/framework.js' },
      { filename: '[client-fs]/_next/static/chunks/search.js' },
      { filename: '[client-fs]/_next/static/chunks/search.css' },
      { filename: '[output]/.next/server/app/[locale]/search/page.js' },
    ],
    chunkParts: [
      { output_file_index: 0, size: 300, compressed_size: 100 },
      { output_file_index: 1, size: 180, compressed_size: 60 },
      { output_file_index: 2, size: 100, compressed_size: 25 },
      { output_file_index: 3, size: 400, compressed_size: 150 },
    ],
  });

  writeAnalyzeData({
    route: '/api/live',
    outputFiles: [
      { filename: '[client-fs]/_next/static/chunks/framework.js' },
      { filename: '[output]/.next/server/app/api/live/route.js' },
    ],
    chunkParts: [
      { output_file_index: 0, size: 90, compressed_size: 20 },
      { output_file_index: 1, size: 250, compressed_size: 80 },
    ],
  });

  fs.writeFileSync(
    path.join(buildDir, 'master-config.json'),
    JSON.stringify(
      {
        files: [
          {
            path: `${normalizedBuildDir}/.bundlesize_-locale-_search`,
            maxSize: '100 B',
          },
        ],
      },
      null,
      2,
    ),
  );
};

describe('cli', () => {
  const mockExit = jest.spyOn(process, 'exit').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    createAnalyzeFixture();
  });

  afterAll(() => {
    fs.rmSync(buildDir, { recursive: true, force: true });
  });

  it('produces config with correct files and sizes', () => {
    check(validRunConfig);

    const config = fs
      .readFileSync(path.join(buildDir, 'next-page-bundlesize.config.json'))
      .toString();
    expect(config).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('produces a metadata bundle file for a route', () => {
    check(validRunConfig);

    const page = fs
      .readFileSync(path.join(buildDir, '.bundlesize_'))
      .toString();
    expect(page).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('fails when bundles are larger than the limit', () => {
    check([
      'jest',
      './node_modules/.bin/jest',
      '--maxSize',
      '1 B',
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

    const updatedConfig = fs
      .readFileSync(path.join(buildDir, 'bundlesize.json'))
      .toString();
    expect(updatedConfig).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('adds a delta to the new config if smaller than maxSize', () => {
    check([
      ...validRunConfig,
      '--previousConfigFileName',
      'master-config.json',
      '--delta',
      '5 B',
    ]);

    const updatedConfig = fs
      .readFileSync(path.join(buildDir, 'bundlesize.json'))
      .toString();
    expect(updatedConfig).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
