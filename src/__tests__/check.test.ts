import path from 'path';
import os from 'os';
import fs from 'fs';

import check from '../check';

interface AnalyzeDataFixture {
  output_files: Array<{
    filename: string;
  }>;
  chunk_parts: Array<{
    output_file_index: number;
    compressed_size: number;
  }>;
}

const writeAnalyzeData = (filePath: string, data: AnalyzeDataFixture) => {
  const serializedData = Buffer.from(JSON.stringify(data));
  const header = Buffer.alloc(4);

  header.writeUInt32BE(serializedData.length, 0);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([header, serializedData]));
};

const createBuildDir = () => {
  const buildDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'next-page-bundlesize-'),
  );
  const analyzeDataDir = path.join(buildDir, 'diagnostics', 'analyze', 'data');

  fs.mkdirSync(analyzeDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(analyzeDataDir, 'routes.json'),
    JSON.stringify(
      ['/[locale]', '/[locale]/search', '/api', '/api/health', '/_not-found'],
      null,
      2,
    ),
  );

  writeAnalyzeData(path.join(analyzeDataDir, '[locale]', 'analyze.data'), {
    output_files: [
      { filename: '[client-fs]/_next/static/chunks/shared.js' },
      { filename: '[client-fs]/_next/static/chunks/home.js' },
      { filename: '[output]/.next/server/chunks/ssr/home.js' },
      { filename: '[client-fs]/_next/static/chunks/styles.css' },
    ],
    chunk_parts: [
      { output_file_index: 0, compressed_size: 60 },
      { output_file_index: 0, compressed_size: 20 },
      { output_file_index: 1, compressed_size: 50 },
      { output_file_index: 1, compressed_size: 10 },
      { output_file_index: 2, compressed_size: 500 },
      { output_file_index: 3, compressed_size: 100 },
    ],
  });

  writeAnalyzeData(
    path.join(analyzeDataDir, '[locale]', 'search', 'analyze.data'),
    {
      output_files: [
        { filename: '[client-fs]/_next/static/chunks/shared.js' },
        { filename: '[client-fs]/_next/static/chunks/search.js' },
        { filename: '[output]/.next/server/chunks/ssr/search.js' },
      ],
      chunk_parts: [
        { output_file_index: 0, compressed_size: 60 },
        { output_file_index: 0, compressed_size: 20 },
        { output_file_index: 1, compressed_size: 15 },
        { output_file_index: 1, compressed_size: 5 },
        { output_file_index: 2, compressed_size: 300 },
      ],
    },
  );

  writeAnalyzeData(path.join(analyzeDataDir, 'api', 'health', 'analyze.data'), {
    output_files: [{ filename: '[client-fs]/_next/static/chunks/api.js' }],
    chunk_parts: [{ output_file_index: 0, compressed_size: 999 }],
  });

  writeAnalyzeData(path.join(analyzeDataDir, 'api', 'analyze.data'), {
    output_files: [{ filename: '[client-fs]/_next/static/chunks/api-root.js' }],
    chunk_parts: [{ output_file_index: 0, compressed_size: 888 }],
  });

  writeAnalyzeData(path.join(analyzeDataDir, '_not-found', 'analyze.data'), {
    output_files: [
      { filename: '[client-fs]/_next/static/chunks/not-found.js' },
    ],
    chunk_parts: [{ output_file_index: 0, compressed_size: 777 }],
  });

  fs.writeFileSync(
    path.join(buildDir, 'master-config.json'),
    JSON.stringify(
      {
        files: [
          {
            path: '/[locale]',
            maxSize: '120B',
          },
          {
            path: '/[locale]/search',
            maxSize: '90B',
          },
        ],
      },
      null,
      2,
    ),
  );

  return buildDir;
};

describe('cli', () => {
  let buildDir: string;
  const mockExit = jest.spyOn(process, 'exit').mockImplementation();
  const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    buildDir = createBuildDir();
  });

  afterEach(() => {
    fs.rmSync(buildDir, { recursive: true, force: true });
  });

  it('produces config with route sizes from the analyzer output', () => {
    check([
      'jest',
      './node_modules/.bin/jest',
      '--maxSize',
      '1 kB',
      '--buildDir',
      buildDir,
    ]);

    const config = JSON.parse(
      fs.readFileSync(
        path.join(buildDir, 'next-page-bundlesize.config.json'),
        'utf8',
      ),
    );

    expect(config).toEqual({
      files: [
        {
          path: '/[locale]',
          size: '140B',
          maxSize: '1 kB',
        },
        {
          path: '/[locale]/search',
          size: '100B',
          maxSize: '1 kB',
        },
      ],
    });
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('fails when bundles are larger than the limit', () => {
    check([
      'jest',
      './node_modules/.bin/jest',
      '--maxSize',
      '100B',
      '--buildDir',
      buildDir,
    ]);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('uses the previous config if defined', () => {
    check([
      'jest',
      './node_modules/.bin/jest',
      '--maxSize',
      '1 kB',
      '--buildDir',
      buildDir,
      '--previousConfigFileName',
      'master-config.json',
    ]);

    const config = JSON.parse(
      fs.readFileSync(
        path.join(buildDir, 'next-page-bundlesize.config.json'),
        'utf8',
      ),
    );

    expect(config).toEqual({
      files: [
        {
          path: '/[locale]',
          size: '140B',
          maxSize: '120B',
        },
        {
          path: '/[locale]/search',
          size: '100B',
          maxSize: '90B',
        },
      ],
    });
  });

  it('adds a delta to the new config if smaller than maxSize', () => {
    check([
      'jest',
      './node_modules/.bin/jest',
      '--maxSize',
      '1 kB',
      '--buildDir',
      buildDir,
      '--previousConfigFileName',
      'master-config.json',
      '--delta',
      '5B',
    ]);

    const updatedConfig = JSON.parse(
      fs.readFileSync(path.join(buildDir, 'bundlesize.json'), 'utf8'),
    );

    expect(updatedConfig).toEqual({
      files: [
        {
          path: '/[locale]',
          maxSize: '145B',
        },
        {
          path: '/[locale]/search',
          maxSize: '105B',
        },
      ],
    });
  });

  it('shows an actionable error when analyzer output is missing', () => {
    fs.rmSync(
      path.join(buildDir, 'diagnostics', 'analyze', 'data', 'routes.json'),
    );

    check([
      'jest',
      './node_modules/.bin/jest',
      '--maxSize',
      '1 kB',
      '--buildDir',
      buildDir,
    ]);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('Analyzer output not found at'),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('next experimental-analyze --output'),
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
