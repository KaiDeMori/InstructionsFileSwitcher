# Treeview decorations

## What can be decorated in a Tree View

- `TreeItem.iconPath`
  - Tree items can show icons for light and dark themes.
  - Use `iconPath` on a `TreeItem` to set the node icon.

- `view/title`
  - Actions shown in the view title bar.
  - Primary actions use `group: "navigation"`.
  - Secondary actions appear in the `...` menu.

- `view/item/context`
  - Actions shown for each tree item in the item context menu.
  - Inline actions use `group: "inline"` and appear next to the item.
  - Other actions appear in the item `...` menu.

- Menu grouping and separators
  - Use `group` values to order actions.
  - Add `@n` to `group` values for explicit order, e.g. `navigation@3`.
  - Groups are shown as separator blocks in the menu.

## Minimal examples

```json
"commands": [
  {
    "command": "myView.refresh",
    "title": "Refresh",
    "icon": {
      "light": "resources/light/refresh.svg",
      "dark": "resources/dark/refresh.svg"
    }
  },
  {
    "command": "myView.profiles",
    "title": "Profiles"
  }
],
"menus": {
  "view/title": [
    {
      "command": "myView.refresh",
      "when": "view == myView",
      "group": "navigation"
    },
    {
      "command": "myView.profiles",
      "when": "view == myView",
    }
  ],
  "view/item/context": [
    {
      "command": "myView.openItem",
      "when": "view == myView && viewItem == myItem",
      "group": "inline"
    }
  ]
}
```

This adds a dummy `Profiles` entry to the view title `...` overflow menu. If the command exists in `package.json` and is registered in the extension, it will show under the view title actions menu.

```ts
const item = new vscode.TreeItem('label', vscode.TreeItemCollapsibleState.None);
item.iconPath = {
  light: path.join(__filename, '..', 'resources', 'light', 'item.svg'),
  dark: path.join(__filename, '..', 'resources', 'dark', 'item.svg')
};
```
