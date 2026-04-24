import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Path_Item } from './Path_Item';
import * as constants from './constants';
import { instruction_tree_view } from './instruction_tree_view';
import { load_profiles_from_settings, save_profiles_to_settings } from './profile_manager';
import {
   get_hard_coded_user_path_candidates_for_current_os,
   normalize_path_for_comparison,
} from './os_platform_helpers';
import { IFS_notifier } from './notifier';

export type autopopulated_entry = {
   absolute_path: string;
   label: string;
   tree_view_title: string;
};

type resolved_setting_path_kind = 'workspace-relative' | 'absolute' | 'home-relative';

type resolved_setting_path = {
   original_path: string;
   absolute_path: string;
   kind: resolved_setting_path_kind;
};

function is_home_relative_setting_path(path_to_check: string): boolean {
   return /^~(?:[\\/]|$)/.test(path_to_check);
}

function is_workspace_relative_setting_path(path_to_check: string): boolean {
   return !path.isAbsolute(path_to_check) && !is_home_relative_setting_path(path_to_check);
}

function get_last_two_path_segments(path_value: string): string {
   const path_segments = path_value.split(/[\\/]+/).filter(path_segment => path_segment !== '');
   if (path_segments.length === 0) {
      return path_value;
   }
   if (path_segments.length === 1) {
      return path_segments[0];
   }
   return `${path_segments[path_segments.length - 2]}/${path_segments[path_segments.length - 1]}`;
}

function build_auto_tree_view_title(path_in_settings: string): string {
   const shortened_path = get_last_two_path_segments(path_in_settings);
   if (is_workspace_relative_setting_path(path_in_settings)) {
      return `WS/${shortened_path}`;
   }
   return shortened_path;
}

function resolve_setting_path_to_absolute(
   workspace_root: string | undefined,
   instruction_location_path: string,
): resolved_setting_path | null {
   const trimmed_setting_path = instruction_location_path.trim();
   if (trimmed_setting_path === '') {
      return null;
   }

   if (is_home_relative_setting_path(trimmed_setting_path)) {
      const home_path_prefix_regex = /^~(?:[\\/]|$)/;
      const home_relative_path = trimmed_setting_path.replace(home_path_prefix_regex, '');
      return {
         original_path: instruction_location_path,
         absolute_path: path.join(os.homedir(), home_relative_path),
         kind: 'home-relative',
      };
   }

   if (path.isAbsolute(trimmed_setting_path)) {
      return {
         original_path: instruction_location_path,
         absolute_path: trimmed_setting_path,
         kind: 'absolute',
      };
   }

   if (!workspace_root) {
      return null;
   }

   return {
      original_path: instruction_location_path,
      absolute_path: path.join(workspace_root, trimmed_setting_path),
      kind: 'workspace-relative',
   };
}

function build_auto_entry_label(resolved_path: resolved_setting_path): string {
   if (resolved_path.kind === 'workspace-relative') {
      return path.basename(resolved_path.original_path) || resolved_path.original_path;
   }
   return resolved_path.original_path;
}

//returns an array of objects with path and label properties for auto-populated entries based on the "Chat: Instructions Files Locations" setting, filtering out disabled entries and resolving workspace-relative and home-relative paths
export function create_autopopulated_entries(): autopopulated_entry[] {
   const workspace_folders = vscode.workspace.workspaceFolders;
   const workspace_root = workspace_folders && workspace_folders.length > 0
      ? workspace_folders[0].uri.fsPath
      : undefined;

   if (workspace_folders && workspace_folders.length > 1) {
      IFS_notifier.notify_warning('IFS: Multiple workspace folders found. Only first workspace folder is used for auto-populated workspace entry. Consider using the "Additional Workspace Paths" setting for other workspace folders.');
   }

   const copilot_instruction_locations = vscode.workspace
      .getConfiguration('chat')
      .get<Record<string, boolean>>('instructionsFilesLocations', {});

   IFS_notifier.log_debug(`Retrieved "Chat: Instructions Files Locations" setting with ${Object.keys(copilot_instruction_locations).length} entries for auto-population.`);

   const auto_populated_entries: autopopulated_entry[] = [];
   let skipped_workspace_relative_path_count = 0;

   for (const [instruction_location_path, enabled] of Object.entries(copilot_instruction_locations)) {
      if (!enabled) {
         continue;
      }

      const resolved_setting_path = resolve_setting_path_to_absolute(workspace_root, instruction_location_path);
      if (!resolved_setting_path) {
         if (is_workspace_relative_setting_path(instruction_location_path)) {
            skipped_workspace_relative_path_count++;
         }
         continue;
      }

      auto_populated_entries.push({
         absolute_path: resolved_setting_path.absolute_path,
         label: build_auto_entry_label(resolved_setting_path),
         tree_view_title: build_auto_tree_view_title(instruction_location_path),
      });
   }

   if (!workspace_root && skipped_workspace_relative_path_count > 0) {
      IFS_notifier.notify_warning(
         `IFS: No workspace folder is open. Ignoring ${skipped_workspace_relative_path_count} workspace-relative chat.instructionsFilesLocations entr${skipped_workspace_relative_path_count === 1 ? 'y' : 'ies'} until a workspace is opened.`
      );
   }

   // remove all non-existing paths and warn about them
   const existing_entries = auto_populated_entries.filter(entry => {
      if (!fs.existsSync(entry.absolute_path)) {
         IFS_notifier.notify_warning(`IFS: Auto-populated path "${entry.absolute_path}" does not exist and will be ignored.`);
         return false;
      }
      return true;
   });


   return existing_entries;
}

/**
 * Returns the legacy single hard-coded user path under the home directory, if it exists.
 * @returns {string | null} Absolute path or null if it doesn't exist on disk.
 */
export function get_hard_coded_user_path(): string | null {
   const users_homedir = os.homedir();
   const full_path = path.join(users_homedir, constants.COPILOT_USER_INSTRUCTIONS_RELATIVE_PATH);
   if (!fs.existsSync(full_path)) {
      return null;
   }
   return full_path;
}

/**
 * Returns all known hard-coded candidate paths that exist on disk for the current OS:
 *  - ~/.copilot/instructions (all OS)
 *  - Windows: %APPDATA%/Code/User/prompts and %APPDATA%/Code - Insiders/User/prompts
 *  - macOS: ~/Library/Application Support/Code/User/prompts and ~/Library/Application Support/Code - Insiders/User/prompts
 *  - Linux: ~/.config/Code/User/prompts and ~/.config/Code - Insiders/User/prompts
 * @returns {string[]} Absolute paths to all valid (existing) candidates, in priority order, deduplicated.
 */
export function get_hard_coded_user_paths(): string[] {
   const candidates = get_hard_coded_user_path_candidates_for_current_os();

   const existing_candidates: string[] = [];
   const seen_normalized_paths = new Set<string>();
   for (const candidate_path of candidates) {
      const normalized = normalize_path_for_comparison(candidate_path);
      if (seen_normalized_paths.has(normalized)) {
         continue;
      }
      if (fs.existsSync(candidate_path)) {
         existing_candidates.push(candidate_path);
         seen_normalized_paths.add(normalized);
      }
   }

   return existing_candidates;
}