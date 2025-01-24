import executable from 'rollup-plugin-executable';
import shebang from 'rollup-plugin-add-shebang';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/bin/cli',
        sourcemap: false,
        format: 'cjs',
      },
    ],
    plugins: [
      resolve({ preferBuiltins: true }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        outDir: 'dist/bin',
      }),
      shebang({
        include: 'dist/bin/cli',
      }),
      executable(),
    ],
  },
];
