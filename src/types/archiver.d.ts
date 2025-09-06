declare module 'archiver' {
  import { Stream } from 'stream';
  function archiver(format: string, opts?: any): any;
  export = archiver;
}
