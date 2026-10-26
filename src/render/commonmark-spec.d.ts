declare module "commonmark-spec" {
  const spec: {
    tests: { markdown: string; html: string; section: string; number: number }[];
  };
  export default spec;
}
