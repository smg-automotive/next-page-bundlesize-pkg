export default {
  clearMocks: true,
  collectCoverage: false,
  errorOnDeprecated: true,
  extensionsToTreatAsEsm: ['.ts'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  preset: 'ts-jest/presets/default-esm',
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  testRegex: '(/__tests__/.*|(\\.|/)test)\\.tsx?$',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
