import * as vscode from 'vscode';
import * as constants from './constants';
import { IFS_notifier } from './notifier';

interface reset_quick_pick_item extends vscode.QuickPickItem {
   action_id: reset_action_id;
}

type reset_action_id =
   | 'reset_user_path'
   | 'reset_workspace_paths'
   | 'reset_user_profiles'
   | 'reset_workspace_profiles'
   | 'reset_all_profiles'
   | 'reset_everything';

interface reset_action_descriptor {
   action_id: reset_action_id;
   label: string;
   description: string;
   confirmation_message: string;
   setting_keys_to_clear: string[];
}

const ALL_IFS_SETTING_KEYS: string[] = [
   constants.USER_PATH_CONFIG_KEY,
   constants.WORKSPACE_PATH_CONFIG_KEY,
   constants.ADDITIONAL_PATHS_CONFIG_KEY,
   constants.NOTIFICATIONS_HIDE_ALL_CONFIG_KEY,
   constants.LOGGING_ENABLED_CONFIG_KEY,
   constants.USER_PROFILES_CONFIG_KEY,
   constants.WORKSPACE_PROFILES_CONFIG_KEY,
];

const RESET_ACTION_DESCRIPTORS: reset_action_descriptor[] = [
   {
      action_id: 'reset_user_path',
      label: '$(home) Reset User Path',
      description: 'Clears ifs.paths.user',
      confirmation_message: 'Reset the IFS User Path setting to its default (empty)?',
      setting_keys_to_clear: [constants.USER_PATH_CONFIG_KEY],
   },
   {
      action_id: 'reset_workspace_paths',
      label: '$(folder) Reset Workspace Paths',
      description: 'Clears ifs.paths.additional and ifs.additionalPaths',
      confirmation_message: 'Reset all IFS Workspace Paths and the additional paths slot count to defaults?',
      setting_keys_to_clear: [
         constants.WORKSPACE_PATH_CONFIG_KEY,
         constants.ADDITIONAL_PATHS_CONFIG_KEY,
      ],
   },
   {
      action_id: 'reset_user_profiles',
      label: '$(person) Reset User Profiles',
      description: 'Clears ifs.profiles.user',
      confirmation_message: 'Delete ALL saved IFS User profiles? This cannot be undone.',
      setting_keys_to_clear: [constants.USER_PROFILES_CONFIG_KEY],
   },
   {
      action_id: 'reset_workspace_profiles',
      label: '$(briefcase) Reset Workspace Profiles',
      description: 'Clears ifs.profiles.additional',
      confirmation_message: 'Delete ALL saved IFS Workspace profiles? This cannot be undone.',
      setting_keys_to_clear: [constants.WORKSPACE_PROFILES_CONFIG_KEY],
   },
   {
      action_id: 'reset_all_profiles',
      label: '$(organization) Reset All Profiles',
      description: 'Clears both ifs.profiles.user and ifs.profiles.additional',
      confirmation_message: 'Delete ALL saved IFS profiles (user + workspace)? This cannot be undone.',
      setting_keys_to_clear: [
         constants.USER_PROFILES_CONFIG_KEY,
         constants.WORKSPACE_PROFILES_CONFIG_KEY,
      ],
   },
   {
      action_id: 'reset_everything',
      label: '$(trash) Reset All IFS Settings',
      description: 'Restores the extension to first-start state',
      confirmation_message: 'Reset ALL IFS settings (paths, profiles, notifications, logging) to defaults? This cannot be undone.',
      setting_keys_to_clear: ALL_IFS_SETTING_KEYS,
   },
];

async function clear_single_setting_in_all_targets(setting_key: string): Promise<void> {
   const configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);

   // Primary target: User (Global) \u2014 this is where IFS writes everything.
   await configuration.update(setting_key, undefined, vscode.ConfigurationTarget.Global);

   // Defensive cleanup: also try Workspace and WorkspaceFolder scopes for any
   // legacy or hand-edited overrides. Application-scoped settings (declared
   // with `"scope": "application"` in package.json) reject Workspace writes,
   // so each best-effort attempt must swallow its own error.
   if (vscode.workspace.workspaceFolders?.length) {
      try {
         await configuration.update(setting_key, undefined, vscode.ConfigurationTarget.Workspace);
      } catch {
         // Expected for application-scoped settings; ignore.
      }
      try {
         await configuration.update(setting_key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
      } catch {
         // Expected for application-scoped settings; ignore.
      }
   }
}

async function execute_reset_action(action_descriptor: reset_action_descriptor): Promise<void> {
   const user_choice = await vscode.window.showWarningMessage(
      action_descriptor.confirmation_message,
      { modal: true },
      'Reset',
   );

   if (user_choice !== 'Reset') {
      return;
   }

   const failed_setting_keys: string[] = [];

   for (const setting_key of action_descriptor.setting_keys_to_clear) {
      try {
         await clear_single_setting_in_all_targets(setting_key);
      } catch (error_object) {
         const error_message = error_object instanceof Error ? error_object.message : String(error_object);
         IFS_notifier.notify_error(`IFS: failed to reset "${setting_key}": ${error_message}`);
         failed_setting_keys.push(setting_key);
         // Continue clearing the remaining keys so a single failure
         // never leaves the rest of the reset half-finished.
      }
   }

   const reset_complete_message = failed_setting_keys.length === 0
      ? `IFS: reset complete. Reload the window for all changes to take full effect.`
      : `IFS: reset finished with ${failed_setting_keys.length} failed key(s): ${failed_setting_keys.join(', ')}. Reload the window for the rest to take full effect.`;

   const reload_choice = await vscode.window.showInformationMessage(
      reset_complete_message,
      'Reload Window',
   );

   if (reload_choice === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
   }
}

export async function show_reset_settings_quick_pick(): Promise<void> {
   const quick_pick_items: reset_quick_pick_item[] = RESET_ACTION_DESCRIPTORS.map(action_descriptor => ({
      label: action_descriptor.label,
      description: action_descriptor.description,
      action_id: action_descriptor.action_id,
   }));

   const selected_item = await vscode.window.showQuickPick(quick_pick_items, {
      title: 'IFS: Reset Settings',
      placeHolder: 'Choose what to reset (a confirmation dialog will follow)',
      ignoreFocusOut: true,
      matchOnDescription: true,
   });

   if (!selected_item) {
      return;
   }

   const matching_action_descriptor = RESET_ACTION_DESCRIPTORS.find(
      descriptor => descriptor.action_id === selected_item.action_id,
   );

   if (!matching_action_descriptor) {
      return;
   }

   await execute_reset_action(matching_action_descriptor);
}
