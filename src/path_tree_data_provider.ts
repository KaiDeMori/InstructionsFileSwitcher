import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Path_Item } from './Path_Item';
import * as constants from './constants';

/**
 * @param {string} file_name - File name (with or without directory).
 * @returns {boolean} Whether the file uses the active instruction extension.
 */
export function is_active_instruction_file(file_name: string): boolean {
   return file_name.endsWith(constants.INSTRUCTION_FILE_EXTENSION)
      && !file_name.endsWith(constants.IFS_DEACTIVATED_EXTENSION);
}

/**
 * @param {string} file_name - File name (with or without directory).
 * @returns {boolean} Whether the file uses the deactivated instruction extension.
 */
export function is_deactivated_instruction_file(file_name: string): boolean {
   return file_name.endsWith(constants.IFS_DEACTIVATED_EXTENSION);
}

/**
 * @param {string} file_name - File name (with or without directory).
 * @returns {boolean} Whether the file is an instruction file (active or deactivated).
 */
export function is_instruction_file(file_name: string): boolean {
   return is_active_instruction_file(file_name) || is_deactivated_instruction_file(file_name);
}

/**
 * @param {string} file_basename - File basename including its extension.
 * @returns {string} The basename with whichever instruction extension stripped.
 */
export function strip_instruction_extension(file_basename: string): string {
   if (is_deactivated_instruction_file(file_basename)) {
      return file_basename.slice(0, -constants.IFS_DEACTIVATED_EXTENSION.length);
   }
   if (is_active_instruction_file(file_basename)) {
      return file_basename.slice(0, -constants.INSTRUCTION_FILE_EXTENSION.length);
   }
   return file_basename;
}

/**
 * @param {string} file_path - Full filesystem path to an instruction file (active or deactivated).
 * @returns {string} The corresponding active path.
 */
export function get_active_path_for(file_path: string): string {
   const directory = path.dirname(file_path);
   const basename_without_extension = strip_instruction_extension(path.basename(file_path));
   return path.join(directory, `${basename_without_extension}${constants.INSTRUCTION_FILE_EXTENSION}`);
}

/**
 * @param {string} file_path - Full filesystem path to an instruction file (active or deactivated).
 * @returns {string} The corresponding deactivated path.
 */
export function get_deactivated_path_for(file_path: string): string {
   const directory = path.dirname(file_path);
   const basename_without_extension = strip_instruction_extension(path.basename(file_path));
   return path.join(directory, `${basename_without_extension}${constants.IFS_DEACTIVATED_EXTENSION}`);
}

export type path_tree_data_provider_constructor_params = {
   path_config_key: string;
   root_display_label: string;
   set_path_command: string;
   root_item_id: string;
   path_array_index?: number;
   fixed_path?: string;
};

export type path_tree_data_provider_constructor_provider = {
   context: vscode.ExtensionContext;
};

export class path_tree_data_provider implements vscode.TreeDataProvider<Path_Item> {
   private readonly error_paths = new Set<string>();
   private readonly tree_data_change_subscription = new vscode.EventEmitter<Path_Item | undefined | null | void>();
   readonly onDidChangeTreeData = this.tree_data_change_subscription.event;
   private readonly enabled_icon_path: vscode.Uri;
   private readonly disabled_icon_path: vscode.Uri;
   private readonly path_config_key: string;
   private readonly root_display_label: string;
   private readonly set_path_command: string;
   private readonly root_item_id: string;
   private readonly path_array_index?: number;
   private readonly fixed_path?: string;
   private _is_busy = false;
   private _load_error_message: string | undefined;

   /** @returns {string | undefined} Last load error. Undefined when load succeeded. */
   get load_error_message(): string | undefined {
      return this._load_error_message;
   }

   /**
    * Forces a load-error state on this provider so the tree shows only the root + the error message.
    * @param {string} message - Error message to display in the tree view header.
    */
   set_load_error(message: string): void {
      this._load_error_message = message;
      this.refresh_tree_view();
   }

   /** @returns {boolean} Whether the provider is currently busy and should reject user interaction. */
   get is_busy(): boolean {
      return this._is_busy;
   }

   /**
    * @param {path_tree_data_provider_constructor_params} params - Provider configuration values.
    * @param {path_tree_data_provider_constructor_provider} provider - Runtime provider dependencies.
    */
   constructor(
      params: path_tree_data_provider_constructor_params,
      provider: path_tree_data_provider_constructor_provider,
   ) {
      this.path_config_key = params.path_config_key;
      this.root_display_label = params.root_display_label;
      this.set_path_command = params.set_path_command;
      this.root_item_id = params.root_item_id;
      this.path_array_index = params.path_array_index;
      this.fixed_path = params.fixed_path;

      this.enabled_icon_path = vscode.Uri.file(provider.context.asAbsolutePath(path.join('resources', 'ifs-enabled.svg')));
      this.disabled_icon_path = vscode.Uri.file(provider.context.asAbsolutePath(path.join('resources', 'ifs-disabled.svg')));
   }

