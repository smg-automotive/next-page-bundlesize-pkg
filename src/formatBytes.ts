import bytes from 'bytes';

export const formatBytes = (value: number) => {
  const formattedValue = bytes(value);

  if (formattedValue === null) {
    throw new Error(`Cannot format "${value}" as bytes`);
  }

  return formattedValue;
};
