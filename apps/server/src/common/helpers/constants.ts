import * as path from 'path';

export const APP_DATA_PATH = 'data';
const LOCAL_STORAGE_DIR = `${APP_DATA_PATH}/storage`;

// LOCAL_STORAGE_PATH lets the desktop app keep files in the user's data folder.
export const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH
  ? path.resolve(process.env.LOCAL_STORAGE_PATH)
  : path.resolve(process.cwd(), '..', '..', LOCAL_STORAGE_DIR);

export function getPageTitle(
  title: string | null | undefined,
  isBase?: boolean,
): string {
  return title || (isBase ? 'Untitled base' : 'untitled');
}
