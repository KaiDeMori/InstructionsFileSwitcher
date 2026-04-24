import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Path_Item } from './Path_Item';
import {
   path_tree_data_provider,
   is_active_instruction_file,
   is_deactivated_instruction_file,
   is_instruction_file,
   get_active_path_for,
   get_deactivated_path_for,
   strip_instruction_extension,
} from './path_tree_data_provider';
import { Profile_Entry } from './Profile';
import * as constants from './constants';
import { IFS_notifier } from './notifier';

interface rename_outcome {
   source_path: string;
   target_path: string;
   succeeded: boolean;
   error_message?: string;
}

function build_profile_entry_file_paths(profile_entry: Profile_Entry): { active_path: string; deactivated_path: string } {
   const active_path = path.join(profile_entry.absolute_path, `${profile_entry.basename}${constants.INSTRUCTION_FILE_EXTENSION}`);
   const deactivated_path = path.join(profile_entry.absolute_path, `${profile_entry.basename}${constants.IFS_DEACTIVATED_EXTENSION}`);
   return {
      active_path,
      deactivated_path,
   };
}

export class instruction_file_synchronizer {
   /**
    * @param {path_tree_data_provider} tree_data_provider - The tree data provider to read/write state from.
    * @param {vscode.TreeView<Path_Item>} tree_view - The tree view instance for setting status messages.
    */
   constructor(
      private readonly tree_data_provider: path_tree_data_provider,
      private readonly tree_view: vscode.TreeView<Path_Item>,
   ) {}

   /**
    * @returns {vscode.Disposable} Subscription to dispose when the extension deactivates.
    */
   subscribe_to_configuration_changes(): vscode.Disposable {
      return vscode.workspace.onDidChangeConfiguration(async event => {
         if (event.affectsConfiguration(this.tree_data_provider.get_full_config_path())) {
            this.tree_data_provider.set_busy();
            this.tree_view.message = 'Loading…';
            await this.tree_data_provider.populate_treeview_from_path();
            this.tree_data_provider.refresh_tree_view();
            this.tree_data_provider.clear_busy();
            this.tree_view.message = this.tree_data_provider.load_error_message ?? 'Ready';
         }
      });
   }

   /**
    * Activates a profile by renaming files: those in `active_entries` become active,
    * every other instruction file under the configured path becomes deactivated.
    * @param {string} profile_name - Display name of the profile being activated.
    * @param {Profile_Entry[]} active_entries - Entries that should end up active.
    */
   async activate_profile(profile_name: string, active_entries: Profile_Entry[]): Promise<void> {
      const configured_path = this.tree_data_provider.get_configured_path();
      if (!configured_path || !fs.existsSync(configured_path)) {
         IFS_notifier.notify_error(
            `IFS: profile "${profile_name}" cannot be applied because the configured path is missing.`
         );
         return;
      }

      this.tree_data_provider.set_busy();
      this.tree_view.message = 'Applying profile…';

      const all_present_files = this.tree_data_provider.get_descendant_instruction_files(configured_path);
      const desired_active_paths = new Set<string>();
      const missing_active_basenames: string[] = [];

      for (const entry of active_entries) {
         const { active_path: candidate_active, deactivated_path: candidate_deactivated } = build_profile_entry_file_paths(entry);
         if (fs.existsSync(candidate_active)) {
            desired_active_paths.add(candidate_active);
         } else if (fs.existsSync(candidate_deactivated)) {
            desired_active_paths.add(candidate_active);
         } else {
            missing_active_basenames.push(entry.basename);
         }
      }

      const rename_outcomes: rename_outcome[] = [];
      for (const present_file of all_present_files) {
         const should_be_active = desired_active_paths.has(get_active_path_for(present_file));
         const outcome = await this.rename_file_to_state(present_file, should_be_active);
         if (outcome) {
            rename_outcomes.push(outcome);
         }
      }

      this.report_rename_outcomes(rename_outcomes);
      if (missing_active_basenames.length > 0) {
         IFS_notifier.notify_warning(
            `IFS: profile "${profile_name}" references missing instruction files: ${missing_active_basenames.join(', ')}`
         );
      }

      await this.tree_data_provider.populate_treeview_from_path();
      this.tree_data_provider.refresh_tree_view();
      this.tree_data_provider.clear_busy();
      this.tree_view.message = this.tree_data_provider.load_error_message ?? 'Ready';
   }

