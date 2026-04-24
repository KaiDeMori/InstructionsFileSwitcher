import * as os from 'os';
import * as path from 'path';
import * as constants from './constants';

const WINDOWS_RESERVED_FILE_NAMES = new Set([
   'CON',
   'PRN',
   'AUX',
   'NUL',
   'COM1',
   'COM2',
   'COM3',
   'COM4',
   'COM5',
   'COM6',
   'COM7',
   'COM8',
   'COM9',
   'LPT1',
   'LPT2',
   'LPT3',
   'LPT4',
   'LPT5',
   'LPT6',
   'LPT7',
   'LPT8',
   'LPT9',
]);

export function get_current_os_platform(): NodeJS.Platform {
   return os.platform();
}

function normalize_path_for_comparison_windows(path_to_normalize: string): string {
   return path.normalize(path_to_normalize).toLowerCase();
}

function normalize_path_for_comparison_mac(path_to_normalize: string): string {
   return path.normalize(path_to_normalize).toLowerCase();
}

function normalize_path_for_comparison_linux(path_to_normalize: string): string {
   return path.normalize(path_to_normalize);
}

export function normalize_path_for_comparison(path_to_normalize: string): string {
   const current_os_platform = get_current_os_platform();
   if (current_os_platform === 'win32') {
      return normalize_path_for_comparison_windows(path_to_normalize);
   }
   if (current_os_platform === 'darwin') {
      return normalize_path_for_comparison_mac(path_to_normalize);
   }
   if (current_os_platform === 'linux') {
      return normalize_path_for_comparison_linux(path_to_normalize);
   }
   return path.normalize(path_to_normalize);
}

function get_hard_coded_user_path_candidates_windows(home_directory: string): string[] {
   const windows_candidates: string[] = [
      path.join(home_directory, constants.COPILOT_USER_INSTRUCTIONS_RELATIVE_PATH),
   ];
   const roaming_appdata_path = process.env.APPDATA;
   if (roaming_appdata_path) {
      windows_candidates.push(path.join(roaming_appdata_path, constants.VSCODE_STABLE_PROMPTS_RELATIVE_PATH_WINDOWS));
      windows_candidates.push(path.join(roaming_appdata_path, constants.VSCODE_INSIDERS_PROMPTS_RELATIVE_PATH_WINDOWS));
   }
   return windows_candidates;
}

function get_hard_coded_user_path_candidates_mac(home_directory: string): string[] {
   return [
      path.join(home_directory, constants.COPILOT_USER_INSTRUCTIONS_RELATIVE_PATH),
      path.join(home_directory, constants.VSCODE_STABLE_PROMPTS_RELATIVE_PATH_MAC),
      path.join(home_directory, constants.VSCODE_INSIDERS_PROMPTS_RELATIVE_PATH_MAC),
   ];
}

function get_hard_coded_user_path_candidates_linux(home_directory: string): string[] {
   return [
      path.join(home_directory, constants.COPILOT_USER_INSTRUCTIONS_RELATIVE_PATH),
      path.join(home_directory, constants.VSCODE_STABLE_PROMPTS_RELATIVE_PATH_LINUX),
      path.join(home_directory, constants.VSCODE_INSIDERS_PROMPTS_RELATIVE_PATH_LINUX),
   ];
}

export function get_hard_coded_user_path_candidates_for_current_os(): string[] {
   const home_directory = os.homedir();
   const current_os_platform = get_current_os_platform();

   if (current_os_platform === 'win32') {
      return get_hard_coded_user_path_candidates_windows(home_directory);
   }
   if (current_os_platform === 'darwin') {
      return get_hard_coded_user_path_candidates_mac(home_directory);
   }
   if (current_os_platform === 'linux') {
      return get_hard_coded_user_path_candidates_linux(home_directory);
   }

   return [path.join(home_directory, constants.COPILOT_USER_INSTRUCTIONS_RELATIVE_PATH)];
}

function has_invalid_filename_characters_windows(file_name: string): boolean {
   const windows_invalid_characters_regex = /[<>:"/\\|?*\u0000]/;
   if (windows_invalid_characters_regex.test(file_name)) {
      return true;
   }
   if (/[. ]$/.test(file_name)) {
      return true;
   }
   const normalized_name_without_extension = file_name.split('.')[0].toUpperCase();
   return WINDOWS_RESERVED_FILE_NAMES.has(normalized_name_without_extension);
}

function has_invalid_filename_characters_mac(file_name: string): boolean {
   return /[/:\u0000]/.test(file_name);
}

function has_invalid_filename_characters_linux(file_name: string): boolean {
   return /[/\u0000]/.test(file_name);
}

export function has_invalid_filename_characters_for_current_os(file_name: string): boolean {
   const current_os_platform = get_current_os_platform();
   if (current_os_platform === 'win32') {
      return has_invalid_filename_characters_windows(file_name);
   }
   if (current_os_platform === 'darwin') {
      return has_invalid_filename_characters_mac(file_name);
   }
   if (current_os_platform === 'linux') {
      return has_invalid_filename_characters_linux(file_name);
   }
   return /[/\u0000]/.test(file_name);
}