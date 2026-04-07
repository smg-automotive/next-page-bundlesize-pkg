import { parseArgs } from 'util';

interface Args {
  maxSize: string;
  buildDir: string;
  delta: string;
  previousConfigFileName?: string;
}

export const extractArgs = (args: string[]): Args => {
  const result: Args = {
    maxSize: '200 kB',
    buildDir: '.next',
    delta: '5 kB',
  };

  const { values } = parseArgs({
    args,
    options: {
      maxSize: { type: 'string' },
      buildDir: { type: 'string' },
      delta: { type: 'string' },
      previousConfigFileName: { type: 'string' },
    },
    allowPositionals: true,
  });

  for (const [key, val] of Object.entries(values)) {
    if (val) {
      result[key as keyof Args] = val;
    }
  }

  return result;
};