   /**
    * Toggles the active/deactivated state of a single tree item (file or directory).
    * Triggered by the toggle-checkbox command (clicking the label).
    * @param {Path_Item} item - The tree item to toggle.
    */
   async toggle_item(item: Path_Item): Promise<void> {
      if (!item.path) {
         return;
      }
      const should_be_active = item.isDirectory
         ? !this.are_all_descendants_currently_active(item.path)
         : !is_active_instruction_file(item.path);
      await this.set_item_state(item, should_be_active);
   }

   /**
    * Sets a tree item to the requested active/deactivated state by renaming files.
    * @param {Path_Item} item - The tree item to mutate.
    * @param {boolean} should_be_active - Whether the item should end up active.
    */
   async set_item_state(item: Path_Item, should_be_active: boolean): Promise<void> {
      if (!item.path) {
         return;
      }

      this.tree_data_provider.set_busy();
      this.tree_view.message = 'Updating files…';

      const target_files = item.isDirectory
         ? this.tree_data_provider.get_descendant_instruction_files(item.path)
         : [item.path];

      const rename_outcomes: rename_outcome[] = [];
      for (const target_file of target_files) {
         const outcome = await this.rename_file_to_state(target_file, should_be_active);
         if (outcome) {
            rename_outcomes.push(outcome);
         }
      }

      this.report_rename_outcomes(rename_outcomes);
      await this.tree_data_provider.populate_treeview_from_path();
      this.tree_data_provider.refresh_tree_view();
      this.tree_data_provider.clear_busy();
      this.tree_view.message = this.tree_data_provider.load_error_message ?? 'Ready';
   }

   /**
    * @param {string} directory_path - Directory to inspect.
    * @returns {boolean} Whether every descendant instruction file is currently active.
    */
   private are_all_descendants_currently_active(directory_path: string): boolean {
      const descendant_files = this.tree_data_provider.get_descendant_instruction_files(directory_path);
      if (descendant_files.length === 0) {
         return false;
      }
      return descendant_files.every(file_path => is_active_instruction_file(file_path));
   }

   /**
    * Renames a single file to the requested active/deactivated state.
    * @param {string} source_file_path - Current absolute path of the file.
    * @param {boolean} should_be_active - Target state.
    * @returns {Promise<rename_outcome | undefined>} Outcome, or undefined when no action was needed.
    */
   private async rename_file_to_state(source_file_path: string, should_be_active: boolean): Promise<rename_outcome | undefined> {
      if (!is_instruction_file(source_file_path)) {
         return undefined;
      }

      const is_currently_active = is_active_instruction_file(source_file_path);
      if (is_currently_active === should_be_active) {
         this.tree_data_provider.clear_error_path(source_file_path);
         return undefined;
      }

      const target_file_path = should_be_active
         ? get_active_path_for(source_file_path)
         : get_deactivated_path_for(source_file_path);

      if (target_file_path === source_file_path) {
         return undefined;
      }

      if (!fs.existsSync(source_file_path)) {
         this.tree_data_provider.mark_error_path(source_file_path);
         return {
            source_path: source_file_path,
            target_path: target_file_path,
            succeeded: false,
            error_message: 'source file no longer exists',
         };
      }

      if (fs.existsSync(target_file_path)) {
         this.tree_data_provider.mark_error_path(source_file_path);
         return {
            source_path: source_file_path,
            target_path: target_file_path,
            succeeded: false,
            error_message: `target name "${path.basename(target_file_path)}" already exists in the same folder`,
         };
      }

      try {
         await fs.promises.rename(source_file_path, target_file_path);
         this.tree_data_provider.clear_error_path(source_file_path);
         return {
            source_path: source_file_path,
            target_path: target_file_path,
            succeeded: true,
         };
      } catch (rename_error) {
         this.tree_data_provider.mark_error_path(source_file_path);
         const error_text = rename_error instanceof Error ? rename_error.message : String(rename_error);
         return {
            source_path: source_file_path,
            target_path: target_file_path,
            succeeded: false,
            error_message: error_text,
         };
      }
   }

   /**
    * @param {rename_outcome[]} rename_outcomes - All outcomes from a batch.
    */
   private report_rename_outcomes(rename_outcomes: rename_outcome[]): void {
      const failed_outcomes = rename_outcomes.filter(outcome => !outcome.succeeded);
      if (failed_outcomes.length === 0) {
         return;
      }
      const failure_lines = failed_outcomes.map(outcome => {
         const source_basename = path.basename(outcome.source_path);
         return `${strip_instruction_extension(source_basename)} (${outcome.error_message})`;
      });
      IFS_notifier.notify_error(
         `IFS: rename failed for: ${failure_lines.join(', ')}`
      );
   }
}

// re-exports for convenience
export { is_active_instruction_file, is_deactivated_instruction_file };
