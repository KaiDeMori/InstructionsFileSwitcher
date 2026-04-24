import * as vscode from 'vscode';
import * as constants from './constants';

/**
 * Centralized helper for user-visible notifications and developer logging.
 *
 * - All `notify_*` calls go through here so that a single setting can mute the
 *   non-error popups, and a single setting can route a copy of every message
 *   to the IFS Output channel.
 * - Errors are ALWAYS shown in the VSCode UI (the `hideAll` setting only
 *   applies to info + warning popups).
 * - Modal/interactive dialogs (e.g. delete confirmations) must keep using the
 *   raw `vscode.window.show*Message` API; they are not routed through here.
 */
class IFS_notifier_class {
   private output_channel: vscode.OutputChannel | undefined;

   public initialize(extension_context: vscode.ExtensionContext): void {
      if (this.output_channel === undefined) {
         this.output_channel = vscode.window.createOutputChannel('IFS');
         extension_context.subscriptions.push(this.output_channel);
      }
   }

   public dispose(): void {
      this.output_channel?.dispose();
      this.output_channel = undefined;
   }

   private get_settings(): { hide_all_popups: boolean; logging_enabled: boolean } {
      const configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
      return {
         hide_all_popups: configuration.get<boolean>(constants.NOTIFICATIONS_HIDE_ALL_CONFIG_KEY, false),
         logging_enabled: configuration.get<boolean>(constants.LOGGING_ENABLED_CONFIG_KEY, false),
      };
   }

   private write_to_log(severity_label: string, message_text: string): void {
      if (this.output_channel === undefined) {
         return;
      }
      const timestamp = new Date().toISOString();
      this.output_channel.appendLine(`[${timestamp}] [${severity_label}] ${message_text}`);
   }

   public notify_info(message_text: string): void {
      const { hide_all_popups, logging_enabled } = this.get_settings();
      if (logging_enabled) {
         this.write_to_log('INFO', message_text);
      }
      if (!hide_all_popups) {
         void vscode.window.showInformationMessage(message_text);
      }
   }

   public notify_warning(message_text: string): void {
      const { hide_all_popups, logging_enabled } = this.get_settings();
      if (logging_enabled) {
         this.write_to_log('WARN', message_text);
      }
      if (!hide_all_popups) {
         void vscode.window.showWarningMessage(message_text);
      }
   }

   /**
    * Errors are always shown in the UI, regardless of the `hideAll` setting.
    * If logging is enabled, the IFS Output panel is also revealed.
    */
   public notify_error(message_text: string): void {
      const { logging_enabled } = this.get_settings();
      if (logging_enabled) {
         this.write_to_log('ERROR', message_text);
         this.output_channel?.show(true);
      }
      void vscode.window.showErrorMessage(message_text);
   }

   /**
    * Logs to the IFS Output channel only (no popup), if logging is enabled.
    * Use for trace/debug breadcrumbs that would otherwise be silent returns.
    * `severity_label` defaults to `DEBUG` but accepts e.g. `ERROR` for spots
    * that show their own UI (e.g. modal dialog) yet still want a log entry.
    */
   public log_debug(message_text: string, severity_label: string = 'DEBUG'): void {
      const { logging_enabled } = this.get_settings();
      if (!logging_enabled) {
         return;
      }
      this.write_to_log(severity_label, message_text);
      if (severity_label === 'ERROR') {
         this.output_channel?.show(true);
      }
   }
}

export const IFS_notifier = new IFS_notifier_class();
