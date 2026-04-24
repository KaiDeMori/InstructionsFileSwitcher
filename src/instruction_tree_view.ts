import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Path_Item } from './Path_Item';
import * as constants from './constants';
import { get_hard_coded_user_paths } from './filesystem-helpers';
import { instruction_file_synchronizer } from './instruction_file_synchronizer';
import {
   path_tree_data_provider,
   path_tree_data_provider_constructor_params,
   path_tree_data_provider_constructor_provider,
} from './path_tree_data_provider';
import { show_profile_quick_pick } from './profile_manager';
import { normalize_path_for_comparison } from './os_platform_helpers';
import { IFS_notifier } from './notifier';

/**
 * Module-level provider that returns extra paths considered "in use" by other treeviews
 * but not stored in `ifs.paths.user` / `ifs.paths.additional` (e.g. fixed paths from
 * `chat.instructionsFilesLocations`). Set by `extension.ts` after constructing all trees.
 */
let additional_in_use_paths_provider: (() => string[]) | undefined;

function canonicalize_path_for_settings(path_value: string): string {
   return path_value.replace(/\\/g, '/');
}

/**
 * Registers a function returning extra paths in use by other treeviews.
 * @param {() => string[]} provider_function - Returns absolute paths considered already used.
 */
export function set_additional_in_use_paths_provider(provider_function: () => string[]): void {
   additional_in_use_paths_provider = provider_function;
}

export type instruction_tree_view_constructor_params = {
   tree_view_id: string;
   path_config_key: string;
   root_display_label: string;
   set_path_command_id: string;
   root_item_id: string;
   profiles_config_key: string;
   manage_profiles_command_id?: string;
   path_array_index?: number;
   fixed_path?: string;
};

export type instruction_tree_view_constructor_provider = {
   context: vscode.ExtensionContext;
};

export class instruction_tree_view {
   readonly tree_data_provider: path_tree_data_provider;
   readonly synchronizer: instruction_file_synchronizer;
   readonly tree_view: vscode.TreeView<Path_Item>;
   private readonly tree_view_id: string;
   private readonly path_config_key: string;
   private readonly root_display_label: string;
   private readonly set_path_command_id: string;
   private readonly profiles_config_key: string;
   private readonly manage_profiles_command_id?: string;
   private readonly path_array_index?: number;
   private readonly fixed_path?: string;

   /**
    * @param {instruction_tree_view_constructor_params} params - Treeview configuration values.
    * @param {instruction_tree_view_constructor_provider} provider - Runtime provider dependencies.
    */
   constructor(
      params: instruction_tree_view_constructor_params,
      provider: instruction_tree_view_constructor_provider,
   ) {
      this.tree_view_id = params.tree_view_id;
      this.path_config_key = params.path_config_key;
      this.root_display_label = params.root_display_label;
      this.set_path_command_id = params.set_path_command_id;
      this.profiles_config_key = params.profiles_config_key;
      this.manage_profiles_command_id = params.manage_profiles_command_id;
      this.path_array_index = params.path_array_index;
      this.fixed_path = params.fixed_path;

      const data_provider_params: path_tree_data_provider_constructor_params = {
         path_config_key: this.path_config_key,
         root_display_label: this.root_display_label,
         set_path_command: this.set_path_command_id,
         root_item_id: params.root_item_id,
         path_array_index: this.path_array_index,
         fixed_path: this.fixed_path,
      };
      const data_provider_provider: path_tree_data_provider_constructor_provider = {
         context: provider.context,
      };

      this.tree_data_provider = new path_tree_data_provider(
         data_provider_params,
         data_provider_provider,
      );

      this.tree_view = vscode.window.createTreeView(this.tree_view_id, {
         treeDataProvider: this.tree_data_provider,
         manageCheckboxStateManually: true,
         showCollapseAll: true,
      });

      this.synchronizer = new instruction_file_synchronizer(this.tree_data_provider, this.tree_view);
   }

   async initialize(): Promise<void> {
      this.tree_view.message = 'Loading…';
      await this.tree_data_provider.populate_treeview_from_path();
      this.tree_view.message = this.tree_data_provider.load_error_message ?? 'Ready';
      this.tree_data_provider.refresh_tree_view();
   }

