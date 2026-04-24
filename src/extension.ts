import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Path_Item } from './Path_Item';
import * as constants from './constants';
import * as fshelpers from './filesystem-helpers';
import { instruction_tree_view, set_additional_in_use_paths_provider } from './instruction_tree_view';
import { load_profiles_from_settings, save_profiles_to_settings } from './profile_manager';
import { show_reset_settings_quick_pick } from './reset_settings';
import { is_active_instruction_file, is_deactivated_instruction_file } from './instruction_file_synchronizer';
import { strip_instruction_extension } from './path_tree_data_provider';
import {
   has_invalid_filename_characters_for_current_os,
   normalize_path_for_comparison,
} from './os_platform_helpers';
import { IFS_notifier } from './notifier';

type workspace_tree_title_descriptor = {
   tree_view_instance: instruction_tree_view;
   title_mode: 'auto' | 'manual';
   auto_tree_view_title?: string;
   workspace_path_array_index?: number;
};

type indexed_workspace_path_descriptor = {
   path_array_index: number;
   configured_path: string;
};

interface primary_user_path_quick_pick_item extends vscode.QuickPickItem {
   absolute_path: string;
}


function get_manual_tree_view_title(configured_path: string): string {
   if (configured_path.trim() === '') {
      return 'unused';
   }
   return path.basename(configured_path) || configured_path;
}

function get_configuration_target(): vscode.ConfigurationTarget {
   // IFS settings always live in the User (Global) scope so they follow the
   // user across every window and workspace, regardless of whether one is open.
   return vscode.ConfigurationTarget.Global;
}

function canonicalize_path_for_settings(path_value: string): string {
   return path_value.replace(/\\/g, '/');
}

function get_hard_coded_user_tree_view_title(path_value: string): string {
   return `USER/${path.basename(path_value) || path_value}`;
}

async function resolve_primary_user_path_for_startup(
   configured_user_path: string,
   hard_coded_user_paths: string[],
): Promise<string> {
   if (configured_user_path !== '' && fs.existsSync(configured_user_path)) {
      return configured_user_path;
   }

   if (hard_coded_user_paths.length === 0) {
      return '';
   }

   if (hard_coded_user_paths.length === 1) {
      return hard_coded_user_paths[0];
   }

   const quick_pick_items: primary_user_path_quick_pick_item[] = hard_coded_user_paths.map(path_value => ({
      label: path_value,
      description: 'existing hard-coded USER path',
      absolute_path: path_value,
   }));

   const picked_item = await vscode.window.showQuickPick(quick_pick_items, {
      title: 'Select Primary USER PATH',
      placeHolder: 'Choose the path to use as IFS User Path',
      ignoreFocusOut: true,
      canPickMany: false,
   });

   return picked_item?.absolute_path ?? '';
}



