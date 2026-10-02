import * as vscode from 'vscode';
import * as constants from './constants';
import { IFS_notifier } from './notifier';

const TOGGLE_PROMPT_CACHE_TTL_COMMAND = `${constants.EXTENSION_ID}.toggle_prompt_cache_TTL`;
const CLAUDE_CODE_CONFIG_SECTION = 'claudeCode';
const ENVIRONMENT_VARIABLES_CONFIG_KEY = 'environmentVariables';
const PROMPT_CACHE_TTL_VARIABLE_NAME = 'CLAUDE_CODE_PROMPT_CACHE_TTL';
const SHORT_PROMPT_CACHE_TTL = '5m';

type environment_variable_entry = {
   name: string;
   value: string;
};

/**
 * Reads `claudeCode.environmentVariables` from the User (Global) scope only, because the toggle writes back to that scope.
 * @returns {environment_variable_entry[]} The user-level entries; empty if unset or malformed.
 */
function read_user_environment_variable_entries(): environment_variable_entry[] {
   const claude_code_configuration = vscode.workspace.getConfiguration(CLAUDE_CODE_CONFIG_SECTION);
   const user_environment_variables_value = claude_code_configuration
      .inspect<environment_variable_entry[]>(ENVIRONMENT_VARIABLES_CONFIG_KEY)?.globalValue;
   // Hand edits are not schema-checked; a malformed value must never break IFS activation.
   return Array.isArray(user_environment_variables_value) ? user_environment_variables_value : [];
}

function update_prompt_cache_TTL_status_bar_text(prompt_cache_TTL_status_bar_item: vscode.StatusBarItem): void {
   const prompt_cache_TTL_entry = read_user_environment_variable_entries()
      .find(environment_variable => environment_variable?.name === PROMPT_CACHE_TTL_VARIABLE_NAME);
   // `*60m` is Claude Code's default within plan usage. The asterisk marks the small print: on usage credits, the default is `5m`.
   prompt_cache_TTL_status_bar_item.text = `Cache: ${prompt_cache_TTL_entry?.value ?? '*60m'}`;
}

/**
 * Removes our entry if it exists, otherwise adds it with `5m`. All other entries are kept.
 * Removing the entry (instead of writing `1h`) hands the TTL back to Claude Code's default.
 */
async function toggle_prompt_cache_TTL(): Promise<void> {
   const user_environment_variable_entries = read_user_environment_variable_entries();
   const other_environment_variable_entries = user_environment_variable_entries
      .filter(environment_variable => environment_variable?.name !== PROMPT_CACHE_TTL_VARIABLE_NAME);
   const prompt_cache_TTL_entry_exists = other_environment_variable_entries.length !== user_environment_variable_entries.length;
   const updated_environment_variable_entries = prompt_cache_TTL_entry_exists
      ? other_environment_variable_entries
      : [...other_environment_variable_entries, { name: PROMPT_CACHE_TTL_VARIABLE_NAME, value: SHORT_PROMPT_CACHE_TTL }];

   try {
      // `undefined` removes the key from settings.json once no entries are left.
      await vscode.workspace.getConfiguration(CLAUDE_CODE_CONFIG_SECTION).update(
         ENVIRONMENT_VARIABLES_CONFIG_KEY,
         updated_environment_variable_entries.length === 0 ? undefined : updated_environment_variable_entries,
         vscode.ConfigurationTarget.Global,
      );
   } catch (update_error) {
      const update_error_text = update_error instanceof Error ? update_error.message : String(update_error);
      IFS_notifier.notify_error(`IFS: failed to switch the prompt cache TTL: ${update_error_text}`);
   }
}

/**
 * Creates the status bar item that toggles the Claude Code prompt cache TTL between `5m` and default.
 * The item shows what IFS set, not the effective TTL. A change applies to new sessions only.
 * @param {vscode.ExtensionContext} extension_context - Receives all disposables.
 */
export function create_prompt_cache_TTL_status_bar_item(extension_context: vscode.ExtensionContext): void {
   const prompt_cache_TTL_status_bar_item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
   prompt_cache_TTL_status_bar_item.command = TOGGLE_PROMPT_CACHE_TTL_COMMAND;
   prompt_cache_TTL_status_bar_item.tooltip = 'Switch the Claude Code prompt cache TTL between 5m and default. Applies to new sessions.';
   update_prompt_cache_TTL_status_bar_text(prompt_cache_TTL_status_bar_item);
   prompt_cache_TTL_status_bar_item.show();

   const toggle_prompt_cache_TTL_command_registration = vscode.commands.registerCommand(
      TOGGLE_PROMPT_CACHE_TTL_COMMAND,
      toggle_prompt_cache_TTL,
   );

   // Also fires for changes made in another window or in the Settings UI.
   const environment_variables_change_listener = vscode.workspace.onDidChangeConfiguration(configuration_change_event => {
      if (configuration_change_event.affectsConfiguration(`${CLAUDE_CODE_CONFIG_SECTION}.${ENVIRONMENT_VARIABLES_CONFIG_KEY}`)) {
         update_prompt_cache_TTL_status_bar_text(prompt_cache_TTL_status_bar_item);
      }
   });

   extension_context.subscriptions.push(
      prompt_cache_TTL_status_bar_item,
      toggle_prompt_cache_TTL_command_registration,
      environment_variables_change_listener,
   );
}