   async refresh(): Promise<void> {
      this.tree_data_provider.set_busy();
      this.tree_view.message = 'Refreshing…';
      await this.tree_data_provider.populate_treeview_from_path();
      this.tree_data_provider.refresh_tree_view();
      this.tree_data_provider.clear_busy();
      this.tree_view.message = this.tree_data_provider.load_error_message ?? 'Ready';
   }

   /**
    * Returns the set of paths (OS-aware normalized) currently in use by other treeviews.
    * Used to filter out already-used candidates from the QuickPick.
    * @returns {Set<string>} Normalized paths in use elsewhere.
    */
   private get_paths_in_use_elsewhere(): Set<string> {
      const configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
      const paths_in_use: Set<string> = new Set();

      const configured_user_path = configuration.get<string>(constants.USER_PATH_CONFIG_KEY) ?? '';
      const configured_workspace_paths = configuration.get<string[]>(constants.WORKSPACE_PATH_CONFIG_KEY, []);

      const collect_path = (raw_path: string, is_self: boolean) => {
         const trimmed = raw_path.trim();
         if (!trimmed || is_self) {
            return;
         }
         paths_in_use.add(normalize_path_for_comparison(trimmed));
      };

      const is_user_tree = this.path_array_index === undefined;
      collect_path(configured_user_path, is_user_tree);
      configured_workspace_paths.forEach((workspace_path, index_in_array) => {
         collect_path(workspace_path, !is_user_tree && index_in_array === this.path_array_index);
      });

      if (additional_in_use_paths_provider) {
         for (const additional_path of additional_in_use_paths_provider()) {
            collect_path(additional_path, false);
         }
      }

      return paths_in_use;
   }

   /**
    * Prompt the user to choose a path via QuickPick.
    * Suggests all hard-coded candidates discovered by `get_hard_coded_user_paths`,
    * excluding any already used by other treeviews. Falls back to a custom text input.
    * Re-prompts on invalid custom input with a visible error message.
    * @param {string} current_path_value - Currently configured path value, used as the default for custom input.
    * @returns {Promise<string | undefined>} The chosen path, or undefined if the user cancelled.
    */
   private async prompt_path_via_quick_pick(current_path_value: string): Promise<string | undefined> {
      const all_candidates = get_hard_coded_user_paths();
      const paths_in_use_elsewhere = this.get_paths_in_use_elsewhere();
      const available_candidates = all_candidates.filter(
         candidate_path => !paths_in_use_elsewhere.has(normalize_path_for_comparison(candidate_path))
      );
      const custom_option_label = '$(edit) Enter custom path...';

      let selected_label: string | undefined;
      if (available_candidates.length > 0) {
         const quick_pick_items: vscode.QuickPickItem[] = available_candidates.map(candidate_path => ({
            label: candidate_path,
            description: 'suggested'
         }));
         quick_pick_items.push({ label: custom_option_label });

         const picked = await vscode.window.showQuickPick(quick_pick_items, {
            title: `Select IFS ${this.root_display_label.toLowerCase()}`,
            placeHolder: 'Pick a suggested path or enter a custom one',
            ignoreFocusOut: true
         });
         if (!picked) {
            return undefined;
         }
         selected_label = picked.label;
      } else {
         IFS_notifier.notify_warning(
            'IFS: no hard-coded user instructions folders were found (or all are already used). Please enter a custom path.'
         );
         selected_label = custom_option_label;
      }

      if (selected_label !== custom_option_label) {
         return selected_label;
      }

      let default_value = current_path_value;
      while (true) {
         const entered = await vscode.window.showInputBox({
            prompt: `Enter IFS ${this.root_display_label.toLowerCase()}`,
            placeHolder: 'Absolute path to an existing folder',
            value: default_value,
            ignoreFocusOut: true
         });
         if (entered === undefined) {
            IFS_notifier.notify_info(
               `IFS: ${this.root_display_label.toLowerCase()} was not changed.`
            );
            return undefined;
         }
         const trimmed_entered_path = entered.trim();
         if (!trimmed_entered_path) {
            IFS_notifier.notify_error('IFS: path cannot be empty. Please try again.');
            default_value = trimmed_entered_path;
            continue;
         }
         if (!fs.existsSync(trimmed_entered_path)) {
            IFS_notifier.notify_error(
               `IFS: the path "${trimmed_entered_path}" does not exist on disk. Please enter an existing folder.`
            );
            default_value = trimmed_entered_path;
            continue;
         }
         if (paths_in_use_elsewhere.has(normalize_path_for_comparison(trimmed_entered_path))) {
            IFS_notifier.notify_error(
               `IFS: the path "${trimmed_entered_path}" is already used by another treeview. Please choose a different path.`
            );
            default_value = trimmed_entered_path;
            continue;
         }
         return trimmed_entered_path;
      }
   }

