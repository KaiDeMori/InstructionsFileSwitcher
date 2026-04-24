export class Path_Item {
   path: string;
   label: string;
   isDirectory: boolean;
   checked?: boolean;
   error?: boolean;
   placeholder?: boolean;
   is_root?: boolean;
   description?: string;

   /**
    * @param {string} path_ - Filesystem path of the tree item.
    * @param {string} label - Display label for the tree item.
    * @param {string} [description] - Optional description text.
    * @param {boolean} [checked] - Checkbox state for the item.
    * @param {boolean} is_directory - Whether the item represents a directory.
    * @param {boolean} [error] - Whether the item represents an error state.
    * @param {boolean} [placeholder] - Whether this item is only a placeholder.
    * @param {boolean} [is_root] - Whether this item is the configured root placeholder.
    */
   constructor(
      path_: string,
      label: string,
      description?: string,
      checked?: boolean,
      is_directory: boolean = false,
      error: boolean = false,
      placeholder: boolean = false,
      is_root: boolean = false,
   ) {
      this.path = path_;
      this.label = label;
      this.description = description;
      this.checked = checked;
      this.isDirectory = is_directory;
      this.error = error;
      this.placeholder = placeholder;
      this.is_root = is_root;
   }
}