export async function activate(context: vscode.ExtensionContext) {
   IFS_notifier.initialize(context);

   const user_tree = new instruction_tree_view(
      {
         tree_view_id: constants.TREE_VIEW_ID,
         path_config_key: constants.USER_PATH_CONFIG_KEY,
         root_display_label: 'User Path',
         set_path_command_id: constants.SET_USER_PATH_COMMAND,
         root_item_id: constants.IFS_USER_PATH_ROOT,
         profiles_config_key: constants.USER_PROFILES_CONFIG_KEY,
         manage_profiles_command_id: constants.MANAGE_PROFILES_COMMAND,
      },
      {
         context,
      },
   );

   const configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
   const configuration_target = get_configuration_target();

   const configured_user_path = (configuration.get<string>(constants.USER_PATH_CONFIG_KEY) ?? '').trim();
   const hard_coded_user_paths = fshelpers.get_hard_coded_user_paths();
   const primary_user_path = await resolve_primary_user_path_for_startup(configured_user_path, hard_coded_user_paths);

   if (primary_user_path !== configured_user_path) {
      await configuration.update(
         constants.USER_PATH_CONFIG_KEY,
         primary_user_path === '' ? '' : canonicalize_path_for_settings(primary_user_path),
         configuration_target,
      );
   }

   const normalized_primary_user_path = primary_user_path === ''
      ? undefined
      : normalize_path_for_comparison(primary_user_path);

   const combined_auto_workspace_entries: fshelpers.autopopulated_entry[] = [];
   const normalized_auto_workspace_paths = new Set<string>();

   if (normalized_primary_user_path) {
      normalized_auto_workspace_paths.add(normalized_primary_user_path);
   }

   for (const hard_coded_user_path of hard_coded_user_paths) {
      const normalized_path = normalize_path_for_comparison(hard_coded_user_path);
      if (normalized_auto_workspace_paths.has(normalized_path)) {
         continue;
      }
      normalized_auto_workspace_paths.add(normalized_path);
      combined_auto_workspace_entries.push({
         absolute_path: hard_coded_user_path,
         label: path.basename(hard_coded_user_path) || hard_coded_user_path,
         tree_view_title: get_hard_coded_user_tree_view_title(hard_coded_user_path),
      });
   }

   for (const auto_populated_entry of fshelpers.create_autopopulated_entries()) {
      const normalized_path = normalize_path_for_comparison(auto_populated_entry.absolute_path);
      if (normalized_auto_workspace_paths.has(normalized_path)) {
         continue;
      }
      normalized_auto_workspace_paths.add(normalized_path);
      combined_auto_workspace_entries.push(auto_populated_entry);
   }

   const configured_workspace_paths = configuration
      .get<string[]>(constants.WORKSPACE_PATH_CONFIG_KEY, [])
      .filter(stored_path => !!stored_path && stored_path.trim() !== '');

   const existing_manual_workspace_paths: indexed_workspace_path_descriptor[] = [];
   const normalized_paths_in_use = new Set<string>(normalized_auto_workspace_paths);
   for (let workspace_path_index = 0; workspace_path_index < configured_workspace_paths.length; workspace_path_index++) {
      const configured_workspace_path = configured_workspace_paths[workspace_path_index];
      if (!fs.existsSync(configured_workspace_path)) {
         continue;
      }
      const normalized_path = normalize_path_for_comparison(configured_workspace_path);
      if (normalized_paths_in_use.has(normalized_path)) {
         continue;
      }
      normalized_paths_in_use.add(normalized_path);
      existing_manual_workspace_paths.push({
         path_array_index: workspace_path_index,
         configured_path: configured_workspace_path,
      });
   }

   const configured_additional_paths_value = configuration.get<number>(
      constants.ADDITIONAL_PATHS_CONFIG_KEY,
      constants.ADDITIONAL_PATHS_DEFAULT,
   );
   const safe_numeric_additional_paths = Number.isFinite(configured_additional_paths_value)
      ? Math.floor(configured_additional_paths_value)
      : constants.ADDITIONAL_PATHS_DEFAULT;
   const additional_paths_count = Math.min(
      Math.max(safe_numeric_additional_paths, 0),
      constants.WORKSPACE_TREE_VIEW_HARD_LIMIT,
   );

   const requested_workspace_count =
      combined_auto_workspace_entries.length + existing_manual_workspace_paths.length + additional_paths_count;
   const active_workspace_count = Math.min(requested_workspace_count, constants.WORKSPACE_TREE_VIEW_HARD_LIMIT);

   if (requested_workspace_count > constants.WORKSPACE_TREE_VIEW_HARD_LIMIT) {
      IFS_notifier.notify_warning(
         `IFS: ${requested_workspace_count} workspace paths requested but the hard limit is ${constants.WORKSPACE_TREE_VIEW_HARD_LIMIT}. ` +
         `Only the first ${constants.WORKSPACE_TREE_VIEW_HARD_LIMIT} are shown. Remove extra paths in settings.`
      );
   }
   
   await vscode.commands.executeCommand('setContext', constants.WORKSPACE_VIEW_COUNT_CONTEXT_KEY, active_workspace_count);

   const workspace_trees: instruction_tree_view[] = [];
   const workspace_tree_title_descriptors: workspace_tree_title_descriptor[] = [];
   let tree_index = 0;

   for (const entry of combined_auto_workspace_entries) {
      if (tree_index >= active_workspace_count) {
         break;
      }
      const workspace_tree = new instruction_tree_view(
         {
            tree_view_id: `${constants.WORKSPACE_TREE_VIEW_ID_PREFIX}${tree_index}`,
            path_config_key: constants.WORKSPACE_PATH_CONFIG_KEY,
            root_display_label: entry.label,
            set_path_command_id: `${constants.SET_WORKSPACE_PATH_COMMAND_PREFIX}${tree_index}`,
            root_item_id: `${constants.WORKSPACE_PATH_ROOT_KEY_PREFIX}_${tree_index}`,
            profiles_config_key: constants.WORKSPACE_PROFILES_CONFIG_KEY,
            fixed_path: entry.absolute_path,
         },
         {
            context,
         },
      );
      workspace_tree.tree_view.title = entry.tree_view_title;
      workspace_trees.push(workspace_tree);
      workspace_tree_title_descriptors.push({
         tree_view_instance: workspace_tree,
         title_mode: 'auto',
         auto_tree_view_title: entry.tree_view_title,
      });
      tree_index++;
   }

   for (const existing_manual_workspace_path of existing_manual_workspace_paths) {
      if (tree_index >= active_workspace_count) {
         break;
      }
      const workspace_tree = new instruction_tree_view(
         {
            tree_view_id: `${constants.WORKSPACE_TREE_VIEW_ID_PREFIX}${tree_index}`,
            path_config_key: constants.WORKSPACE_PATH_CONFIG_KEY,
            root_display_label: `IFS Workspace ${tree_index + 1}`,
            set_path_command_id: `${constants.SET_WORKSPACE_PATH_COMMAND_PREFIX}${tree_index}`,
            root_item_id: `${constants.WORKSPACE_PATH_ROOT_KEY_PREFIX}_${tree_index}`,
            profiles_config_key: constants.WORKSPACE_PROFILES_CONFIG_KEY,
            path_array_index: existing_manual_workspace_path.path_array_index,
         },
         {
            context,
         },
      );
      workspace_tree.tree_view.title = get_manual_tree_view_title(existing_manual_workspace_path.configured_path);
      workspace_trees.push(workspace_tree);
      workspace_tree_title_descriptors.push({
         tree_view_instance: workspace_tree,
         title_mode: 'manual',
         workspace_path_array_index: existing_manual_workspace_path.path_array_index,
      });
      tree_index++;
   }

   let additional_slot_index = 0;
   while (tree_index < active_workspace_count) {
      const empty_array_index = configured_workspace_paths.length + additional_slot_index;
      const workspace_tree = new instruction_tree_view(
         {
            tree_view_id: `${constants.WORKSPACE_TREE_VIEW_ID_PREFIX}${tree_index}`,
            path_config_key: constants.WORKSPACE_PATH_CONFIG_KEY,
            root_display_label: `Workspace ${tree_index + 1}`,
            set_path_command_id: `${constants.SET_WORKSPACE_PATH_COMMAND_PREFIX}${tree_index}`,
            root_item_id: `${constants.WORKSPACE_PATH_ROOT_KEY_PREFIX}_${tree_index}`,
            profiles_config_key: constants.WORKSPACE_PROFILES_CONFIG_KEY,
            path_array_index: empty_array_index,
         },
         {
            context,
         },
      );
      workspace_tree.tree_view.title = 'unused';
      workspace_trees.push(workspace_tree);
      workspace_tree_title_descriptors.push({
         tree_view_instance: workspace_tree,
         title_mode: 'manual',
         workspace_path_array_index: empty_array_index,
      });
      tree_index++;
      additional_slot_index++;
   }

   const all_trees = [user_tree, ...workspace_trees];

   const refresh_tree_view_titles = (): void => {
      const title_configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
      const configured_user_path = title_configuration.get<string>(constants.USER_PATH_CONFIG_KEY) ?? '';
      user_tree.tree_view.title = get_manual_tree_view_title(configured_user_path);

      const configured_workspace_paths = title_configuration
         .get<string[]>(constants.WORKSPACE_PATH_CONFIG_KEY, [])
         .filter(stored_path => !!stored_path && stored_path.trim() !== '');

      for (const workspace_tree_title_descriptor of workspace_tree_title_descriptors) {
         if (workspace_tree_title_descriptor.title_mode === 'auto') {
            workspace_tree_title_descriptor.tree_view_instance.tree_view.title =
               workspace_tree_title_descriptor.auto_tree_view_title ?? 'unused';
            continue;
         }

         const manual_workspace_path = workspace_tree_title_descriptor.workspace_path_array_index !== undefined
            ? configured_workspace_paths[workspace_tree_title_descriptor.workspace_path_array_index] ?? ''
            : '';
         workspace_tree_title_descriptor.tree_view_instance.tree_view.title = get_manual_tree_view_title(manual_workspace_path);
      }
   };

   refresh_tree_view_titles();

   /**
    * Find the tree whose configured path is an ancestor of the given item's path.
    * @param {instruction_tree_view[]} trees - All registered trees.
    * @param {Path_Item} item - Tree item that was acted on.
    * @returns {instruction_tree_view | undefined} The owning tree, or undefined if not found.
    */
   const find_owning_tree = (trees: instruction_tree_view[], item: Path_Item): instruction_tree_view | undefined => {
      if (!item.path) {
         return undefined;
      }
      const normalized_item_path = normalize_path_for_comparison(item.path);
      for (const tree of trees) {
         const tree_configured_path = tree.tree_data_provider.get_configured_path();
         if (!tree_configured_path) {
            continue;
         }
         const normalized_tree_path = normalize_path_for_comparison(tree_configured_path);
         if (normalized_item_path === normalized_tree_path) {
            return tree;
         }
         const relative_path = path.relative(normalized_tree_path, normalized_item_path);
         if (relative_path && !relative_path.startsWith('..') && !path.isAbsolute(relative_path)) {
            return tree;
         }
      }
      return undefined;
   };

   /**
    * Returns absolute fixed paths for trees that aren't tracked in `ifs.paths.user`/`ifs.paths.additional`
    * (i.e. auto-populated from `chat.instructionsFilesLocations`). Used by the per-tree set-path dupe check.
    * @returns {string[]} Absolute paths.
    */
   const collect_fixed_workspace_paths = (): string[] =>
      combined_auto_workspace_entries.map(entry => entry.absolute_path);

   set_additional_in_use_paths_provider(collect_fixed_workspace_paths);

   /**
    * Detects treeviews configured with the same path. Returns groups of identifiers sharing each path.
    * @returns {{ display_path: string; tree_identifiers: string[] }[]} Duplicate groups (size >= 2 only).
    */
   const find_duplicate_path_groups = (): { display_path: string; tree_identifiers: string[] }[] => {
      const groups_by_normalized_path = new Map<string, { display_path: string; tree_identifiers: string[] }>();
      for (const tree of all_trees) {
         const tree_configured_path = tree.tree_data_provider.get_configured_path();
         if (!tree_configured_path || tree_configured_path.trim() === '') {
            continue;
         }
         const normalized_path = normalize_path_for_comparison(tree_configured_path);
         const tree_identifier = tree.tree_view.title || 'IFS treeview';
         const existing_group = groups_by_normalized_path.get(normalized_path);
         if (existing_group) {
            existing_group.tree_identifiers.push(tree_identifier);
         } else {
            groups_by_normalized_path.set(normalized_path, {
               display_path: tree_configured_path,
               tree_identifiers: [tree_identifier]
            });
         }
      }
      return [...groups_by_normalized_path.values()].filter(group => group.tree_identifiers.length > 1);
   };

   const duplicate_path_groups = find_duplicate_path_groups();
   if (duplicate_path_groups.length > 0) {
      const duplicate_lines = duplicate_path_groups
         .map(group => `\u2022 ${group.display_path}\n   used by: ${group.tree_identifiers.join(', ')}`)
         .join('\n');
      const duplicate_paths_message = `IFS: duplicate paths detected across treeviews. Loading aborted. Please remove the duplicates in settings.\n${duplicate_lines}`;
      IFS_notifier.log_debug(duplicate_paths_message, 'ERROR');
      vscode.window.showErrorMessage(duplicate_paths_message, { modal: true });
      const abort_message = 'Loading aborted: duplicate paths across treeviews. See error notification.';
      for (const tree of all_trees) {
         tree.tree_data_provider.set_load_error(abort_message);
         tree.tree_view.message = abort_message;
      }
   } else {
      await user_tree.initialize();
      for (const tree of workspace_trees) {
         await tree.initialize();
      }
   }

   const toggle_checkbox_command_registration = vscode.commands.registerCommand(constants.TOGGLE_CHECKBOX_COMMAND, async (changed_item: Path_Item) => {
      const owning_tree = find_owning_tree(all_trees, changed_item);
      if (owning_tree && !owning_tree.tree_data_provider.is_busy) {
         await owning_tree.synchronizer.toggle_item(changed_item);
      }
   });

   const rename_instruction_file_command_registration = vscode.commands.registerCommand(constants.RENAME_INSTRUCTION_FILE_COMMAND, async (item: Path_Item) => {
      if (!item || !item.path || item.isDirectory) {
         return;
      }

      const old_basename = path.basename(item.path);
      const old_name_without_extension = strip_instruction_extension(old_basename);
      const file_was_active = is_active_instruction_file(item.path);
      const file_was_deactivated = is_deactivated_instruction_file(item.path);
      if (!file_was_active && !file_was_deactivated) {
         return;
      }
      const preserved_extension = file_was_active
         ? constants.INSTRUCTION_FILE_EXTENSION
         : constants.IFS_DEACTIVATED_EXTENSION;

      const new_name = await vscode.window.showInputBox({
         prompt: 'Enter new name for the instruction file',
         value: old_name_without_extension,
         ignoreFocusOut: true,
         validateInput: (value) => {
            const trimmed = value.trim();
            if (!trimmed) {
               return 'Name cannot be empty';
            }
            if (has_invalid_filename_characters_for_current_os(trimmed)) {
               return 'Name contains invalid characters for this OS';
            }
            return undefined;
         }
      });

      if (new_name === undefined || new_name.trim() === old_name_without_extension) {
         return;
      }

      const new_basename = `${new_name.trim()}${preserved_extension}`;
      const new_file_path = path.join(path.dirname(item.path), new_basename);
      const sibling_other_state_path = path.join(
         path.dirname(item.path),
         `${new_name.trim()}${file_was_active ? constants.IFS_DEACTIVATED_EXTENSION : constants.INSTRUCTION_FILE_EXTENSION}`,
      );

      if (fs.existsSync(new_file_path) || fs.existsSync(sibling_other_state_path)) {
         IFS_notifier.notify_error(`A file named "${new_name.trim()}" already exists in this folder.`);
         return;
      }

      try {
         await fs.promises.rename(item.path, new_file_path);
      } catch (rename_error) {
         const rename_error_text = rename_error instanceof Error ? rename_error.message : String(rename_error);
         IFS_notifier.notify_error(`IFS: failed to rename "${old_basename}": ${rename_error_text}`);
         return;
      }

      const all_profiles_config_keys = [constants.USER_PROFILES_CONFIG_KEY, constants.WORKSPACE_PROFILES_CONFIG_KEY];
      const old_active_path = path.join(path.dirname(item.path), `${old_name_without_extension}${constants.INSTRUCTION_FILE_EXTENSION}`);
      for (const profiles_config_key of all_profiles_config_keys) {
         const saved_profiles = load_profiles_from_settings(profiles_config_key);
         let profiles_changed = false;
         for (const profile of saved_profiles) {
            for (const profile_entry of profile.active_ifs) {
               const entry_active_path = path.join(
                  profile_entry.absolute_path,
                  `${profile_entry.basename}${constants.INSTRUCTION_FILE_EXTENSION}`,
               );
               if (normalize_path_for_comparison(entry_active_path) === normalize_path_for_comparison(old_active_path)) {
                  profile_entry.absolute_path = path.dirname(item.path);
                  profile_entry.basename = new_name.trim();
                  profiles_changed = true;
               }
            }
         }
         if (profiles_changed) {
            await save_profiles_to_settings(profiles_config_key, saved_profiles);
         }
      }

      for (const tree of all_trees) {
         tree.tree_data_provider.refresh_tree_view();
      }
   });

   const open_instruction_file_command_registration = vscode.commands.registerCommand(constants.OPEN_INSTRUCTION_FILE_COMMAND, async (item: Path_Item) => {
      if (!item || !item.path || item.isDirectory) {
         return;
      }
      await vscode.window.showTextDocument(vscode.Uri.file(item.path));
   });

   const manage_workspace_profiles_command_registration = vscode.commands.registerCommand(constants.MANAGE_WORKSPACE_PROFILES_COMMAND, async () => {
      const active_workspace_tree = workspace_trees.find(tree => tree.tree_view.visible);
      if (active_workspace_tree) {
         await active_workspace_tree.manage_profiles();
         return;
      }
      IFS_notifier.notify_info('IFS: no workspace tree is currently visible. Open a workspace tree view first.');
   });

   const open_config_command_registration = vscode.commands.registerCommand(constants.OPEN_CONFIG_COMMAND, () => {
      vscode.commands.executeCommand('workbench.action.openSettings', `@ext:kaidemori.ifs`);
   });

   /**
    * Inline action on a tree's root item: opens the configured path in the OS file explorer.
    * @param {Path_Item} root_item - The clicked root tree item; its `path` field holds the configured path.
    * @returns {Promise<void>}
    */
   const open_path_in_explorer_registration = vscode.commands.registerCommand(
      constants.OPEN_PATH_IN_EXPLORER_COMMAND,
      async (root_item?: Path_Item): Promise<void> => {
         const tree_configured_path = root_item?.path;
         if (!tree_configured_path || tree_configured_path.trim() === '') {
            IFS_notifier.notify_error('IFS: path not configured for this tree.');
            return;
         }
         if (!fs.existsSync(tree_configured_path)) {
            IFS_notifier.notify_error(`IFS: path "${tree_configured_path}" does not exist on disk.`);
            return;
         }
         await vscode.env.openExternal(vscode.Uri.file(tree_configured_path));
      }
   );

   const refresh_tree_command_registration = vscode.commands.registerCommand(constants.REFRESH_TREE_COMMAND, async () => {
      await Promise.all(all_trees.map(tree => tree.refresh()));
   });

   const reset_settings_command_registration = vscode.commands.registerCommand(
      constants.RESET_SETTINGS_COMMAND,
      async () => {
         await show_reset_settings_quick_pick();
      },
   );

   const reload_prompt_config_listener = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(constants.USER_PATH_CONFIG) ||
         event.affectsConfiguration(constants.WORKSPACE_PATH_CONFIG)) {
         refresh_tree_view_titles();
      }

      if (event.affectsConfiguration(`${constants.CONFIG_SECTION}.${constants.ADDITIONAL_PATHS_CONFIG_KEY}`) ||
         event.affectsConfiguration('chat.instructionsFilesLocations') ||
         event.affectsConfiguration(constants.USER_PATH_CONFIG)) {
         vscode.window.showInformationMessage(
            'IFS: workspace tree configuration changed. Reload the window for changes to take effect.',
            'Reload Window'
         ).then(selection => {
            if (selection === 'Reload Window') {
               vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
         });
         IFS_notifier.log_debug('Workspace tree configuration changed; reload prompt shown.');
      }
   });

   context.subscriptions.push(
      ...user_tree.get_disposables(),
      ...workspace_trees.flatMap(tree => tree.get_disposables()),
      toggle_checkbox_command_registration,
      rename_instruction_file_command_registration,
      open_instruction_file_command_registration,
      manage_workspace_profiles_command_registration,
      open_config_command_registration,
      open_path_in_explorer_registration,
      refresh_tree_command_registration,
      reset_settings_command_registration,
      reload_prompt_config_listener,
   );
}

export function deactivate() {
   IFS_notifier.dispose();
}