   /** @returns {vscode.Disposable} Command registration for setting the path via input box. */
   register_set_path_command(): vscode.Disposable {
      return vscode.commands.registerCommand(this.set_path_command_id, async () => {
         if (this.fixed_path !== undefined) {
            IFS_notifier.notify_info(
               'This path is auto-managed at startup and cannot be edited from this treeview.'
            );
            return;
         }

         const configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);

         let current_path_value: string;
         if (this.path_array_index !== undefined) {
            const paths_array = configuration
               .get<string[]>(this.path_config_key, [])
               .filter(stored_path => !!stored_path && stored_path.trim() !== '');
            current_path_value = paths_array[this.path_array_index] ?? '';
         } else {
            current_path_value = configuration.get<string>(this.path_config_key) ?? '';
         }

         const entered_path_value = await this.prompt_path_via_quick_pick(current_path_value);
         if (entered_path_value === undefined) {
            return;
         }

         // IFS settings always live in the User (Global) scope.
         const configuration_target = vscode.ConfigurationTarget.Global;

         if (this.path_array_index !== undefined) {
            const paths_array = configuration
               .get<string[]>(this.path_config_key, [])
               .filter(stored_path => !!stored_path && stored_path.trim() !== '');
            if (this.path_array_index < paths_array.length) {
               paths_array[this.path_array_index] = entered_path_value;
            } else {
               paths_array.push(entered_path_value);
            }
            const canonicalized_paths_array = paths_array.map(canonicalize_path_for_settings);
            await configuration.update(this.path_config_key, canonicalized_paths_array, configuration_target);
         } else {
            await configuration.update(this.path_config_key, canonicalize_path_for_settings(entered_path_value), configuration_target);
         }

         this.tree_data_provider.refresh_tree_view();
         IFS_notifier.notify_info(`IFS ${this.root_display_label.toLowerCase()} set to ${entered_path_value}`);
      });
   }

   /** Runs the profile quick pick for this tree without registering a command. */
   async manage_profiles(): Promise<void> {
      await show_profile_quick_pick(this.profiles_config_key, {
         get_current_active_entries: () => this.tree_data_provider.get_active_profile_entries(),
         activate_profile: (profile) => this.synchronizer.activate_profile(profile.name, profile.active_ifs),
      });
   }

   /** @returns {vscode.Disposable} Command registration for managing profiles via quick pick. */
   register_manage_profiles_command(): vscode.Disposable {
      return vscode.commands.registerCommand(this.manage_profiles_command_id!, async () => {
         await this.manage_profiles();
      });
   }

   /** @returns {vscode.Disposable[]} All disposables for context.subscriptions. */
   get_disposables(): vscode.Disposable[] {
      const disposables: vscode.Disposable[] = [
         this.tree_view,
         this.create_checkbox_change_handler(),
         this.synchronizer.subscribe_to_configuration_changes(),
         this.register_set_path_command(),
      ];
      if (this.manage_profiles_command_id) {
         disposables.push(this.register_manage_profiles_command());
      }
      return disposables;
   }

   /** @returns {vscode.Disposable} Subscription for checkbox state changes in this tree view. */
   private create_checkbox_change_handler(): vscode.Disposable {
      return this.tree_view.onDidChangeCheckboxState(async event => {
         if (this.tree_data_provider.is_busy) {
            return;
         }

         const is_descendant_path = (ancestor: string, descendant: string): boolean => {
            const relative_path = path.relative(ancestor, descendant);
            return relative_path !== '' && !relative_path.startsWith('..') && !path.isAbsolute(relative_path);
         };

         for (const [changed_item, state] of event.items) {
            if (!changed_item.path) {
               continue;
            }

            const has_ancestor_changed = event.items.some(([other_item]) => {
               return other_item.path !== changed_item.path && other_item.path && is_descendant_path(other_item.path, changed_item.path);
            });

            if (has_ancestor_changed) {
               continue;
            }

            await this.synchronizer.set_item_state(changed_item, state === vscode.TreeItemCheckboxState.Checked);
         }
      });
   }
}