   set_busy(): void {
      this._is_busy = true;
   }

   clear_busy(): void {
      this._is_busy = false;
   }

   refresh_tree_view(): void {
      this.tree_data_change_subscription.fire(undefined);
   }

   /** @param {string} file_path - Path to mark as having an error. */
   mark_error_path(file_path: string): void {
      this.error_paths.add(file_path);
   }

   /** @param {string} file_path - Path to clear the error flag from. */
   clear_error_path(file_path: string): void {
      this.error_paths.delete(file_path);
   }

   /** @returns {string[]} All paths currently in error state. */
   get_all_error_paths(): string[] {
      return [...this.error_paths];
   }

   async getTreeItem(element: Path_Item): Promise<vscode.TreeItem> {
      const tree_item = new vscode.TreeItem(
         element.label,
         element.isDirectory && !element.placeholder
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None
      );

      tree_item.tooltip = element.path || element.label;
      if (element.description) {
         tree_item.description = element.description;
      }

      if (element.is_root) {
         tree_item.id = this.root_item_id;
         tree_item.iconPath = new vscode.ThemeIcon('settings-gear');
         tree_item.contextValue = constants.TREE_ITEM_ROOT_CONTEXT;
         tree_item.command = {
            command: this.set_path_command,
            title: `Set ${this.root_display_label}`
         };
         return tree_item;
      }

      const checkbox_state = element.placeholder
         ? undefined
         : this.get_checkbox_state(element);

      tree_item.iconPath = element.placeholder
         ? undefined
         : element.error
            ? new vscode.ThemeIcon('error')
            : checkbox_state === vscode.TreeItemCheckboxState.Checked
               ? this.enabled_icon_path
               : this.disabled_icon_path;

      if (!element.placeholder) {
         tree_item.id = element.path;
         if (element.isDirectory) {
            tree_item.resourceUri = vscode.Uri.file(element.path);
         }
         tree_item.contextValue = element.isDirectory ? constants.TREE_ITEM_FOLDER_CONTEXT : constants.TREE_ITEM_FILE_CONTEXT;
         tree_item.checkboxState = checkbox_state ?? vscode.TreeItemCheckboxState.Unchecked;
         tree_item.command = {
            command: constants.TOGGLE_CHECKBOX_COMMAND,
            title: 'Toggle checkbox',
            arguments: [element]
         };
      }

      return tree_item;
   }

   async getChildren(element?: Path_Item): Promise<Path_Item[]> {
      const configured_path = this.get_configured_path();
      const root_label = configured_path && configured_path.trim() !== ''
         ? configured_path
         : 'unused';
      const root_item = new Path_Item(
         configured_path ?? '',
         root_label,
         undefined,
         undefined,
         false,
         false,
         false,
         true,
      );

      if (!configured_path) {
         return [root_item];
      }

      if (this._load_error_message) {
         return [root_item];
      }

      if (!element) {
         const stats = await this.get_stats(configured_path);
         if (!stats) {
            return [root_item, new Path_Item('', 'Configured path is invalid', undefined, undefined, false, true, true)];
         }
         return [root_item, ...await this.read_directory_children(configured_path)];
      }

      if (element.is_root || !element.isDirectory) {
         return [];
      }

      return this.read_directory_children(element.path);
   }

   get_configured_path(): string {
      if (this.fixed_path !== undefined) {
         return this.fixed_path;
      }
      const configuration = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
      if (this.path_array_index !== undefined) {
         const paths_array = configuration
            .get<string[]>(this.path_config_key, [])
            .filter(stored_path => !!stored_path && stored_path.trim() !== '');
         return paths_array[this.path_array_index] ?? '';
      }
      return configuration.get<string>(this.path_config_key) ?? '';
   }

   /** @returns {string} Full dotted config path (e.g. 'ifs.paths.user'). */
   get_full_config_path(): string {
      return `${constants.CONFIG_SECTION}.${this.path_config_key}`;
   }

   private async get_stats(target_path: string): Promise<fs.Stats | null> {
      if (!fs.existsSync(target_path)) {
         return null;
      }
      return fs.promises.stat(target_path);
   }

   private get_display_label(item_path: string, is_directory: boolean): string {
      const file_basename = path.basename(item_path) || item_path;
      return !is_directory ? strip_instruction_extension(file_basename) : file_basename;
   }

