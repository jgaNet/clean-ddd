export const html = (strings: TemplateStringsArray, ...substitutions: (string | number)[]): string => {
  return String.raw({ raw: strings }, ...substitutions);
};
