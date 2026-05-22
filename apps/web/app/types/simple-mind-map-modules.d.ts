declare module "simple-mind-map/src/parse/xmind.js" {
  const xmindParser: {
    parseXmindFile: (file: Blob, options?: unknown) => Promise<unknown>;
  };

  export default xmindParser;
}

declare module "simple-mind-map/src/plugins/RichText.js" {
  const RichTextPlugin: any;
  export default RichTextPlugin;
}

declare module "simple-mind-map/src/plugins/RichText" {
  const RichTextPlugin: any;
  export default RichTextPlugin;
}