   private async read_directory_children(directory_path: string): Promise<Path_Item[]> {
      if (!fs.existsSync(directory_path)) {
         return [];
      }

      const directory_entries = await fs.promises.readdir(directory_path, { withFileTypes: true });
      const path_items: Path_Item[] = directory_entries
         .filter(directory_entry =>
            directory_entry.isDirectory() || is_instruction_file(directory_entry.name)
         )
         .map((directory_entry): Path_Item => {
            const full_path = path.join(directory_path, directory_entry.name);
            const is_directory = directory_entry.isDirectory();
            const checked = !is_directory && is_active_instruction_file(directory_entry.name);
            return new Path_Item(
               full_path,
               this.get_display_label(full_path, is_directory),
               undefined,
               checked,
               is_directory,
               this.error_paths.has(full_path)
            );
         });

      path_items.sort((a: Path_Item, b: Path_Item) => {
         if (a.isDirectory === b.isDirectory) {
            return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
         }
         return a.isDirectory ? -1 : 1;
      });

      return path_items;
   }

   /**
    * Recursively collects all instruction file paths under a directory.
    * @param {string} directory_path - Directory to scan.
    * @returns {string[]} Absolute paths to all instruction files (active and deactivated).
    */
   get_descendant_instruction_files(directory_path: string): string[] {
      if (!fs.existsSync(directory_path)) {
         return [];
      }

      const directory_entries = fs.readdirSync(directory_path, { withFileTypes: true });
      const descendant_paths: string[] = [];

      for (const directory_entry of directory_entries) {
         const child_path = path.join(directory_path, directory_entry.name);
         if (directory_entry.isDirectory()) {
            descendant_paths.push(...this.get_descendant_instruction_files(child_path));
         } else if (is_instruction_file(directory_entry.name)) {
            descendant_paths.push(child_path);
         }
      }
      return descendant_paths;
   }

   async populate_treeview_from_path(): Promise<void> {
      this._load_error_message = undefined;
      const configured_path = this.get_configured_path();
      const stats = await this.get_stats(configured_path);
      if (!configured_path || !stats?.isDirectory()) {
         return;
      }
      // Clear stale error markers for files no longer present.
      const all_present_files = new Set(this.get_descendant_instruction_files(configured_path));
      for (const error_path of [...this.error_paths]) {
         if (!all_present_files.has(error_path)) {
            this.error_paths.delete(error_path);
         }
      }
   }

   private are_all_descendants_active(directory_path: string): boolean {
      if (!fs.existsSync(directory_path)) {
         return false;
      }

      const directory_entries = fs.readdirSync(directory_path, { withFileTypes: true });
      let has_instruction_descendants = false;

      for (const directory_entry of directory_entries) {
         const child_path = path.join(directory_path, directory_entry.name);
         if (directory_entry.isDirectory()) {
            const child_has_instructions = this.get_descendant_instruction_files(child_path).length > 0;
            if (child_has_instructions) {
               has_instruction_descendants = true;
               if (!this.are_all_descendants_active(child_path)) {
                  return false;
               }
            }
         } else if (is_instruction_file(directory_entry.name)) {
            has_instruction_descendants = true;
            if (!is_active_instruction_file(directory_entry.name)) {
               return false;
            }
         }
      }

      return has_instruction_descendants;
   }

   private get_checkbox_state(element: Path_Item): vscode.TreeItemCheckboxState {
      if (!element.isDirectory) {
         return is_active_instruction_file(element.path)
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
      }

      return this.are_all_descendants_active(element.path)
         ? vscode.TreeItemCheckboxState.Checked
         : vscode.TreeItemCheckboxState.Unchecked;
   }

   /**
    * Returns all currently-active instruction files under the configured path as profile entries.
    * @returns {{ absolute_path: string; basename: string }[]} Active entries.
    */
   get_active_profile_entries(): { absolute_path: string; basename: string }[] {
      const configured_path = this.get_configured_path();
      if (!configured_path) {
         return [];
      }
      return this.get_descendant_instruction_files(configured_path)
         .filter(file_path => is_active_instruction_file(file_path))
         .map(file_path => ({
            absolute_path: path.dirname(file_path),
            basename: strip_instruction_extension(path.basename(file_path)),
         }));
   }

   /**
    * Returns the full filesystem state (every instruction file under root) as Path_Items.
    * @returns {Promise<Path_Item[]>} All instruction file items.
    */
   async get_all_instruction_file_items(): Promise<Path_Item[]> {
      const configured_path = this.get_configured_path();
      if (!configured_path) {
         return [];
      }
      const stats = await this.get_stats(configured_path);
      if (!stats?.isDirectory()) {
         return [];
      }
      return this.get_descendant_instruction_files(configured_path).map(file_path => new Path_Item(
         file_path,
         strip_instruction_extension(path.basename(file_path)),
         undefined,
         is_active_instruction_file(file_path),
         false,
         this.error_paths.has(file_path),
      ));
   }
}
