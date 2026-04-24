import * as vscode from 'vscode';
import { Profile, Profile_Entry } from './Profile';
import * as constants from './constants';
import { IFS_notifier } from './notifier';

interface profile_quick_pick_item extends vscode.QuickPickItem {
   profile?: Profile;
   is_add_new?: boolean;
}

/**
 * @param {Profile[]} saved_profiles - Current list of profiles from settings.
 * @returns {profile_quick_pick_item[]} Quick Pick items including the "add new" entry.
 */
function build_quick_pick_items(saved_profiles: Profile[]): profile_quick_pick_item[] {
   const add_new_item: profile_quick_pick_item = {
      label: '$(add) Add Profile',
      description: 'Save current tree state as a new profile',
      is_add_new: true,
      alwaysShow: true,
   };

   const profile_items: profile_quick_pick_item[] = saved_profiles.map(profile => ({
      label: profile.name,
      description: `${profile.active_ifs.length} instruction file(s)`,
      profile,
      buttons: [
         { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Rename' },
         { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Delete' },
      ],
   }));

   return [add_new_item, ...profile_items];
}

interface raw_profile_entry {
   absolute_path: string;
   basename: string;
}

interface raw_profile {
   name: string;
   active_ifs: raw_profile_entry[];
}

/**
 * @param {string} profiles_config_key - Settings key for this tree's profiles (e.g. 'profiles.user').
 * @returns {Profile[]} All profiles stored in the VS Code configuration.
 */
export function load_profiles_from_settings(profiles_config_key: string): Profile[] {
   const configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
   const raw_profiles = configuration.get<raw_profile[]>(profiles_config_key, []);
   return raw_profiles.map(raw => new Profile(
      raw.name,
      (raw.active_ifs ?? []).map(entry => ({
         absolute_path: entry.absolute_path,
         basename: entry.basename,
      })),
   ));
}

/**
 * @param {string} profiles_config_key - Settings key for this tree's profiles (e.g. 'profiles.user').
 * @param {Profile[]} profiles - The full list of profiles to persist.
 */
export async function save_profiles_to_settings(profiles_config_key: string, profiles: Profile[]): Promise<void> {
   const configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
   const serializable_profiles: raw_profile[] = profiles.map(profile => ({
      name: profile.name,
      active_ifs: profile.active_ifs.map(entry => ({
         absolute_path: entry.absolute_path.replace(/\\/g, '/'),
         basename: entry.basename,
      })),
   }));

   // IFS settings always live in the User (Global) scope.
   const configuration_target = vscode.ConfigurationTarget.Global;

   await configuration.update(profiles_config_key, serializable_profiles, configuration_target);
}

export interface profile_manager_callbacks {
   get_current_active_entries: () => Profile_Entry[];
   activate_profile: (profile: Profile) => Promise<void>;
}

/**
 * @param {string} profiles_config_key - Settings key for this tree's profiles.
 * @param {profile_manager_callbacks} callbacks - Hooks into the tree data provider for reading/writing state.
 */
export async function show_profile_quick_pick(profiles_config_key: string, callbacks: profile_manager_callbacks): Promise<void> {
   const saved_profiles = load_profiles_from_settings(profiles_config_key);
   const quick_pick = vscode.window.createQuickPick<profile_quick_pick_item>();
   quick_pick.title = 'Profiles';
   quick_pick.placeholder = 'Select a profile to activate';
   quick_pick.items = build_quick_pick_items(saved_profiles);
   quick_pick.matchOnDescription = true;

   quick_pick.onDidTriggerItemButton(async event => {
      const target_profile = event.item.profile;
      if (!target_profile) {
         return;
      }

      if (event.button.tooltip === 'Rename') {
         const new_name = await vscode.window.showInputBox({
            prompt: 'Enter new profile name',
            value: target_profile.name,
            ignoreFocusOut: true,
            validateInput: (value) => {
               const trimmed = value.trim();
               if (!trimmed) {
                  return 'Profile name cannot be empty';
               }
               const duplicate = saved_profiles.some(
                  profile => profile.name.toLowerCase() === trimmed.toLowerCase() && profile !== target_profile
               );
               if (duplicate) {
                  return 'A profile with this name already exists';
               }
               return undefined;
            },
         });

         if (new_name !== undefined) {
            target_profile.name = new_name.trim();
            await save_profiles_to_settings(profiles_config_key, saved_profiles);
            quick_pick.items = build_quick_pick_items(saved_profiles);
         }
      }

      if (event.button.tooltip === 'Delete') {
         const confirmation = await vscode.window.showWarningMessage(
            `Delete profile "${target_profile.name}"?`,
            { modal: true },
            'Delete',
         );

         if (confirmation === 'Delete') {
            const filtered_profiles = saved_profiles.filter(profile => profile !== target_profile);
            await save_profiles_to_settings(profiles_config_key, filtered_profiles);
            saved_profiles.length = 0;
            saved_profiles.push(...filtered_profiles);
            quick_pick.items = build_quick_pick_items(saved_profiles);
         }
      }
   });

   quick_pick.onDidAccept(async () => {
      const selected_item = quick_pick.selectedItems[0];
      if (!selected_item) {
         return;
      }

      quick_pick.hide();

      if (selected_item.is_add_new) {
         const profile_name = await vscode.window.showInputBox({
            prompt: 'Enter a name for the new profile',
            ignoreFocusOut: true,
            validateInput: (value) => {
               const trimmed = value.trim();
               if (!trimmed) {
                  return 'Profile name cannot be empty';
               }
               const duplicate = saved_profiles.some(
                  profile => profile.name.toLowerCase() === trimmed.toLowerCase()
               );
               if (duplicate) {
                  return 'A profile with this name already exists';
               }
               return undefined;
            },
         });

         if (profile_name === undefined) {
            return;
         }

         const current_active_entries = callbacks.get_current_active_entries();
         const new_profile = new Profile(profile_name, current_active_entries);
         saved_profiles.push(new_profile);
         await save_profiles_to_settings(profiles_config_key, saved_profiles);
         IFS_notifier.notify_info(`Profile "${new_profile.name}" saved.`);
         return;
      }

      if (selected_item.profile) {
         await callbacks.activate_profile(selected_item.profile);
      }
   });

   quick_pick.onDidHide(() => quick_pick.dispose());
   quick_pick.show();
}
